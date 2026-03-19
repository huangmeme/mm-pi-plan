import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
	getPlanModeToolNames,
	getToolPath,
	isPlanFileWriteAllowed,
	isValidPlanFileContent,
	isWriteLikeTool,
} from "./guardrails.js";
import { createDefaultState, createPlanFilePath, createPlanStateEntry, restoreStateFromSession, type PlanSessionState } from "./state.js";
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

async function ensurePlanFileExists(planFilePath: string): Promise<void> {
	await mkdir(dirname(planFilePath), { recursive: true });
	try {
		await access(planFilePath);
	} catch {
		const initialContent = `# Implementation Plan\n\n## Goal\n\n## Evidence\n\n## Proposed Steps\n`;
		await writeFile(planFilePath, initialContent, "utf-8");
	}
}

async function readPlanFile(planFilePath: string): Promise<string> {
	return readFile(planFilePath, "utf-8");
}

function buildPlanningInstructionMessage(planFilePath: string): string {
	return [
		`Plan mode is active.`,
		`Active plan file: ${planFilePath}`,
		`Next actions:`,
		`1. Gather evidence with read/search tools as needed.`,
		`2. Write or update the implementation plan in the active plan file before finishing your response.`,
		`3. Do not keep the real plan only in chat.`,
		`4. Only call exit_plan_mode after the active plan file is genuinely ready for user review.`,
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

function persistState(pi: ExtensionAPI, state: PlanSessionState): void {
	pi.appendEntry("pi-plan-state", createPlanStateEntry(state));
}

export default async function planModePackage(pi: ExtensionAPI): Promise<void> {
	const { docs, planModePrompt, warnings } = await loadToolDocs();
	let state = createDefaultState();
	let restoreTools: string[] | null = null;

	async function enterPlanMode(
		ctx: ExtensionContext,
		options: {
			reason?: string;
			taskSummary?: string;
			requireApproval: boolean;
		},
	): Promise<{ ok: boolean; message: string }> {
		if (state.mode === "planning" && state.planFilePath) {
			updatePlanModeUi(ctx, state);
			return {
				ok: true,
				message: buildPlanningInstructionMessage(state.planFilePath),
			};
		}

		if (options.requireApproval) {
			const approved = await confirmEnterPlanMode(ctx, options.reason, options.taskSummary);
			if (!approved) {
				return { ok: false, message: "User declined entering plan mode." };
			}
		}

		restoreTools = pi.getActiveTools().length > 0 ? [...pi.getActiveTools()] : getAllToolNames(pi);
		const planFilePath = createPlanFilePath();
		await ensurePlanFileExists(planFilePath);
		state = { mode: "planning", planFilePath };
		pi.setActiveTools(getPlanningTools(pi));
		persistState(pi, state);
		updatePlanModeUi(ctx, state);

		if (ctx.hasUI) {
			ctx.ui.notify(`Plan mode enabled. Plan file: ${planFilePath}`, "info");
		}

		return {
			ok: true,
			message: buildPlanningInstructionMessage(planFilePath),
		};
	}

	function exitPlanMode(
		ctx: ExtensionContext,
		options: { notify?: string },
	): { ok: boolean; message: string } {
		state = createDefaultState();
		pi.setActiveTools(getNormalTools(pi, restoreTools));
		restoreTools = null;
		persistState(pi, state);
		updatePlanModeUi(ctx, state);

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
			"After enter_plan_mode succeeds, treat the active plan file as the source of truth and update it before finishing your response.",
		],
		parameters: ENTER_PLAN_MODE_PARAMS,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const result = await enterPlanMode(ctx, {
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
			"Do not call exit_plan_mode until the active plan file contains a meaningful implementation plan.",
			"If anything important is still unresolved, use ask_user_question first and continue refining the active plan file.",
		],
		parameters: EXIT_PLAN_MODE_PARAMS,
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			if (state.mode !== "planning" || !state.planFilePath) {
				return {
					content: [{ type: "text", text: "Plan mode is not active." }],
					details: { ok: false, mode: state.mode },
				};
			}

			let planContent = "";
			try {
				planContent = await readPlanFile(state.planFilePath);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text", text: `Cannot read the plan file yet: ${message}` }],
					details: { ok: false, planFilePath: state.planFilePath },
				};
			}

			if (!isValidPlanFileContent(planContent)) {
				return {
					content: [
						{
							type: "text",
							text: "The plan file is still missing or too short. Write a meaningful implementation plan before leaving plan mode.",
						},
					],
					details: { ok: false, planFilePath: state.planFilePath },
				};
			}

			const exitChoice = await confirmExitPlanMode(ctx, state.planFilePath, planContent);
			if (exitChoice !== "approve") {
				return {
					content: [{ type: "text", text: "The user chose to continue planning. Keep refining the plan." }],
					details: { ok: false, planFilePath: state.planFilePath },
				};
			}

			exitPlanMode(ctx, { notify: "Plan mode disabled. The plan was approved." });
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
					exitPlanMode(ctx, { notify: "Plan mode disabled by user command." });
				} else {
					await enterPlanMode(ctx, { requireApproval: false });
				}
				return;
			}

			const normalized = raw.toLowerCase();
			if (["on", "enable", "start"].includes(normalized)) {
				await enterPlanMode(ctx, { requireApproval: false });
				return;
			}

			if (["off", "disable", "stop", "exit"].includes(normalized)) {
				exitPlanMode(ctx, { notify: "Plan mode disabled by user command." });
				return;
			}

			if (["status", "state"].includes(normalized)) {
				const message =
					state.mode === "planning" && state.planFilePath
						? `Plan mode: ON\nPlan file: ${state.planFilePath}`
						: "Plan mode: OFF";
				if (ctx.hasUI) {
					ctx.ui.notify(message, "info");
				}
				return;
			}

			const result = await enterPlanMode(ctx, {
				requireApproval: false,
				taskSummary: raw,
			});
			if (result.ok) {
				pi.sendUserMessage(raw);
			}
		},
	});

	pi.on("before_agent_start", async (event) => {
		if (state.mode !== "planning" || !state.planFilePath) {
			return;
		}

		let extraReminder = "";
		try {
			const currentPlan = await readPlanFile(state.planFilePath);
			if (!isValidPlanFileContent(currentPlan)) {
				extraReminder =
					"\n\nReminder: the active plan file still does not contain a meaningful plan. Update the active plan file during this run before finishing your response.";
			}
		} catch {
			extraReminder =
				"\n\nReminder: the active plan file is missing or unreadable. Recreate or update it before finishing your response.";
		}

		const planPrompt = `${planModePrompt}\n\nCurrent plan file: ${state.planFilePath}${extraReminder}`;
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

	pi.on("session_start", async (_event, ctx) => {
		state = restoreStateFromSession(ctx.sessionManager);
		restoreTools = pi.getActiveTools().length > 0 ? [...pi.getActiveTools()] : getAllToolNames(pi);

		if (state.mode === "planning") {
			pi.setActiveTools(getPlanningTools(pi));
		}

		updatePlanModeUi(ctx, state);
		notifyWarnings(ctx, warnings);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		updatePlanModeUi(ctx, createDefaultState());
	});
}
