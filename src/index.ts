import type { ExtensionAPI, ExtensionContext, InputEvent, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
	getPlanModeToolNames,
	isSamePlanFilePath,
	getToolPath,
	isPlanFileWriteAllowed,
	isWriteLikeTool,
} from "./guardrails.js";
import { analyzePlanFileContent, createPlanScaffold, injectTaskSummaryIntoPlanContent } from "./plan-file.js";
import { buildPlanModeIntroText } from "./planning-context.js";
import {
	createDefaultState,
	createPlanFilePath,
	createPlanStateEntry,
	getPlanDisplayStatus,
	restoreStateFromSession,
	type PlanSessionState,
} from "./state.js";
import { loadToolDocs } from "./tool-docs.js";
import {
	askUserQuestion,
	confirmEnterPlanMode,
	confirmExitPlanMode,
	getAtomicQuestionViolation,
	notifyWarnings,
	updatePlanModeUi,
} from "./ui.js";

const ENTER_PLAN_MODE_PARAMS = Type.Object({
	reason: Type.Optional(Type.String({ description: "Why planning is needed before implementation" })),
	taskSummary: Type.Optional(Type.String({ description: "Short summary of the task to be planned" })),
});

const EXIT_PLAN_MODE_PARAMS = Type.Object({});

const ASK_USER_QUESTION_PARAMS = Type.Object({
	question: Type.String({ description: "The question that must be answered before work can continue confidently" }),
	context: Type.Optional(Type.String({ description: "Optional extra context for the question" })),
	options: Type.Optional(
		Type.Array(Type.String({ description: "Suggested answer option" }), {
			description: "Optional list of answer options to present",
		}),
	),
});

const DIRTY_EVIDENCE_TOOLS = new Set([
	"read",
	"grep",
	"find",
	"ls",
	"lsp",
	"ast_search",
	"web_search",
	"fetch_content",
	"get_search_content",
]);

function normalizeTaskSummary(taskSummary?: string): string | undefined {
	const normalized = taskSummary?.trim();
	return normalized && normalized.length > 0 ? normalized : undefined;
}

async function readPlanFile(planFilePath: string): Promise<string> {
	return readFile(planFilePath, "utf-8");
}

async function ensurePlanFileExists(planFilePath: string, taskSummary?: string): Promise<string> {
	await mkdir(dirname(planFilePath), { recursive: true });
	const normalizedTaskSummary = normalizeTaskSummary(taskSummary);

	try {
		await access(planFilePath);
		const currentContent = await readPlanFile(planFilePath);
		if (!normalizedTaskSummary) {
			return currentContent;
		}

		const updatedContent = injectTaskSummaryIntoPlanContent(currentContent, normalizedTaskSummary);
		if (updatedContent !== currentContent) {
			await writeFile(planFilePath, updatedContent, "utf-8");
			return updatedContent;
		}

		return currentContent;
	} catch {
		const initialContent = createPlanScaffold(normalizedTaskSummary);
		await writeFile(planFilePath, initialContent, "utf-8");
		return initialContent;
	}
}

function buildPlanningInstructionMessage(planFilePath: string, taskSummary?: string): string {
	return [
		"Plan mode is active.",
		`Active plan file: ${planFilePath}`,
		taskSummary ? `Task summary: ${taskSummary}` : "Task summary: waiting for the next real user task prompt.",
		"Only update the active plan file while plan mode is active.",
	].join("\n");
}

function getAllToolNames(pi: ExtensionAPI): string[] {
	return pi.getAllTools().map((tool) => tool.name);
}

function getPlanningTools(pi: ExtensionAPI): string[] {
	return getPlanModeToolNames(getAllToolNames(pi));
}

function getNormalTools(pi: ExtensionAPI, restoreTools: string[] | null): string[] {
	if (restoreTools && restoreTools.length > 0) {
		return [...restoreTools];
	}
	return getAllToolNames(pi);
}

