import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import { PLAN_MODE_STATUS_KEY, PLAN_MODE_WIDGET_KEY, type PlanSessionState } from "./state.js";

export type ExitPlanModeChoice =
	| { action: "approve" }
	| { action: "feedback"; feedback: string }
	| { action: "cancel" };

interface InlineQuestionPromptOptions {
	title: string;
	question: string;
	questionTitle?: string;
	context?: string;
	contextTitle?: string;
	options?: string[];
	showOptionsHeader?: boolean;
	customAnswerEnabled?: boolean;
	customAnswerLabel: string;
	customAnswerKind: "answer" | "note";
}

export interface EnterPlanPromptConfig {
	title: string;
	question: string;
	context?: string;
	options: string[];
	showOptionsHeader: boolean;
	customAnswerEnabled: boolean;
	customAnswerLabel: string;
	customAnswerKind: "answer" | "note";
}

let lastRenderedPlanStatus: string | undefined;
let planWidgetCleared = false;
const INLINE_NOTE_SEPARATOR = "  : ";

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

function normalizeInlineNote(input: string): string {
	return input.replace(/\s+/g, " ").trim();
}

function buildInlineNoteLabel(
	baseLabel: string,
	note: string,
	isEditing: boolean,
	maxLength: number,
): string {
	const normalized = normalizeInlineNote(note);
	if (normalized.length === 0 && !isEditing) {
		return baseLabel;
	}

	const suffix = isEditing ? `${normalized}|` : normalized;
	const inline = `${baseLabel}${INLINE_NOTE_SEPARATOR}${suffix}`;
	if (inline.length <= maxLength) {
		return inline;
	}

	if (maxLength <= 1) {
		return ".";
	}

	return `${inline.slice(0, maxLength - 1)}.`;
}

function createEditorTheme(theme: {
	fg: (color: "accent" | "muted" | "dim" | "warning" | "text", text: string) => string;
}): EditorTheme {
	return {
		borderColor: (text) => theme.fg("accent", text),
		selectList: {
			selectedPrefix: (text) => theme.fg("accent", text),
			selectedText: (text) => theme.fg("accent", text),
			description: (text) => theme.fg("muted", text),
			scrollInfo: (text) => theme.fg("dim", text),
			noMatch: (text) => theme.fg("warning", text),
		},
	};
}

export function normalizeQuestionOption(option: string): string {
	return option
		.replace(/^\s*[-*+]\s+/, "")
		.replace(/^\s*\d+[.):-]\s*/, "")
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

	const questionMarkCount = (normalized.match(/\?/g) ?? []).length;
	if (questionMarkCount > 1) {
		return "The question appears to contain multiple questions. Split it into separate ask_user_question calls.";
	}

	const numberedSegments = normalized.match(/(?:^|\s)\d+[.):-]\s+/g) ?? [];
	if (numberedSegments.length > 1) {
		return "Do not send numbered sub-questions in one ask_user_question call. Ask them separately.";
	}

	const bulletSegments = normalized.match(/(?:^|\s)[-*+]\s+\S+/g) ?? [];
	if (bulletSegments.length > 1) {
		return "Do not bundle multiple bullet-point questions into one ask_user_question call. Split them up.";
	}

	return undefined;
}

export function buildEnterPlanPurpose(reason?: string, taskSummary?: string): string | undefined {
	const normalizedTaskSummary = taskSummary?.trim();
	const normalizedReason = reason?.trim();

	if (normalizedTaskSummary && normalizedReason) {
		if (normalizedTaskSummary === normalizedReason) {
			return normalizedTaskSummary;
		}

		return `${normalizedTaskSummary}. ${normalizedReason}`;
	}

	return normalizedTaskSummary ?? normalizedReason;
}

export function createEnterPlanPrompt(reason?: string, taskSummary?: string): EnterPlanPromptConfig {
	const purpose = buildEnterPlanPurpose(reason, taskSummary);
	return {
		title: "Enter Plan Mode",
		question: "Allow the agent to enter plan mode?",
		context: purpose ? `Purpose: ${purpose}` : undefined,
		options: ["Yes", "No"],
		showOptionsHeader: false,
		customAnswerEnabled: false,
		customAnswerLabel: "",
		customAnswerKind: "note",
	};
}

