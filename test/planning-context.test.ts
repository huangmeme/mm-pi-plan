import test from "node:test";
import assert from "node:assert/strict";
import { buildPlanModeIntroText } from "../src/planning-context.js";

test("buildPlanModeIntroText keeps the planning intro minimal when task summary exists", () => {
	const text = buildPlanModeIntroText({
		planFilePath: "C:/Users/test/.pi/plans/mint-panda-a8f3.md",
		taskSummary: "Plan the achievement sync fix",
	});

	assert.match(text, /^Plan mode is active\./);
	assert.match(text, /Active plan file: C:\/Users\/test\/.pi\/plans\/mint-panda-a8f3\.md/);
	assert.match(text, /Task summary: Plan the achievement sync fix/);
	assert.match(text, /Only update the active plan file while plan mode is active\./);
	assert.doesNotMatch(text, /reference template/i);
	assert.doesNotMatch(text, /Ready to execute when approved/i);
});

test("buildPlanModeIntroText handles missing task summary without extra teaching text", () => {
	const text = buildPlanModeIntroText({
		planFilePath: "C:/Users/test/.pi/plans/mint-panda-a8f3.md",
	});

	assert.match(text, /Task summary: waiting for the next real user task prompt\./);
	assert.doesNotMatch(text, /evidence/i);
	assert.doesNotMatch(text, /assumptions/i);
});
