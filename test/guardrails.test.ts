import test from "node:test";
import assert from "node:assert/strict";
import {
	getPlanModeToolNames,
	isPlanFileWriteAllowed,
	isSamePlanFilePath,
	isValidPlanFileContent,
} from "../src/guardrails.js";

test("getPlanModeToolNames keeps allowed tools only", () => {
	const tools = getPlanModeToolNames(["read", "bash", "write", "enter_plan_mode", "custom"]);
	assert.deepEqual(tools, ["read", "write", "enter_plan_mode"]);
});

test("isPlanFileWriteAllowed only allows writes to the active plan file", () => {
	const cwd = "D:/Code/mm-pi-plan";
	const planFile = "D:/Code/mm-pi-plan/.pi/plans/current.md";
	assert.equal(
		isPlanFileWriteAllowed("write", { path: ".pi/plans/current.md" }, planFile, cwd),
		true,
	);
	assert.equal(
		isPlanFileWriteAllowed("write", { path: "src/index.ts" }, planFile, cwd),
		false,
	);
});

test("isPlanFileWriteAllowed treats Windows paths case-insensitively", () => {
	const cwd = "C:/Users/Tester";
	const planFile = "C:/Users/Tester/.pi/plans/mint-panda-a8f3.md";
	assert.equal(
		isPlanFileWriteAllowed("write", { path: ".pi/plans/MINT-PANDA-A8F3.md" }, planFile, cwd, "win32"),
		true,
	);
});

test("isSamePlanFilePath recognizes the active plan file for read-only checks", () => {
	const cwd = "C:/Users/Tester";
	const planFile = "C:/Users/Tester/.pi/plans/mint-panda-a8f3.md";
	assert.equal(
		isSamePlanFilePath({ path: ".pi/plans/mint-panda-a8f3.md" }, planFile, cwd, "win32"),
		true,
	);
	assert.equal(
		isSamePlanFilePath({ path: ".pi/plans/other.md" }, planFile, cwd, "win32"),
		false,
	);
});

test("isValidPlanFileContent stays permissive for existing plan artifacts", () => {
	assert.equal(isValidPlanFileContent(""), true);
	assert.equal(
		isValidPlanFileContent(
			"# Task\n\n## Goal\n\n## Evidence\n\n## Open Questions\n\n## Implementation Steps\n\n## Exit Criteria\n",
		),
		true,
	);
	assert.equal(
		isValidPlanFileContent(
			[
				"# Task",
				"Implement the planning lifecycle refactor.",
				"",
				"## Goal",
				"Unify manual and tool-based plan mode entry so the active plan file stays current throughout planning.",
				"",
				"## Evidence",
				"The extension currently relies on entry-specific guidance and duplicated context rules across several handlers.",
				"",
				"## Open Questions",
				"None.",
				"",
				"## Implementation Steps",
				"1. Add unified state transitions. 2. Track stale plan state. 3. Update context injection and exit checks.",
				"",
				"## Exit Criteria",
				"Plan mode cannot exit while evidence is unsynced and all relevant tests pass.",
			].join("\n"),
		),
		true,
	);
});