export async function confirmEnterPlanMode(
	ctx: ExtensionContext,
	reason?: string,
	taskSummary?: string,
): Promise<boolean> {
	const answer = await askInlineQuestion(ctx, createEnterPlanPrompt(reason, taskSummary));
	return answer === "Yes";
}

export async function confirmExitPlanMode(
	ctx: ExtensionContext,
	planFilePath: string,
	_planContent: string,
): Promise<ExitPlanModeChoice> {
	const answer = await askInlineQuestion(ctx, {
		title: "Exit plan mode",
		question: "Allow the agent to exit plan mode?",
		context: `Plan file: ${planFilePath}`,
		options: ["Approve and exit plan mode"],
		showOptionsHeader: false,
		customAnswerEnabled: true,
		customAnswerLabel: "Add feedback and continue",
		customAnswerKind: "note",
	});

	if (!answer) {
		return { action: "cancel" };
	}

	if (answer === "Approve and exit plan mode") {
		return { action: "approve" };
	}

	return { action: "feedback", feedback: answer };
}

async function askInlineQuestion(
	ctx: ExtensionContext,
	prompt: InlineQuestionPromptOptions,
): Promise<string | undefined> {
	if (!ctx.hasUI) {
		return undefined;
	}

	const normalizedQuestion = prompt.question.trim();
	const normalizedContext = prompt.context?.trim() ?? "";
	const normalizedOptions = normalizeQuestionOptions(prompt.options);
	const customAnswerEnabled = prompt.customAnswerEnabled !== false;
	const showOptionsHeader = prompt.showOptionsHeader !== false;

	return ctx.ui.custom<string | undefined>((tui, theme, _kb, done) => {
		let optionIndex = 0;
		let editMode = false;
		let customAnswer = "";
		let cachedLines: string[] | undefined;

		const editor = new Editor(tui, createEditorTheme(theme));
		const customOptionIndex = customAnswerEnabled ? normalizedOptions.length : -1;
		const maxOptionIndex = customAnswerEnabled ? customOptionIndex : Math.max(0, normalizedOptions.length - 1);

		const requestRerender = () => {
			cachedLines = undefined;
			tui.requestRender();
		};

		const getNormalizedCustomAnswer = (): string => normalizeInlineNote(customAnswer);

		const openCustomAnswerEditor = () => {
			if (!customAnswerEnabled || optionIndex !== customOptionIndex) {
				return;
			}

			editMode = true;
			editor.setText(customAnswer);
			requestRerender();
		};

		editor.onChange = (value) => {
			customAnswer = value;
			requestRerender();
		};

		editor.onSubmit = (value) => {
			customAnswer = value;
			const trimmed = getNormalizedCustomAnswer();
			if (trimmed.length > 0) {
				done(trimmed);
				return;
			}

			editMode = false;
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
				if (matchesKey(data, Key.tab) || matchesKey(data, Key.escape)) {
					editMode = false;
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
				optionIndex = Math.min(maxOptionIndex, optionIndex + 1);
				requestRerender();
				return;
			}

			if (matchesKey(data, Key.tab)) {
				if (customAnswerEnabled && optionIndex === customOptionIndex) {
					openCustomAnswerEditor();
				}
				return;
			}

			if (matchesKey(data, Key.enter)) {
				if (customAnswerEnabled && optionIndex === customOptionIndex) {
					const customAnswerValue = getNormalizedCustomAnswer();
					if (customAnswerValue.length > 0) {
						done(customAnswerValue);
						return;
					}

					openCustomAnswerEditor();
					return;
				}

				done(normalizedOptions[optionIndex]);
				return;
			}

			if (matchesKey(data, Key.escape)) {
				done(undefined);
				return;
			}

			if (customAnswerEnabled && optionIndex === customOptionIndex && data.length > 0) {
				openCustomAnswerEditor();
				editor.handleInput(data);
				requestRerender();
			}
		};

		const render = (width: number): string[] => {
			if (cachedLines) {
				return cachedLines;
			}

			const lines: string[] = [];
			const selectedPrefix = theme.fg("accent", ">  ");
			const unselectedPrefix = "   ";
			lines.push(truncateToWidth(theme.fg("accent", "-".repeat(width)), width));
			lines.push(truncateToWidth(theme.fg("text", ` ${prompt.title}`), width));
			lines.push("");

			if (prompt.questionTitle) {
				renderSection(lines, width, prompt.questionTitle, normalizedQuestion);
			} else {
				for (const line of wrapText(normalizedQuestion, Math.max(10, width - 2))) {
					lines.push(truncateToWidth(theme.fg("text", line), width));
				}
			}

			if (normalizedContext.length > 0) {
				lines.push("");
				if (prompt.contextTitle) {
					renderSection(lines, width, prompt.contextTitle, normalizedContext, "muted");
				} else {
					for (const line of wrapText(normalizedContext, Math.max(10, width - 2))) {
						lines.push(truncateToWidth(theme.fg("muted", line), width));
					}
				}
			}

			lines.push("");
			if (showOptionsHeader) {
				lines.push(truncateToWidth(theme.fg("accent", "Options"), width));
			}
			for (let index = 0; index < normalizedOptions.length; index += 1) {
				const isSelected = !editMode && index === optionIndex;
				const prefix = isSelected ? selectedPrefix : unselectedPrefix;
				const optionText = normalizedOptions[index];
				lines.push(
					truncateToWidth(
						`${prefix}${isSelected ? theme.fg("accent", optionText) : theme.fg("text", optionText)}`,
						width,
					),
				);
			}

			if (customAnswerEnabled) {
				const isCustomSelected = optionIndex === customOptionIndex;
				const customLabel = buildInlineNoteLabel(
					prompt.customAnswerLabel,
					customAnswer,
					editMode && isCustomSelected,
					Math.max(20, width - 8),
				);
				lines.push(
					truncateToWidth(
						`${isCustomSelected ? selectedPrefix : unselectedPrefix}${theme.fg(isCustomSelected ? "accent" : "text", customLabel)}`,
						width,
					),
				);
			}

			lines.push("");
			if (editMode) {
				lines.push(
					truncateToWidth(
						theme.fg("dim", `Typing ${prompt.customAnswerKind} inline | Enter submit | Tab/Esc stop editing`),
						width,
					),
				);
			} else if (customAnswerEnabled && optionIndex === customOptionIndex) {
				if (getNormalizedCustomAnswer().length > 0) {
					lines.push(
						truncateToWidth(
							theme.fg("dim", `Up/Down move | Enter submit | Type/Tab edit ${prompt.customAnswerKind} | Esc cancel`),
							width,
						),
					);
				} else {
					lines.push(
						truncateToWidth(
							theme.fg("dim", `Up/Down move | Enter add ${prompt.customAnswerKind} | Type/Tab edit ${prompt.customAnswerKind} | Esc cancel`),
							width,
						),
					);
				}
			} else {
				lines.push(truncateToWidth(theme.fg("dim", "Up/Down move | Enter select | Esc cancel"), width));
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

export async function askUserQuestion(
	ctx: ExtensionContext,
	question: string,
	context?: string,
	options?: string[],
): Promise<string | undefined> {
	return askInlineQuestion(ctx, {
		title: "Ask user question",
		question,
		questionTitle: "Question",
		context,
		contextTitle: context ? "Context" : undefined,
		options,
		showOptionsHeader: true,
		customAnswerEnabled: true,
		customAnswerLabel: options && options.length > 0 ? "Type a custom answer" : "Type your answer",
		customAnswerKind: "answer",
	});
}

export function updatePlanModeUi(ctx: ExtensionContext, state: PlanSessionState): void {
	if (!ctx.hasUI) {
		return;
	}

	if (state.mode !== "planning" || !state.planFilePath) {
		if (lastRenderedPlanStatus !== undefined) {
			ctx.ui.setStatus(PLAN_MODE_STATUS_KEY, undefined);
			lastRenderedPlanStatus = undefined;
		}
		if (!planWidgetCleared) {
			ctx.ui.setWidget(PLAN_MODE_WIDGET_KEY, undefined);
			planWidgetCleared = true;
		}
		return;
	}

	const renderedStatus = ctx.ui.theme.fg("accent", "Plan");

	if (renderedStatus !== lastRenderedPlanStatus) {
		ctx.ui.setStatus(PLAN_MODE_STATUS_KEY, renderedStatus);
		lastRenderedPlanStatus = renderedStatus;
	}

	if (!planWidgetCleared) {
		ctx.ui.setWidget(PLAN_MODE_WIDGET_KEY, undefined);
		planWidgetCleared = true;
	}
}

export function notifyWarnings(ctx: ExtensionContext, warnings: string[]): void {
	if (!ctx.hasUI) {
		return;
	}

	for (const warning of warnings) {
		ctx.ui.notify(warning, "warning");
	}
}
