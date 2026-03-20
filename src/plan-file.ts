import { createHash } from "node:crypto";
import type { PlanStatus } from "./state.js";

export interface PlanAnalysis {
	status: PlanStatus;
	hash: string;
	isValid: boolean;
}

const DEFAULT_PLAN_TITLE = "[\u4efb\u52a1\u540d\u79f0]";
const DEFAULT_PLAN_SUMMARY = "[\u4efb\u52a1\u7b80\u8ff0]";
const PLAN_TITLE_PREFIX = "# Plan: ";
const OVERVIEW_HEADING = "## \u6982\u8ff0";
const STEPS_HEADING = "## \u5b9e\u73b0\u6b65\u9aa4";
const FILES_HEADING = "## \u6d89\u53ca\u6587\u4ef6";
const RISKS_HEADING = "## \u98ce\u9669/\u6ce8\u610f\u4e8b\u9879";

const SCAFFOLD_HINT_LINES = [
	"> Reference template only. Adapt, reorder, or replace this outline to fit the task.",
	"> A strong plan usually captures goal understanding, evidence gathered, uncertainties or assumptions, implementation steps, validation, and risks.",
	'> If the plan is ready for review, it may end with: "Ready to execute when approved."',
] as const;

const DEFAULT_SCAFFOLD_LINES = [
	OVERVIEW_HEADING,
	DEFAULT_PLAN_SUMMARY,
	"",
	STEPS_HEADING,
	"1. [\u6b65\u9aa41]",
	"2. [\u6b65\u9aa42]",
	"   - [\u5b50\u6b65\u9aa4]",
	"",
	FILES_HEADING,
	"- [\u6587\u4ef6\u8def\u5f841]: [\u4fee\u6539\u8bf4\u660e]",
	"- [\u6587\u4ef6\u8def\u5f842]: [\u4fee\u6539\u8bf4\u660e]",
	"",
	RISKS_HEADING,
	"- [\u6f5c\u5728\u95ee\u9898]",
] as const;

const GENERIC_PLAN_TITLES = new Set([
	"plan",
	"task",
	"task plan",
	"implementation plan",
	`plan: ${DEFAULT_PLAN_TITLE}`.toLowerCase(),
	DEFAULT_PLAN_TITLE.toLowerCase(),
	"\u4efb\u52a1",
	"\u4efb\u52a1\u8ba1\u5212",
	"\u5b9e\u73b0\u8ba1\u5212",
	"\u8ba1\u5212",
]);

const SCAFFOLD_PLACEHOLDERS = new Set([
	DEFAULT_PLAN_TITLE,
	DEFAULT_PLAN_SUMMARY,
	"[\u6b65\u9aa41]",
	"[\u6b65\u9aa42]",
	"[\u5b50\u6b65\u9aa4]",
	"[\u6587\u4ef6\u8def\u5f841]",
	"[\u6587\u4ef6\u8def\u5f842]",
	"[\u4fee\u6539\u8bf4\u660e]",
	"[\u6f5c\u5728\u95ee\u9898]",
	"1. [\u6b65\u9aa41]",
	"2. [\u6b65\u9aa42]",
	"- [\u5b50\u6b65\u9aa4]",
	"- [\u6587\u4ef6\u8def\u5f841]: [\u4fee\u6539\u8bf4\u660e]",
	"- [\u6587\u4ef6\u8def\u5f842]: [\u4fee\u6539\u8bf4\u660e]",
	"- [\u6f5c\u5728\u95ee\u9898]",
]);

function normalizeMarkdown(text: string): string {
	return text.replace(/\r\n/g, "\n");
}

function stripListMarker(line: string): string {
	return line.replace(/^[-*+]\s+/, "").replace(/^\d+[.)]\s+/, "").trim();
}

function normalizeTitleValue(value: string): string {
	return value.replace(/^plan:\s*/i, "").trim().toLowerCase();
}

function extractTitle(content: string): string | undefined {
	for (const rawLine of normalizeMarkdown(content).split("\n")) {
		const match = rawLine.match(/^#\s+(.*)$/);
		if (match) {
			return match[1].trim();
		}
	}

	return undefined;
}

function isScaffoldHeading(line: string): boolean {
	return line === OVERVIEW_HEADING || line === STEPS_HEADING || line === FILES_HEADING || line === RISKS_HEADING;
}

function isScaffoldHintLine(line: string): boolean {
	return SCAFFOLD_HINT_LINES.includes(line as (typeof SCAFFOLD_HINT_LINES)[number]);
}

function isPlaceholderLine(line: string): boolean {
	if (SCAFFOLD_PLACEHOLDERS.has(line)) {
		return true;
	}

	const stripped = stripListMarker(line);
	if (SCAFFOLD_PLACEHOLDERS.has(stripped)) {
		return true;
	}

	return /^\[[^\]]+\](?::\s*\[[^\]]+\])?$/.test(stripped);
}

