import test from "node:test";
import assert from "node:assert/strict";
import { getPlanModeToolNames, isPlanFileWriteAllowed, isValidPlanFileContent } from "../src/guardrails.js";

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

test("isValidPlanFileContent requires meaningful content", () => {
	assert.equal(isValidPlanFileContent("short"), false);
	assert.equal(
		isValidPlanFileContent("# Implementation Plan\n\n## Goal\n\n## Evidence\n\n## Proposed Steps\n"),
		false,
	);
	assert.equal(
		isValidPlanFileContent("# Plan\n\n1. Inspect the current design\n2. Draft file changes\n3. Validate edge cases"),
		true,
	);
});
