import test from "node:test";
import assert from "node:assert/strict";
import { createFunPlanFileName, createPlanFilePath } from "../src/state.js";

test("createFunPlanFileName creates an adjective-noun-random filename", () => {
	const fileName = createFunPlanFileName("a8f3", 2, 3);
	assert.equal(fileName, "cosmic-noodle-a8f3.md");
});

test("createPlanFilePath stores plans under the user home .pi/plans directory with a fun md name", () => {
	const path = createPlanFilePath("C:/Users/tester", "mint-panda-a8f3.md");
	assert.match(path, /C:[/\\]Users[/\\]tester[/\\]\.pi[/\\]plans[/\\]mint-panda-a8f3\.md$/);
});