function describeEvidenceSource(toolName: string, input: unknown): string {
	const path = getToolPath(input);
	if (path) {
		return `${toolName}: ${path}`;
	}

	if (typeof input !== "object" || input === null) {
		return toolName;
	}

	const candidate = input as {
		pattern?: unknown;
		query?: unknown;
		q?: unknown;
		url?: unknown;
		symbol?: unknown;
	};

	if (typeof candidate.pattern === "string" && candidate.pattern.trim().length > 0) {
		return `${toolName}: ${candidate.pattern.trim()}`;
	}
	if (typeof candidate.query === "string" && candidate.query.trim().length > 0) {
		return `${toolName}: ${candidate.query.trim()}`;
	}
	if (typeof candidate.q === "string" && candidate.q.trim().length > 0) {
		return `${toolName}: ${candidate.q.trim()}`;
	}
	if (typeof candidate.url === "string" && candidate.url.trim().length > 0) {
		return `${toolName}: ${candidate.url.trim()}`;
	}
	if (typeof candidate.symbol === "string" && candidate.symbol.trim().length > 0) {
		return `${toolName}: ${candidate.symbol.trim()}`;
	}

	return toolName;
}

function statesEqual(left: PlanSessionState, right: PlanSessionState): boolean {
	return (
		left.mode === right.mode &&
		left.planFilePath === right.planFilePath &&
		left.taskSummary === right.taskSummary &&
		left.planStatus === right.planStatus &&
		left.planNeedsSync === right.planNeedsSync &&
		left.lastPlanHash === right.lastPlanHash &&
		left.lastEvidenceSource === right.lastEvidenceSource
	);
}

function persistState(pi: ExtensionAPI, state: PlanSessionState): void {
	pi.appendEntry("pi-plan-state", createPlanStateEntry(state));
}

