// The bridge between the page and the main process: a short list of things the page may ask for,
// each by name. The page has no Node and no other way out.
import { contextBridge, ipcRenderer } from "electron";
import type { BoostState } from "./boost.ts";

const bridge = {
	state: () => ipcRenderer.invoke("sunny:state") as Promise<BoostState>,
	/** Sets the level (clamped to 100..300); 100 stops the boost. Writes are throttled to 10 a second. */
	set: (level: number) => ipcRenderer.invoke("sunny:set", level) as Promise<void>,
	/** Moves the level by x1.1 steps: 1 is "+", -1 is "-". */
	step: (steps: number) => ipcRenderer.invoke("sunny:step", steps) as Promise<void>,
	/** Turns the boost on (back to the last boosted level) or off. */
	toggle: (on: boolean) => ipcRenderer.invoke("sunny:toggle", on) as Promise<void>,
	quit: () => ipcRenderer.invoke("sunny:quit") as Promise<void>,
	/** Whether the app opens at login; null where that is not offered (development). */
	openAtLogin: () => ipcRenderer.invoke("sunny:login") as Promise<boolean | null>,
	/** Turns opening at login on or off; what comes back is the setting now. */
	setOpenAtLogin: (on: boolean) => ipcRenderer.invoke("sunny:login-set", on) as Promise<boolean | null>,
	/** The state, each time it changes. Returns a function that stops listening. */
	onState: (fn: (state: BoostState) => void) => {
		const listener = (_e: unknown, state: BoostState) => fn(state);
		ipcRenderer.on("sunny:state", listener);
		return () => void ipcRenderer.removeListener("sunny:state", listener);
	},
};

contextBridge.exposeInMainWorld("sunny", bridge);

export type Bridge = typeof bridge;
