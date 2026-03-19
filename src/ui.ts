import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import { basename, relative } from "node:path";
import type { PlanSessionState } from "./state.js";
import { PLAN_MODE_STATUS_KEY, PLAN_MODE_WIDGET_KEY } from "./state.js";

export type ExitPlanModeChoice = "approve" | "continue_planning";

function wrapText(text: string, width: number): string[] {
	if (width <= 0) {
		return [text];
	}

	const normalized = text.replace(/\r\n/g, "\n");
	const lines: string[] = [];

	for (const rawLine of normalized.split("\n")) {
		const line = rawLine.trimEnd();
		if (line.length === 0) {
			lines.push("");
			continue;
		}

		let remaining = line;
		while (remaining.length > width) {
			lines.push(remaining.slice(0, width));
			remaining = remaining.slice(width);
		}
		lines.push(remaining);
	}

	return lines;
}

export function normalizeQuestionOption(option: string): string {
	return option
		.replace(/^\s*[-*•]\s+/, "")
		.replace(/^\s*\d+[.)、:：-]\s*/, "")
		.replace(/\s+/g, " ")
		.trim();
}

export function normalizeQuestionOptions(options?: string[]): string[] {
	if (!options || options.length === 0) {
		return [];
	}

	const seen = new Set<string>();
	const normalizedOptions: string[] = [];

	for (const option of options) {
		const normalized = normalizeQuestionOption(option);
		if (normalized.length === 0) {
			continue;
		}

		const dedupeKey = normalized.toLowerCase();
		if (seen.has(dedupeKey)) {
			continue;
		}

		seen.add(dedupeKey);
		normalizedOptions.push(normalized);
	}

	return normalizedOptions;
}

export function getAtomicQuestionViolation(question: string): string | undefined {
	const normalized = question.replace(/\r\n/g, "\n").trim();
	if (normalized.length === 0) {
		return "ask_user_question requires a non-empty question.";
	}

	const nonEmptyLines = normalized
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	if (nonEmptyLines.length > 1) {
		return "Ask only one atomic question per ask_user_question call. Move extra detail into context or split the questions.";
	}

	const questionMarkCount = (normalized.match(/[?？]/g) ?? []).length;
	if (questionMarkCount > 1) {
		return "The question appears to contain multiple questions. Split it into separate ask_user_question calls.";
	}

	const numberedSegments = normalized.match(/(?:^|\s)\d+[.)、:：-]\s+/g) ?? [];
	if (numberedSegments.length > 1) {
		return "Do not send numbered sub-questions in one ask_user_question call. Ask them separately.";
	}

	const bulletSegments = normalized.match(/(?:^|\s)[-*•]\s+\S+/g) ?? [];
	if (bulletSegments.length > 1) {
		return "Do not bundle multiple bullet-point questions into one ask_user_question call. Split them up.";
	}

	return undefined;
}

export async function confirmEnterPlanMode(
	ctx: ExtensionContext,
	reason?: string,
	taskSummary?: string,
): Promise<boolean> {
	if (!ctx.hasUI) {
		return false;
	}

	const parts = [
		"Allow the agent to enter plan mode?",
		reason ? `Reason: ${reason}` : undefined,
		taskSummary ? `Task: ${taskSummary}` : undefined,
	]
		.filter(Boolean)
		.join("\n\n");

	return ctx.ui.confirm("Enter Plan Mode", parts);
}

export async function confirmExitPlanMode(
	ctx: ExtensionContext,
	planFilePath: string,
	planContent: string,
): Promise<ExitPlanModeChoice> {
	if (!ctx.hasUI) {
		return "continue_planning";
	}

	const preview = planContent.length > 1600 ? `${planContent.slice(0, 1600)}\n\n...[truncated]` : planContent;
	const message = [`Allow the agent to exit plan mode?`, `Plan file: ${planFilePath}`, "", preview].join("\n");
	const choice = await ctx.ui.select(message, ["Approve and exit plan mode", "Continue planning"]);
	return choice === "Approve and exit plan mode" ? "approve" : "continue_planning";
}