function getMeaningfulTitleLength(content: string): number {
	const title = extractTitle(content);
	if (!title) {
		return 0;
	}

	const normalizedTitle = normalizeTitleValue(title);
	if (GENERIC_PLAN_TITLES.has(normalizedTitle)) {
		return 0;
	}

	return normalizedTitle.length;
}

function getMeaningfulBodyLines(content: string): string[] {
	return normalizeMarkdown(content)
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.filter((line) => !/^<!--.*-->$/.test(line))
		.filter((line) => !/^#{1,6}\s+/.test(line))
		.filter((line) => !isScaffoldHintLine(line))
		.filter((line) => !isScaffoldHeading(line))
		.filter((line) => !isPlaceholderLine(line))
		.filter((line) => stripListMarker(line).length > 0);
}

function getMeaningfulBodyLength(content: string): number {
	return getMeaningfulBodyLines(content)
		.map((line) => stripListMarker(line))
		.join(" ")
		.replace(/\s+/g, " ")
		.trim().length;
}

function countSubstantiveBodyLines(content: string): number {
	return getMeaningfulBodyLines(content).filter((line) => stripListMarker(line).length >= 12).length;
}

function isMostlyScaffoldContent(content: string): boolean {
	return getMeaningfulBodyLength(content) < 24 && countSubstantiveBodyLines(content) < 2;
}

export function createPlanScaffold(taskSummary?: string): string {
	const normalizedTaskSummary = taskSummary?.trim();
	const title = normalizedTaskSummary && normalizedTaskSummary.length > 0 ? normalizedTaskSummary : DEFAULT_PLAN_TITLE;
	const summary = normalizedTaskSummary && normalizedTaskSummary.length > 0 ? normalizedTaskSummary : DEFAULT_PLAN_SUMMARY;

	return [`${PLAN_TITLE_PREFIX}${title}`, "", ...SCAFFOLD_HINT_LINES, "", OVERVIEW_HEADING, summary, "", ...DEFAULT_SCAFFOLD_LINES.slice(3), ""].join("\n");
}

export function injectTaskSummaryIntoPlanContent(content: string, taskSummary: string): string {
	const normalizedTaskSummary = taskSummary.trim();
	if (normalizedTaskSummary.length === 0) {
		return content;
	}

	const normalizedContent = normalizeMarkdown(content);
	if (normalizedContent.trim().length === 0 || isMostlyScaffoldContent(normalizedContent)) {
		return createPlanScaffold(normalizedTaskSummary);
	}

	const lines = normalizedContent.split("\n");
	let replacedTitle = false;

	for (let index = 0; index < lines.length; index += 1) {
		const match = lines[index].match(/^#\s+(.*)$/);
		if (!match) {
			continue;
		}

		const currentTitle = match[1].trim();
		if (GENERIC_PLAN_TITLES.has(normalizeTitleValue(currentTitle))) {
			lines[index] = `${PLAN_TITLE_PREFIX}${normalizedTaskSummary}`;
		}
		replacedTitle = true;
		break;
	}

	if (!replacedTitle) {
		lines.unshift(`${PLAN_TITLE_PREFIX}${normalizedTaskSummary}`, "");
	}

	const summaryHeadingIndex = lines.findIndex((line) => line.trim() === OVERVIEW_HEADING);
	if (summaryHeadingIndex >= 0) {
		const currentSummaryLine = lines[summaryHeadingIndex + 1]?.trim() ?? "";
		if (currentSummaryLine.length === 0 || currentSummaryLine === DEFAULT_PLAN_SUMMARY) {
			lines[summaryHeadingIndex + 1] = normalizedTaskSummary;
		}
	}

	return lines.join("\n");
}

export function analyzePlanFileContent(content: string): PlanAnalysis {
	const normalized = normalizeMarkdown(content);
	const titleLength = getMeaningfulTitleLength(normalized);
	const bodyLength = getMeaningfulBodyLength(normalized);
	const substantiveLines = countSubstantiveBodyLines(normalized);
	const hasApprovalReadyPhrase = /ready to execute when approved\./i.test(normalized);
	const status =
		(titleLength >= 3 && (bodyLength >= 70 || substantiveLines >= 3)) ||
		(hasApprovalReadyPhrase && bodyLength >= 40) ||
		bodyLength >= 160 ||
		substantiveLines >= 5
			? "ready"
			: "draft";

	return {
		status,
		hash: createHash("sha1").update(normalized).digest("hex"),
		isValid: true,
	};
}
