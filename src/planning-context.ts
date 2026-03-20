import type { PlanSessionState } from "./state.js";

export function buildPlanModeIntroText(state: Pick<PlanSessionState, "planFilePath" | "taskSummary">): string {
	return [
		"Plan mode is active.",
		`Active plan file: ${state.planFilePath ?? "not set"}`,
		state.taskSummary
			? `Task summary: ${state.taskSummary}`
			: "Task summary: waiting for the next real user task prompt.",
		"Only update the active plan file while plan mode is active.",
	].join("\n");
}
