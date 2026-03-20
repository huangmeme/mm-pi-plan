import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type ToolDocName = "enter_plan_mode" | "exit_plan_mode" | "ask_user_question";

export interface LoadedToolDocs {
	docs: Record<ToolDocName, string>;
	planModePrompt: string;
	warnings: string[];
}

const DEFAULT_DOCS: Record<ToolDocName, string> = {
	enter_plan_mode:
		"Request user approval to enter plan mode before planning a code-writing task.",
	exit_plan_mode:
		"Request user approval to exit plan mode after the active plan file exists and is up to date.",
	ask_user_question:
		"Ask the user a focused clarifying question when important requirements or tradeoffs are unresolved.",
};

const DEFAULT_PLAN_MODE_PROMPT = `
# Plan Mode
You are in plan mode, which is a session state used before implementing a complex coding task.

Rules:
- Do research, read files, inspect symbols, and gather evidence first.
- You may ask the user clarifying questions with ask_user_question.
- Do not use bash in plan mode.
- The only file you may modify is the plan file provided below.
- Maintain the implementation plan in that plan file as you work, not only at exit.
- If plan mode starts without a task summary, treat the first real user task prompt as the task.
- Sync new evidence and user answers back into the plan file before trying to exit.
- Only call exit_plan_mode after the plan file exists and is up to date.
- Do not call exit_plan_mode for pure research or codebase-understanding tasks.
`.trim();

function getToolDocsDir(): string {
	const currentFile = fileURLToPath(import.meta.url);
	return join(dirname(currentFile), "..", "tools");
}

export async function loadToolDocs(toolDocsDir: string = getToolDocsDir()): Promise<LoadedToolDocs> {
	const warnings: string[] = [];
	const docs = {} as Record<ToolDocName, string>;
	const docNames: ToolDocName[] = ["enter_plan_mode", "exit_plan_mode", "ask_user_question"];
	let planModePrompt = DEFAULT_PLAN_MODE_PROMPT;

	for (const docName of docNames) {
		const path = join(toolDocsDir, `${docName}.md`);
		try {
			docs[docName] = (await readFile(path, "utf-8")).trim();
		} catch (error) {
			docs[docName] = DEFAULT_DOCS[docName];
			const message = error instanceof Error ? error.message : String(error);
			warnings.push(`Failed to load ${docName}.md: ${message}`);
		}
	}

	try {
		planModePrompt = (await readFile(join(toolDocsDir, "PlanMode.md"), "utf-8")).trim();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		warnings.push(`Failed to load PlanMode.md: ${message}`);
	}

	return { docs, planModePrompt, warnings };
}