export async function askUserQuestion(
	ctx: ExtensionContext,
	question: string,
	context?: string,
	options?: string[],
): Promise<string | undefined> {
	if (!ctx.hasUI) {
		return undefined;
	}

	const normalizedQuestion = question.trim();
	const normalizedContext = context?.trim() ?? "";
	const normalizedOptions = normalizeQuestionOptions(options);

	return ctx.ui.custom<string | undefined>((tui, theme, _kb, done) => {
		let optionIndex = 0;
		let editMode = normalizedOptions.length === 0;
		let cachedLines: string[] | undefined;

		const editorTheme: EditorTheme = {
			borderColor: (text) => theme.fg("accent", text),
			selectList: {
				selectedPrefix: (text) => theme.fg("accent", text),
				selectedText: (text) => theme.fg("accent", text),
				description: (text) => theme.fg("muted", text),
				scrollInfo: (text) => theme.fg("dim", text),
				noMatch: (text) => theme.fg("warning", text),
			},
		};
		const editor = new Editor(tui, editorTheme);

		const requestRerender = () => {
			cachedLines = undefined;
			tui.requestRender();
		};

		editor.onSubmit = (value) => {
			const trimmed = value.trim();
			if (trimmed.length > 0) {
				done(trimmed);
				return;
			}

			if (normalizedOptions.length === 0) {
				done(undefined);
				return;
			}

			editMode = false;
			editor.setText("");
			requestRerender();
		};

		const renderSection = (
			lines: string[],
			width: number,
			title: string,
			body: string,
			color: "text" | "muted" = "text",
		) => {
			lines.push(truncateToWidth(theme.fg("accent", title), width));
			for (const line of wrapText(body, Math.max(10, width - 2))) {
				lines.push(truncateToWidth(` ${theme.fg(color, line)}`, width));
			}
		};

		const handleInput = (data: string) => {
			if (editMode) {
				if (matchesKey(data, Key.escape)) {
					if (normalizedOptions.length === 0) {
						done(undefined);
						return;
					}

					editMode = false;
					editor.setText("");
					requestRerender();
					return;
				}

				editor.handleInput(data);
				requestRerender();
				return;
			}

			if (matchesKey(data, Key.up)) {
				optionIndex = Math.max(0, optionIndex - 1);
				requestRerender();
				return;
			}

			if (matchesKey(data, Key.down)) {
				optionIndex = Math.min(normalizedOptions.length, optionIndex + 1);
				requestRerender();
				return;
			}

			if (matchesKey(data, Key.enter)) {
				if (optionIndex === normalizedOptions.length) {
					editMode = true;
					requestRerender();
					return;
				}

				done(normalizedOptions[optionIndex]);
				return;
			}

			if (matchesKey(data, Key.escape)) {
				done(undefined);
			}
		};

		const render = (width: number): string[] => {
			if (cachedLines) {
				return cachedLines;
			}

			const lines: string[] = [];
			lines.push(truncateToWidth(theme.fg("accent", "-".repeat(width)), width));
			renderSection(lines, width, "Question", normalizedQuestion);

			if (normalizedContext.length > 0) {
				lines.push("");
				renderSection(lines, width, "Context", normalizedContext, "muted");
			}

			if (normalizedOptions.length > 0) {
				lines.push("");
				lines.push(truncateToWidth(theme.fg("accent", "Options"), width));
				for (let index = 0; index < normalizedOptions.length; index += 1) {
					const isSelected = !editMode && index === optionIndex;
					const prefix = isSelected ? theme.fg("accent", "> ") : "  ";
					const optionText = `${index + 1}. ${normalizedOptions[index]}`;
					lines.push(
						truncateToWidth(
							`${prefix}${isSelected ? theme.fg("accent", optionText) : theme.fg("text", optionText)}`,
							width,
						),
					);
				}

				const customIndex = normalizedOptions.length;
				const isCustomSelected = !editMode && optionIndex === customIndex;
				const customPrefix = isCustomSelected ? theme.fg("accent", "> ") : "  ";
				const customLabel = "Type a custom answer";
				lines.push(
					truncateToWidth(
						`${customPrefix}${isCustomSelected ? theme.fg("accent", customLabel) : theme.fg("text", customLabel)}`,
						width,
					),
				);
			}

			if (editMode) {
				lines.push("");
				lines.push(truncateToWidth(theme.fg("accent", "Your answer"), width));
				for (const line of editor.render(Math.max(10, width - 2))) {
					lines.push(truncateToWidth(` ${line}`, width));
				}
			}

			lines.push("");
			if (editMode) {
				lines.push(truncateToWidth(theme.fg("dim", "Enter submit  Esc back/cancel"), width));
			} else {
				lines.push(truncateToWidth(theme.fg("dim", "Up/Down navigate  Enter select  Esc cancel"), width));
			}
			lines.push(truncateToWidth(theme.fg("accent", "-".repeat(width)), width));

			cachedLines = lines;
			return lines;
		};

		return {
			render,
			invalidate: () => {
				cachedLines = undefined;
			},
			handleInput,
		};
	});
}

export function updatePlanModeUi(ctx: ExtensionContext, state: PlanSessionState): void {
	if (!ctx.hasUI) {
		return;
	}

	if (state.mode !== "planning" || !state.planFilePath) {
		ctx.ui.setStatus(PLAN_MODE_STATUS_KEY, undefined);
		ctx.ui.setWidget(PLAN_MODE_WIDGET_KEY, undefined);
		return;
	}

	const relativePath = relative(ctx.cwd, state.planFilePath) || basename(state.planFilePath);
	ctx.ui.setStatus(PLAN_MODE_STATUS_KEY, ctx.ui.theme.fg("warning", "plan"));
	ctx.ui.setWidget(PLAN_MODE_WIDGET_KEY, [
		ctx.ui.theme.fg("accent", "Plan mode active"),
		ctx.ui.theme.fg("muted", `Plan file: ${relativePath}`),
	]);
}

export function notifyWarnings(ctx: ExtensionContext, warnings: string[]): void {
	if (!ctx.hasUI) {
		return;
	}

	for (const warning of warnings) {
		ctx.ui.notify(warning, "warning");
	}
}
