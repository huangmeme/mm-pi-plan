import test from "node:test";
import assert from "node:assert/strict";
import {
	analyzePlanFileContent,
	createPlanScaffold,
	injectTaskSummaryIntoPlanContent,
} from "../src/plan-file.js";

const TASK_NAME = "\u4efb\u52a1\u540d\u79f0";
const TASK_SUMMARY = "\u4efb\u52a1\u7b80\u8ff0";
const OVERVIEW = "\u6982\u8ff0";
const STEPS = "\u5b9e\u73b0\u6b65\u9aa4";
const FILES = "\u6d89\u53ca\u6587\u4ef6";
const RISKS = "\u98ce\u9669/\u6ce8\u610f\u4e8b\u9879";

test("createPlanScaffold creates a lightweight reference template", () => {
	const content = createPlanScaffold();

	assert.match(content, new RegExp(`^# Plan: \\[${TASK_NAME}\\]`));
	assert.match(content, /Reference template only\./);
	assert.match(content, /A strong plan usually captures/);
	assert.match(content, new RegExp(`## ${OVERVIEW}`));
	assert.match(content, new RegExp(`## ${STEPS}`));
	assert.match(content, new RegExp(`## ${FILES}`));
	assert.match(content, new RegExp(`## ${RISKS}`));
});

test("injectTaskSummaryIntoPlanContent fills the placeholder title and overview", () => {
	const summary = "\u4fee\u590d\u65b0\u7684\u6210\u5c31\u6d41\u7a0b";
	const updated = injectTaskSummaryIntoPlanContent(createPlanScaffold(), summary);

	assert.match(updated, new RegExp(`^# Plan: ${summary}`, "m"));
	assert.match(updated, new RegExp(`## ${OVERVIEW}\\n${summary}`));
	assert.doesNotMatch(updated, new RegExp(`\\[${TASK_NAME}\\]`));
	assert.doesNotMatch(updated, new RegExp(`\\[${TASK_SUMMARY}\\]`));
});

test("analyzePlanFileContent marks a placeholder-only reference template as draft", () => {
	const analysis = analyzePlanFileContent(createPlanScaffold());
	assert.equal(analysis.status, "draft");
	assert.equal(analysis.isValid, true);
});

test("analyzePlanFileContent treats ready phrase as a positive signal, not a hard requirement", () => {
	const content = [
		"# Plan: Fix the achievement sync flow",
		"",
		"Goal understanding: keep local unlock state consistent with Steam failures and retries.",
		"Evidence gathered: Steam failures currently desync local memory from persisted retry state.",
		"Plan: route unlocks through one manager, record pending retries, and validate idempotent recovery.",
		"Ready to execute when approved.",
	].join("\n");

	const analysis = analyzePlanFileContent(content);
	assert.equal(analysis.status, "ready");
});

test("analyzePlanFileContent keeps the legacy English template compatible", () => {
	const content = [
		"# Task",
		"Implement yank mode for vim interactions.",
		"",
		"## Goal",
		"Add a yank operation that captures the current selection and reuses existing vim-mode command handling.",
		"",
		"## Evidence",
		"Current vim-mode key handling already routes motions through a shared state machine in src/vim/mode.ts.",
		"",
		"## Open Questions",
		"None.",
		"",
		"## Implementation Steps",
		"1. Add a yank action to the command enum. 2. Wire it into visual selection handling. 3. Cover cursor edge cases in tests.",
		"",
		"## Exit Criteria",
		"Users can yank a visual selection and the related tests pass for normal and visual modes.",
		"",
	].join("\n");

	const analysis = analyzePlanFileContent(content);
	assert.equal(analysis.status, "ready");
	assert.equal(analysis.isValid, true);
	assert.match(analysis.hash, /^[a-f0-9]{40}$/);
});

test("analyzePlanFileContent keeps historical Chinese design-doc plans compatible", () => {
	const content = [
		"# \u4fee\u590d\u9053\u5177\u540c\u6b65\u95ee\u9898",
		"",
		"## \u80cc\u666f",
		"\u8054\u673a\u623f\u95f4\u91cc\u666e\u901a\u9053\u5177\u53ea\u6709\u672c\u5730\u73a9\u5bb6\u80fd\u770b\u5230\uff0c\u5176\u4ed6\u73a9\u5bb6\u4e0d\u4f1a\u6536\u5230\u540c\u6b65\u521b\u5efa\u6d88\u606f\uff0c\u6240\u4ee5\u89c6\u89c9\u6548\u679c\u4e0d\u4e00\u81f4\u3002",
		"",
		"## \u73b0\u72b6 / \u95ee\u9898",
		"\u5f53\u524d ItemNetworkModule \u53ea\u5904\u7406 buff \u7684\u8bf7\u6c42\u54cd\u5e94\u94fe\u8def\uff0c\u98de\u884c\u9053\u5177\u548c\u666e\u901a\u9053\u5177\u6ca1\u6709\u7edf\u4e00\u7684\u540c\u6b65\u5165\u53e3\u3002",
		"",
		"## \u65b9\u6848",
		"\u628a\u9053\u5177\u4f7f\u7528\u7edf\u4e00\u6536\u655b\u5230\u4e00\u4e2a\u7f51\u7edc\u6a21\u5757\u91cc\uff0c\u666e\u901a\u9053\u5177\u76f4\u63a5\u5e7f\u64ad\u521b\u5efa\u4e8b\u4ef6\uff0cbuff \u4fdd\u7559\u8bf7\u6c42\u54cd\u5e94\u68c0\u67e5\u3002",
		"",
		"## \u5173\u952e\u6539\u52a8",
		"\u65b0\u589e\u7edf\u4e00 payload\uff0c\u4fee\u6539 ItemNetworkModule \u7684\u672c\u5730\u548c\u8fdc\u7aef\u5904\u7406\u903b\u8f91\uff0c\u5e76\u8865\u4e0a\u6d88\u606f\u7c7b\u578b\u5e38\u91cf\u548c\u6ce8\u518c\u3002",
		"",
		"## \u9a8c\u8bc1",
		"\u672c\u5730\u4e0e\u8fdc\u7aef\u73a9\u5bb6\u90fd\u80fd\u770b\u5230\u9053\u5177\u6548\u679c\uff0cbuff \u4ecd\u7136\u7ef4\u6301\u539f\u6765\u7684\u51b2\u7a81\u68c0\u67e5\uff0c\u5e76\u4e14\u7f51\u7edc\u6d88\u606f\u65e5\u5fd7\u53ef\u4ee5\u786e\u8ba4\u5e7f\u64ad\u53d1\u9001\u6210\u529f\u3002",
	].join("\n");

	const analysis = analyzePlanFileContent(content);
	assert.equal(analysis.status, "ready");
	assert.equal(analysis.isValid, true);
});

test("analyzePlanFileContent accepts mature freeform plans that do not follow the reference template", () => {
	const content = [
		"# Achievement sync plan",
		"",
		"This plan updates the achievement flow so failed Steam writes do not silently desync local state and remote retries.",
		"The current issue is that unlocks can be recorded locally even when Steam reports a transient failure, which means later checks cannot safely tell whether the achievement should retry.",
		"The implementation will move Steam result handling behind a single manager, record pending retries explicitly, and keep the UI feedback separate from persistence state.",
		"Validation will cover Steam API false returns, StoreStats failures, restart recovery, and repeated CheckAchievements calls so the system remains idempotent.",
	].join("\n");

	const analysis = analyzePlanFileContent(content);
	assert.equal(analysis.status, "ready");
	assert.equal(analysis.isValid, true);
});
