// The luminosity-boost tool, driven as the `luminosity` shell function drives it: the level lives in a
// state file that the running boost re-reads every 100 ms, so changing the level is rewriting the file.
// The process runs only while the level is a boost, and is started detached so that it outlives this app.
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { clampLevel, isBoost, parseLevel } from "../src/level.ts";

/** The program's name: `pgrep -x` and `pkill -x` match it, here and in the shell function. */
export const BOOST_NAME = "luminosity-boost";

/**
 * Which luminosity-boost to run, first found: `SUNNY_BOOST_BIN`; the one the packaged app carries in its
 * resources; the one `install.sh` puts in ~/.local/bin; the one `scripts/boost.mjs` builds in development.
 */
export function resolveBoostBin(options: { env: NodeJS.ProcessEnv; resourcesPath: string | undefined; home: string; appRoot: string; exists: (file: string) => boolean }): string {
	const { env, resourcesPath, home, appRoot, exists } = options;
	if (env.SUNNY_BOOST_BIN) return env.SUNNY_BOOST_BIN;
	const candidates = [resourcesPath && path.join(resourcesPath, BOOST_NAME), path.join(home, ".local", "bin", BOOST_NAME), path.join(appRoot, ".stage", "boost", BOOST_NAME)].filter((file): file is string => Boolean(file));
	return candidates.find(exists) ?? candidates.at(-1)!;
}

/** Where the tool's program and its state file are. The environment can point elsewhere (for a trial run). */
export const BOOST_BIN = resolveBoostBin({
	env: process.env,
	// Electron's own, set in the main process only; in development it holds no luminosity-boost.
	resourcesPath: (process as { resourcesPath?: string }).resourcesPath,
	home: os.homedir(),
	// This module is bundled into dist-electron/, one level below the app's folder, as electron/ is.
	appRoot: path.resolve(import.meta.dirname, ".."),
	exists: (file) => fs.existsSync(file),
});
export const STATE_FILE = process.env.SUNNY_STATE_FILE ?? path.join(os.homedir(), ".local", "state", "luminosity-percent");

/** What the page and the tray show: the level the file holds, and whether the boost is running. */
export type BoostState = { level: number; running: boolean };

export function readLevel(): number {
	try {
		return parseLevel(fs.readFileSync(STATE_FILE, "utf8"));
	} catch {
		return parseLevel(undefined);
	}
}

/** Whether the boost runs: `pgrep -x` ends with 0 when a process has that exact name. */
export function isRunning(): Promise<boolean> {
	return new Promise((resolve) => execFile("/usr/bin/pgrep", ["-x", BOOST_NAME], (error) => resolve(!error)));
}

function stop(): Promise<void> {
	return new Promise((resolve) => execFile("/usr/bin/pkill", ["-x", BOOST_NAME], () => resolve()));
}

function start(): void {
	spawn(BOOST_BIN, [], { detached: true, stdio: "ignore" }).unref();
}

/** Sets the level: writes the file, then stops the boost for a normal level or starts it if it is not running. */
export async function setLevel(value: number): Promise<BoostState> {
	const level = clampLevel(value);
	fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
	fs.writeFileSync(STATE_FILE, `${level}\n`);
	if (!isBoost(level)) {
		await stop();
		return { level, running: false };
	}
	if (!(await isRunning())) start();
	return { level, running: true };
}

export async function readState(): Promise<BoostState> {
	return { level: readLevel(), running: await isRunning() };
}

/**
 * Follows changes made from anywhere (the shell function, another app): the state file is watched,
 * and the process is polled since nothing announces that it started or ended. `onState` gets the state
 * after every check, changed or not. A change of the file is read a moment later, once whoever wrote it
 * has had time to start or stop the process.
 */
export function watchState(onState: (state: BoostState) => void, pollMs = 1000, settleMs = 300): () => void {
	let checking = false;
	let settle: ReturnType<typeof setTimeout> | undefined;
	const check = async () => {
		if (checking) return;
		checking = true;
		try {
			onState(await readState());
		} finally {
			checking = false;
		}
	};
	// The directory is watched, not the file: an editor or `echo >` may replace the file, and it may not exist yet.
	const dir = path.dirname(STATE_FILE);
	fs.mkdirSync(dir, { recursive: true });
	const watcher = fs.watch(dir, (_event, name) => {
		if (name && name !== path.basename(STATE_FILE)) return;
		clearTimeout(settle);
		settle = setTimeout(check, settleMs);
	});
	const timer = setInterval(check, pollMs);
	void check();
	return () => {
		watcher.close();
		clearTimeout(settle);
		clearInterval(timer);
	};
}
