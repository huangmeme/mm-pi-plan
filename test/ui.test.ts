import test from "node:test";
import assert from "node:assert/strict";
import {
	getAtomicQuestionViolation,
	normalizeQuestionOption,
	normalizeQuestionOptions,
} from "../src/ui.js";

test("normalizeQuestionOption strips numbering and bullets", () => {
	assert.equal(normalizeQuestionOption("1) Enabled"), "Enabled");
	assert.equal(normalizeQuestionOption("- Disabled"), "Disabled");
	assert.equal(normalizeQuestionOption("  3: Something else "), "Something else");
});

test("normalizeQuestionOptions removes duplicates after normalization", () => {
	assert.deepEqual(
		normalizeQuestionOptions(["1) Enabled", "Enabled", "- Disabled", "  "]),
		["Enabled", "Disabled"],
	);
});

test("getAtomicQuestionViolation rejects multiple questions in one call", () => {
	assert.match(
		getAtomicQuestionViolation("1) Should this be enabled? 2) Where should it live?") ?? "",
		/separate|multiple/i,
	);
	assert.match(
		getAtomicQuestionViolation("Should this be enabled? Should it also be visible by default?") ?? "",
		/separate|multiple/i,
	);
});

test("getAtomicQuestionViolation allows a single focused question", () => {
	assert.equal(getAtomicQuestionViolation("Should this feature be enabled by default?"), undefined);
});
