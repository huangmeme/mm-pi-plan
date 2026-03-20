import test from "node:test";
import assert from "node:assert/strict";
import {
	createFunPlanFileName,
	createPlanFilePath,
	getPlanDisplayStatus,
	restoreStateFromSession,
} from "../src/state.js";

test("createFunPlanFileName creates an adjective-noun-random filename", () => {
	const fileName = createFunPlanFileName("a8f3", 2, 3);
	assert.equal(fileName, "cosmic-noodle-a8f3.md");
});

test("createPlanFilePath stores plans under the user home .pi/plans directory with a fun md name", () => {
	const path = createPlanFilePath("C:/Users/tester", "mint-panda-a8f3.md");
	assert.match(path, /C:[/\\]Users[/\\]tester[/\\]\.pi[/\\]plans[/\\]mint-panda-a8f3\.md$/);
});

test("getPlanDisplayStatus reports stale when a non-empty plan needs sync", () => {
	assert.equal(
		getPlanDisplayStatus({
			mode: "planning",
			planFilePath: "C:/Users/tester/.pi/plans/mint-panda-a8f3.md",
			taskSummary: "Plan the achievement sync fix",
			planStatus: "draft",
			planNeedsSync: true,
		}),
		"stale",
	);
});

test("restoreStateFromSession keeps extended plan session fields", () => {
	const state = restoreStateFromSession({
		getEntries() {
			return [
				{
					type: "custom",
					customType: "pi-plan-state",
					data: {
						mode: "planning",
						planFilePath: "C:/Users/tester/.pi/plans/mint-panda-a8f3.md",
						taskSummary: "Implement yank mode",
						planStatus: "draft",
						planNeedsSync: true,
						lastPlanHash: "abc123",
						lastEvidenceSource: "read: src/index.ts",
					},
				},
			];
		},
	});

	assert.equal(state.mode, "planning");
	assert.equal(state.planFilePath, "C:/Users/tester/.pi/plans/mint-panda-a8f3.md");
	assert.equal(state.taskSummary, "Implement yank mode");
	assert.equal(state.planStatus, "draft");
	assert.equal(state.planNeedsSync, true);
	assert.equal(state.lastPlanHash, "abc123");
	assert.equal(state.lastEvidenceSource, "read: src/index.ts");
});
