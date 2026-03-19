import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadToolDocs } from "../src/tool-docs.js";

test("loadToolDocs reads markdown files and falls back when missing", async () => {
	const dir = await mkdtemp(join(tmpdir(), "mm-pi-plan-"));
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, "enter_plan_mode.md"), "enter doc", "utf-8");
	await writeFile(join(dir, "exit_plan_mode.md"), "exit doc", "utf-8");
	await writeFile(join(dir, "PlanMode.md"), "plan mode doc", "utf-8");

	const result = await loadToolDocs(dir);

	assert.equal(result.docs.enter_plan_mode, "enter doc");
	assert.equal(result.docs.exit_plan_mode, "exit doc");
	assert.equal(result.planModePrompt, "plan mode doc");
	assert.match(result.docs.ask_user_question, /Ask the user/i);
	assert.equal(result.warnings.length, 1);
});
