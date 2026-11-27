// The luminosity-boost tool, driven as the `luminosity` shell function drives it: the level lives in a
// state file that the running boost re-reads every 100 ms, so changing the level is rewriting the file.
// The process runs only while the level is a boost, and is started detached so that it outlives this app.
//
// The Mac App Store build (`process.mas`) is sandboxed: it can run only the program it carries, its home
// is its container, and it cannot see a boost it did not start. There the boost is this app's child,
// tracked as such, and it ends with the app.
import { type ChildProcess, execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { clampLevel, isBoost, parseLevel } from "../src/level.ts";

/** The program's name: `pgrep -x` and `pkill -x` match it, here and in the shell function. */
export const BOOST_NAME = "luminosity-boost";

/** Whether this is the sandboxed Mac App Store build: Electron's own flag, set in its MAS builds only. */
export const IS_MAS = (process as { mas?: boolean }).mas === true;

/**
 * Which luminosity-boost to run, first found: `SUNNY_BOOST_BIN`; the one the packaged app carries in its
 * resources; the one `install.sh` puts in ~/.local/bin; the one `scripts/boost.mjs` builds in development.
 * The Mac App Store build runs the one it carries, and nothing else.
 */
export function resolveBoostBin(options: { env: NodeJS.ProcessEnv; resourcesPath: string | undefined; home: string; appRoot: string; exists: (file: string) => boolean; mas?: boolean }): string {
	const { env, resourcesPath, home, appRoot, exists, mas = false } = options;
	if (mas && resourcesPath) return path.join(resourcesPath, BOOST_NAME);
	if (env.SUNNY_BOOST_BIN) return env.SUNNY_BOOST_BIN;
	const candidates = [resourcesPath && path.join(resourcesPath, BOOST_NAME), path.join(home, ".local", "bin", BOOST_NAME), path.join(appRoot, ".stage", "boost", BOOST_NAME)].filter((file): file is string => Boolean(file));
	return candidates.find(exists) ?? candidates.at(-1)!;
}

/**
 * The state file: `SUNNY_STATE_FILE`, else the one the shell function shares, ~/.local/state/luminosity-percent.
 * The Mac App Store build keeps its own in its data folder (Electron's userData, inside the container): the
 * boost it starts is told where, and the shell function cannot reach it anyway.
 */
export function resolveStateFile(options: { env: NodeJS.ProcessEnv; home: string; mas?: boolean }): string {
	const { env, home, mas = false } = options;
	if (mas) return path.join(home, "Library", "Application Support", "Sunny", "luminosity-percent");
	return env.SUNNY_STATE_FILE ?? path.join(home, ".local", "state", "luminosity-percent");
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
	mas: IS_MAS,
});
// In the sandbox, the home directory is the container's.
export const STATE_FILE = resolveStateFile({ env: process.env, home: os.homedir(), mas: IS_MAS });

/** What the page and the tray show: the level the file holds, and whether the boost is running. */
export type BoostState = { level: number; running: boolean };

export function readLevel(): number {
	try {
		return parseLevel(fs.readFileSync(STATE_FILE, "utf8"));
	} catch {
		return parseLevel(undefined);
	}
}

/** The boost this app started, in the Mac App Store build: the only one it can know about. */
let child: ChildProcess | undefined;

function childRunning(): boolean {
	return child !== undefined && child.exitCode === null && child.signalCode === null;
}

/** Whether the boost runs: `pgrep -x` ends with 0 when a process has that exact name. */
export function isRunning(): Promise<boolean> {
	if (IS_MAS) return Promise.resolve(childRunning());
	return new Promise((resolve) => execFile("/usr/bin/pgrep", ["-x", BOOST_NAME], (error) => resolve(!error)));
}

function stop(): Promise<void> {
	if (IS_MAS) {
		const running = child;
		if (!running || !childRunning()) return Promise.resolve();
		// SIGTERM: the boost restores the gamma, then ends.
		return new Promise((resolve) => {
			running.once("exit", () => resolve());
			running.kill("SIGTERM");
		});
	}
	return new Promise((resolve) => execFile("/usr/bin/pkill", ["-x", BOOST_NAME], () => resolve()));
}

/** Ends the boost this app started, if any, at once: the Mac App Store build's boost does not outlive the app. */
export function stopOwnBoost(): void {
	if (childRunning()) child!.kill("SIGTERM");
}

function start(): void {
	// The boost is told which state file to read: its own default is the shell function's.
	const env = { ...process.env, LUMINOSITY_STATE_FILE: STATE_FILE };
	if (IS_MAS) {
		// Not detached, and ended with the app even if the app crashes (the boost watches its parent).
		child = spawn(BOOST_BIN, [], { stdio: "ignore", env: { ...env, LUMINOSITY_EXIT_WITH_PARENT: "1" } });
		child.on("error", (error) => console.error("[sunny] could not start the boost:", error));
		return;
	}
	spawn(BOOST_BIN, [], { detached: true, stdio: "ignore", env }).unref();
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