export default async function planModePackage(pi: ExtensionAPI): Promise<void> {
	const { docs, planModePrompt, warnings } = await loadToolDocs();
	let state = createDefaultState();
	let restoreTools: string[] | null = null;
	let planningIntroPending = false;

	const commitState = (ctx: ExtensionContext | undefined, nextState: PlanSessionState) => {
		if (statesEqual(state, nextState)) {
			return;
		}

		state = nextState;
		persistState(pi, state);
		if (ctx) {
			updatePlanModeUi(ctx, state);
		}
	};

	const markPlanDirty = (ctx: ExtensionContext | undefined, source: string) => {
		if (state.mode !== "planning") {
			return;
		}

		commitState(ctx, {
			...state,
			planNeedsSync: true,
			lastEvidenceSource: source,
		});
	};

	const syncPlanStateFromContent = (
		ctx: ExtensionContext | undefined,
		content: string,
		options: { clearDirtyOnChange?: boolean } = {},
	): string => {
		const analysis = analyzePlanFileContent(content);
		const planChanged = analysis.hash !== state.lastPlanHash;
		const clearDirty = options.clearDirtyOnChange === true && planChanged;

		commitState(ctx, {
			...state,
			planStatus: analysis.status,
			lastPlanHash: analysis.hash,
			planNeedsSync: clearDirty ? false : state.planNeedsSync,
			lastEvidenceSource: clearDirty ? undefined : state.lastEvidenceSource,
		});

		return content;
	};

	const refreshPlanStateFromFile = async (
		ctx: ExtensionContext | undefined,
		options: { clearDirtyOnChange?: boolean } = {},
	): Promise<string | undefined> => {
		if (state.mode !== "planning" || !state.planFilePath) {
			return undefined;
		}

		try {
			const planContent = await readPlanFile(state.planFilePath);
			return syncPlanStateFromContent(ctx, planContent, options);
		} catch {
			commitState(ctx, {
				...state,
				planStatus: "empty",
				lastPlanHash: undefined,
			});
			return undefined;
		}
	};

	const seedTaskSummary = async (ctx: ExtensionContext | undefined, taskSummary: string): Promise<void> => {
		if (state.mode !== "planning" || !state.planFilePath) {
			return;
		}

		const normalizedTaskSummary = normalizeTaskSummary(taskSummary);
		if (!normalizedTaskSummary) {
			return;
		}

		const currentContent = await ensurePlanFileExists(state.planFilePath, normalizedTaskSummary);
		commitState(ctx, {
			...state,
			taskSummary: normalizedTaskSummary,
		});
		syncPlanStateFromContent(ctx, currentContent, { clearDirtyOnChange: true });
	};

	const formatPlanStatusMessage = (): string => {
		if (state.mode !== "planning" || !state.planFilePath) {
			return "Plan mode: OFF";
		}

		return [
			"Plan mode: ON",
			`Plan file: ${state.planFilePath}`,
			`Task: ${state.taskSummary ?? "waiting for task prompt"}`,
			`Status: ${getPlanDisplayStatus(state)}`,
			`Needs sync: ${state.planNeedsSync ? "yes" : "no"}`,
		].join("\n");
	};

	async function activatePlanMode(
		ctx: ExtensionContext,
		options: {
			reason?: string;
			taskSummary?: string;
			requireApproval: boolean;
		},
	): Promise<{ ok: boolean; message: string }> {
		const normalizedTaskSummary = normalizeTaskSummary(options.taskSummary);

		if (state.mode === "planning" && state.planFilePath) {
			if (!state.taskSummary && normalizedTaskSummary) {
				await seedTaskSummary(ctx, normalizedTaskSummary);
			}

			updatePlanModeUi(ctx, state);
			return {
				ok: true,
				message: buildPlanningInstructionMessage(state.planFilePath, state.taskSummary),
			};
		}

		if (options.requireApproval) {
			const approved = await confirmEnterPlanMode(ctx, options.reason, normalizedTaskSummary);
			if (!approved) {
				return { ok: false, message: "User declined entering plan mode." };
			}
		}

		restoreTools = pi.getActiveTools().length > 0 ? [...pi.getActiveTools()] : getAllToolNames(pi);
		const planFilePath = createPlanFilePath();
		const initialContent = await ensurePlanFileExists(planFilePath, normalizedTaskSummary);
		const initialAnalysis = analyzePlanFileContent(initialContent);

		commitState(ctx, {
			mode: "planning",
			planFilePath,
			taskSummary: normalizedTaskSummary,
			planStatus: initialAnalysis.status,
			planNeedsSync: false,
			lastPlanHash: initialAnalysis.hash,
			lastEvidenceSource: undefined,
		});
		planningIntroPending = !options.requireApproval;
		pi.setActiveTools(getPlanningTools(pi));

		if (ctx.hasUI) {
			ctx.ui.notify(`Plan mode enabled. Plan file: ${planFilePath}`, "info");
		}

		return {
			ok: true,
			message: buildPlanningInstructionMessage(planFilePath, normalizedTaskSummary),
		};
	}

	function deactivatePlanMode(
		ctx: ExtensionContext,
		options: { notify?: string },
	): { ok: boolean; message: string } {
		pi.setActiveTools(getNormalTools(pi, restoreTools));
		restoreTools = null;
		planningIntroPending = false;
		commitState(ctx, createDefaultState());

		if (ctx.hasUI && options.notify) {
			ctx.ui.notify(options.notify, "info");
		}

		return { ok: true, message: "Plan mode disabled." };
	}

	pi.registerTool({
		name: "enter_plan_mode",
		label: "enter_plan_mode",
		description: docs.enter_plan_mode,
		promptSnippet:
			"enter_plan_mode: request approval to switch into planning mode before implementing a complex coding task.",
		promptGuidelines: [
			"After enter_plan_mode succeeds, the active plan file becomes the source of truth for the rest of plan mode.",
		],
		parameters: ENTER_PLAN_MODE_PARAMS,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const result = await activatePlanMode(ctx, {
				reason: params.reason,
				taskSummary: params.taskSummary,
				requireApproval: true,
			});
			return {
				content: [{ type: "text", text: result.message }],
				details: {
					ok: result.ok,
					mode: state.mode,
					planFilePath: state.planFilePath,
					taskSummary: state.taskSummary,
				},
			};
		},
	});

	pi.registerTool({
		name: "exit_plan_mode",
		label: "exit_plan_mode",
		description: docs.exit_plan_mode,
		promptSnippet:
			"exit_plan_mode: request approval to leave planning mode only after the active plan file is ready for user review.",
		promptGuidelines: [
			"Do not call exit_plan_mode until the active plan file exists and reflects the latest evidence or user answers.",
			"If anything important is still unresolved, use ask_user_question first and update the active plan file.",
		],
		parameters: EXIT_PLAN_MODE_PARAMS,
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			if (state.mode !== "planning" || !state.planFilePath) {
				return {
					content: [{ type: "text", text: "Plan mode is not active." }],
					details: { ok: false, mode: state.mode },
				};
			}

			const planContent = await refreshPlanStateFromFile(ctx);
			if (!planContent) {
				return {
					content: [{ type: "text", text: "Cannot read the active plan file yet." }],
					details: { ok: false, planFilePath: state.planFilePath },
				};
			}

			if (state.planStatus !== "ready") {
				return {
					content: [
						{
							type: "text",
							text: "Plan is still draft.",
						},
					],
					details: { ok: false, planFilePath: state.planFilePath, planStatus: state.planStatus },
				};
			}

			if (state.planNeedsSync) {
				return {
					content: [
						{
							type: "text",
							text: "Plan is stale. Sync the latest evidence first.",
						},
					],
					details: {
						ok: false,
						planFilePath: state.planFilePath,
						planNeedsSync: state.planNeedsSync,
						lastEvidenceSource: state.lastEvidenceSource,
					},
				};
			}

			const exitChoice = await confirmExitPlanMode(ctx, state.planFilePath, planContent);
			if (exitChoice.action === "feedback") {
				markPlanDirty(ctx, "exit_plan_mode feedback");
				return {
					content: [{ type: "text", text: `User feedback: ${exitChoice.feedback}` }],
					details: {
						ok: false,
						planFilePath: state.planFilePath,
						feedback: exitChoice.feedback,
						continuePlanning: true,
					},
				};
			}

			if (exitChoice.action !== "approve") {
				return {
					content: [{ type: "text", text: "The user did not approve leaving plan mode yet." }],
					details: { ok: false, planFilePath: state.planFilePath },
				};
			}

			deactivatePlanMode(ctx, { notify: "Plan mode disabled. The plan was approved." });
			return {
				content: [{ type: "text", text: "Plan mode disabled. The user approved the written plan." }],
				details: { ok: true, mode: state.mode },
			};
		},
	});

	pi.registerTool({
		name: "ask_user_question",
		label: "ask_user_question",
		description: docs.ask_user_question,
		promptSnippet:
			"ask_user_question: ask the user a focused question when an important requirement, choice, or ambiguity needs confirmation.",
		promptGuidelines: [
			"Use ask_user_question when user input is genuinely needed to resolve ambiguity or make a meaningful decision.",
			"Do not ask questions that can be answered by inspecting the repository or current context.",
			"Ask only one atomic question per tool call; if multiple decisions are unresolved, ask them in separate calls.",
			"Keep the question short, keep extra detail in context, and keep answer options concise and distinct.",
			"In plan mode, do not ask clarification questions in plain assistant text; use ask_user_question.",
		],
		parameters: ASK_USER_QUESTION_PARAMS,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const questionViolation = getAtomicQuestionViolation(params.question);
			if (questionViolation) {
				return {
					content: [{ type: "text", text: questionViolation }],
					details: { ok: false, answer: null, reason: "non_atomic_question" },
				};
			}

			const answer = await askUserQuestion(ctx, params.question, params.context, params.options);

			if (!answer) {
				return {
					content: [{ type: "text", text: "The user did not answer the question." }],
					details: { ok: false, answer: null },
				};
			}

			if (state.mode === "planning") {
				markPlanDirty(ctx, `ask_user_question: ${params.question.trim()}`);
			}

			return {
				content: [{ type: "text", text: `User answer: ${answer}` }],
				details: { ok: true, answer },
			};
		},
	});

	pi.registerCommand("plan", {
		description: "Enter, exit, or inspect session-level plan mode",
		handler: async (args, ctx) => {
			const raw = args.trim();
			if (raw.length === 0) {
				if (state.mode === "planning") {
					deactivatePlanMode(ctx, { notify: "Plan mode disabled by user command." });
				} else {
					await activatePlanMode(ctx, { requireApproval: false });
				}
				return;
			}

			const normalized = raw.toLowerCase();
			if (["on", "enable", "start"].includes(normalized)) {
				await activatePlanMode(ctx, { requireApproval: false });
				return;
			}

			if (["off", "disable", "stop", "exit"].includes(normalized)) {
				deactivatePlanMode(ctx, { notify: "Plan mode disabled by user command." });
				return;
			}

			if (["status", "state"].includes(normalized)) {
				if (ctx.hasUI) {
					ctx.ui.notify(formatPlanStatusMessage(), "info");
				}
				return;
			}

			const result = await activatePlanMode(ctx, {
				requireApproval: false,
				taskSummary: raw,
			});
			if (result.ok) {
				pi.sendUserMessage(raw);
			}
		},
	});

	pi.on("input", async (event: InputEvent, ctx) => {
		if (state.mode !== "planning" || state.taskSummary || event.source === "extension") {
			return;
		}

		const text = event.text.trim();
		if (text.length === 0 || text.startsWith("/")) {
			return;
		}

		await seedTaskSummary(ctx, text);
	});

	pi.on("before_agent_start", async (event) => {
		if (state.mode !== "planning" || !state.planFilePath || !planningIntroPending) {
			return;
		}

		planningIntroPending = false;
		const planPrompt = `${planModePrompt}\n\n${buildPlanModeIntroText(state)}`;
		return {
			systemPrompt: `${event.systemPrompt}\n\n${planPrompt}`,
		};
	});

	pi.on("tool_call", async (event, ctx) => {
		if (state.mode !== "planning") {
			return;
		}

		if (event.toolName === "bash") {
			return {
				block: true,
				reason: "Bash is not available in plan mode.",
			};
		}

		if (event.toolName === "ast_rewrite") {
			return {
				block: true,
				reason: "ast_rewrite is blocked in plan mode. Only the generated plan file may be edited.",
			};
		}

		if (isWriteLikeTool(event.toolName)) {
			if (!isPlanFileWriteAllowed(event.toolName, event.input, state.planFilePath, ctx.cwd)) {
				const targetPath = getToolPath(event.input);
				return {
					block: true,
					reason: `Plan mode only allows writes to the active plan file. Blocked target: ${targetPath ?? "unknown"}`,
				};
			}
		}
	});

	pi.on("tool_result", async (event: ToolResultEvent, ctx) => {
		if (state.mode !== "planning" || event.isError) {
			return;
		}

		if (
			(event.toolName === "write" || event.toolName === "edit") &&
			isPlanFileWriteAllowed(event.toolName, event.input, state.planFilePath, ctx.cwd)
		) {
			await refreshPlanStateFromFile(ctx, { clearDirtyOnChange: true });
			return;
		}

		if (DIRTY_EVIDENCE_TOOLS.has(event.toolName)) {
			if (isSamePlanFilePath(event.input, state.planFilePath, ctx.cwd)) {
				return;
			}
			markPlanDirty(ctx, describeEvidenceSource(event.toolName, event.input));
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		state = restoreStateFromSession(ctx.sessionManager);
		restoreTools = pi.getActiveTools().length > 0 ? [...pi.getActiveTools()] : getAllToolNames(pi);

		if (state.mode === "planning") {
			planningIntroPending = true;
			pi.setActiveTools(getPlanningTools(pi));
			await refreshPlanStateFromFile(ctx);
		}

		updatePlanModeUi(ctx, state);
		notifyWarnings(ctx, warnings);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		updatePlanModeUi(ctx, createDefaultState());
	});
}
