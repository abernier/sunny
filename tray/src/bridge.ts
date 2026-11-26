// What the page has of the world outside itself: the bridge the preload script exposes. In a plain
// browser (`pnpm dev:page`, to work on the look) there is none, and an in-memory stand-in takes its place.
import type { BoostState } from "../electron/boost.ts";
import type { Bridge } from "../electron/preload.ts";
import { clampLevel, DEFAULT_BOOST, isBoost, MIN_LEVEL, stepLevel } from "./level.ts";

declare global {
	interface Window {
		sunny?: Bridge;
	}
}

function standIn(): Bridge {
	let state: BoostState = { level: DEFAULT_BOOST, running: true };
	let last = DEFAULT_BOOST;
	let atLogin = false;
	const listeners = new Set<(state: BoostState) => void>();
	const set = async (level: number) => {
		const next = clampLevel(level);
		if (isBoost(next)) last = next;
		state = { level: next, running: isBoost(next) };
		for (const fn of listeners) fn(state);
	};
	return {
		state: async () => state,
		set,
		step: (steps) => set(stepLevel(state.running ? state.level : MIN_LEVEL, steps)),
		toggle: (on) => set(on ? last : MIN_LEVEL),
		quit: async () => console.info("quit (stand-in bridge)"),
		openAtLogin: async () => atLogin,
		setOpenAtLogin: async (on) => (atLogin = on),
		onState: (fn) => {
			listeners.add(fn);
			return () => void listeners.delete(fn);
		},
	};
}

export const bridge: Bridge = window.sunny ?? standIn();
export type { BoostState };
