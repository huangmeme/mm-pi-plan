import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

export const PLAN_STATE_ENTRY_TYPE = "pi-plan-state";
export const PLAN_MODE_STATUS_KEY = "mm-pi-plan";
export const PLAN_MODE_WIDGET_KEY = "mm-pi-plan-widget";

export type PlanMode = "normal" | "planning";

export interface PlanSessionState {
	mode: PlanMode;
	planFilePath?: string;
}

export interface PlanStateEntry {
	mode: PlanMode;
	planFilePath?: string;
}

interface SessionEntryReader {
	getEntries(): unknown[];
}

const PLAN_ADJECTIVES = [
	"amber",
	"brisk",
	"cosmic",
	"fuzzy",
	"lucky",
	"mint",
	"quiet",
	"sunny",
	"velvet",
	"witty",
] as const;

const PLAN_NOUNS = [
	"badger",
	"comet",
	"lantern",
	"noodle",
	"otter",
	"panda",
	"quill",
	"rocket",
	"sprout",
	"teacup",
] as const;

export function createDefaultState(): PlanSessionState {
	return { mode: "normal" };
}

export function createPlanStateEntry(state: PlanSessionState): PlanStateEntry {
	return {
		mode: state.mode,
		planFilePath: state.planFilePath,
	};
}

export function createFunPlanFileName(
	randomHex: string = randomBytes(2).toString("hex"),
	adjectiveIndex: number = Math.floor(Math.random() * PLAN_ADJECTIVES.length),
	nounIndex: number = Math.floor(Math.random() * PLAN_NOUNS.length),
): string {
	const adjective = PLAN_ADJECTIVES[adjectiveIndex % PLAN_ADJECTIVES.length];
	const noun = PLAN_NOUNS[nounIndex % PLAN_NOUNS.length];
	return `${adjective}-${noun}-${randomHex}.md`;
}

export function createPlanFilePath(
	userHomeDir: string = homedir(),
	fileName: string = createFunPlanFileName(),
): string {
	return join(userHomeDir, ".pi", "plans", fileName);
}

export function restoreStateFromSession(sessionManager: SessionEntryReader): PlanSessionState {
	const entries = sessionManager.getEntries();
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index] as {
			type?: string;
			customType?: string;
			data?: PlanStateEntry;
		};
		if (entry.type !== "custom" || entry.customType !== PLAN_STATE_ENTRY_TYPE || !entry.data) {
			continue;
		}

		return {
			mode: entry.data.mode === "planning" ? "planning" : "normal",
			planFilePath: entry.data.planFilePath,
		};
	}

	return createDefaultState();
}
