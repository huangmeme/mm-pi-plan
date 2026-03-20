import test from "node:test";
import assert from "node:assert/strict";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
	buildEnterPlanPurpose,
	createEnterPlanPrompt,
	getAtomicQuestionViolation,
	normalizeQuestionOption,
	normalizeQuestionOptions,
	updatePlanModeUi,
} from "../src/ui.js";
import type { PlanSessionState } from "../src/state.js";

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

test("buildEnterPlanPurpose prefers task summary and merges reason when both exist", () => {
	assert.equal(buildEnterPlanPurpose(undefined, undefined), undefined);
	assert.equal(buildEnterPlanPurpose("Need planning before editing files", undefined), "Need planning before editing files");
	assert.equal(buildEnterPlanPurpose(undefined, "Test Plan Mode workflow"), "Test Plan Mode workflow");
	assert.equal(
		buildEnterPlanPurpose("Need planning before editing files", "Test Plan Mode workflow"),
		"Test Plan Mode workflow. Need planning before editing files",
	);
});

test("createEnterPlanPrompt keeps enter mode minimal with yes/no options", () => {
	const prompt = createEnterPlanPrompt(
		"User wants to test the full planning flow.",
		"Test Plan Mode workflow",
	);

	assert.equal(prompt.title, "Enter Plan Mode");
	assert.equal(prompt.question, "Allow the agent to enter plan mode?");
	assert.equal(
		prompt.context,
		"Purpose: Test Plan Mode workflow. User wants to test the full planning flow.",
	);
	assert.deepEqual(prompt.options, ["Yes", "No"]);
	assert.equal(prompt.showOptionsHeader, false);
	assert.equal(prompt.customAnswerEnabled, false);
	assert.ok(!prompt.context?.includes("Reason:"));
	assert.ok(!prompt.context?.includes("Task:"));
});

test("updatePlanModeUi renders a minimal cached plan status", () => {
	const statusCalls: Array<string | undefined> = [];
	const widgetCalls: unknown[] = [];
	const ctx = {
		hasUI: true,
		ui: {
			theme: {
				fg: (_color: string, text: string) => `[${text}]`,
			},
			setStatus: (_key: string, value: string | undefined) => {
				statusCalls.push(value);
			},
			setWidget: (_key: string, value: unknown) => {
				widgetCalls.push(value);
			},
		},
	} as unknown as ExtensionContext;

	const state: PlanSessionState = {
		mode: "planning",
		planFilePath: "C:\\Users\\huangmeme\\.pi\\plans\\sunny-rocket-7d02.md",
		planStatus: "draft",
		planNeedsSync: false,
	};

	updatePlanModeUi(ctx, state);
	updatePlanModeUi(ctx, state);
	updatePlanModeUi(ctx, {
		...state,
		planNeedsSync: true,
	});

	assert.deepEqual(statusCalls, ["[Plan]"]);
	assert.deepEqual(widgetCalls, [undefined]);

	updatePlanModeUi(ctx, { mode: "normal", planStatus: "empty", planNeedsSync: false });

	assert.deepEqual(statusCalls, ["[Plan]", undefined]);
	assert.deepEqual(widgetCalls, [undefined]);
});
