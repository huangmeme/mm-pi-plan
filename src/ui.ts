import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { basename, relative } from "node:path";
import type { PlanSessionState } from "./state.js";
import { PLAN_MODE_STATUS_KEY, PLAN_MODE_WIDGET_KEY } from "./state.js";

export type ExitPlanModeChoice = "approve" | "continue_planning";

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
	options?: string[],
): Promise<string | undefined> {
	if (!ctx.hasUI) {
		return undefined;
	}

	if (options && options.length > 0) {
		const choice = await ctx.ui.select(question, [...options, "Type a custom answer"]);
		if (choice === "Type a custom answer") {
			return ctx.ui.input(question);
		}
		return choice;
	}

	return ctx.ui.input(question);
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
