import { posix, win32 } from "node:path";
import { analyzePlanFileContent } from "./plan-file.js";

export const PLAN_MODE_TOOL_CANDIDATES = [
	"read",
	"grep",
	"find",
	"ls",
	"lsp",
	"ast_search",
	"web_search",
	"fetch_content",
	"get_search_content",
	"write",
	"edit",
	"enter_plan_mode",
	"exit_plan_mode",
	"ask_user_question",
] as const;

const WRITE_LIKE_TOOLS = new Set(["write", "edit", "ast_rewrite"]);

export function getPlanModeToolNames(availableTools: string[]): string[] {
	const available = new Set(availableTools);
	return PLAN_MODE_TOOL_CANDIDATES.filter((toolName) => available.has(toolName));
}

export function isWriteLikeTool(toolName: string): boolean {
	return WRITE_LIKE_TOOLS.has(toolName);
}

export function getToolPath(input: unknown): string | undefined {
	if (typeof input !== "object" || input === null) {
		return undefined;
	}

	const candidate = input as { path?: unknown };
	return typeof candidate.path === "string" ? candidate.path : undefined;
}

export function isSamePlanFilePath(
	input: unknown,
	planFilePath: string | undefined,
	cwd: string,
	platform: NodeJS.Platform = process.platform,
): boolean {
	if (!planFilePath) {
		return false;
	}

	const targetPath = getToolPath(input);
	if (!targetPath) {
		return false;
	}

	const pathApi = platform === "win32" ? win32 : posix;
	const normalizedTargetPath = pathApi.resolve(cwd, targetPath);
	const normalizedPlanPath = pathApi.resolve(planFilePath);

	if (platform === "win32") {
		return normalizedTargetPath.toLowerCase() === normalizedPlanPath.toLowerCase();
	}

	return normalizedTargetPath === normalizedPlanPath;
}

export function isPlanFileWriteAllowed(
	toolName: string,
	input: unknown,
	planFilePath: string | undefined,
	cwd: string,
	platform: NodeJS.Platform = process.platform,
): boolean {
	if (!planFilePath) {
		return false;
	}

	if (!isWriteLikeTool(toolName)) {
		return true;
	}

	return isSamePlanFilePath(input, planFilePath, cwd, platform);
}

export function isValidPlanFileContent(content: string): boolean {
	return analyzePlanFileContent(content).isValid;
}
