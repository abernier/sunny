// Compiles luminosity-boost from the repository's Swift source into .stage/boost/luminosity-boost: the
// program the packaged app carries in its resources, and the one development falls back to when
// ~/.local/bin has none. Skipped when the program is newer than its source.
//   node scripts/boost.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const source = path.resolve(root, "..", "boost", "luminosity-boost.swift");
// The name stays luminosity-boost: `pgrep -x` and `pkill -x` find it by that name, in the app and in the shell function.
export const boostProgram = path.join(root, ".stage", "boost", "luminosity-boost");

export function buildBoost() {
	if (fs.existsSync(boostProgram) && fs.statSync(boostProgram).mtimeMs >= fs.statSync(source).mtimeMs) return boostProgram;
	fs.mkdirSync(path.dirname(boostProgram), { recursive: true });
	execFileSync("swiftc", ["-O", "-target", "arm64-apple-macos13", source, "-o", boostProgram], { stdio: "inherit" });
	fs.chmodSync(boostProgram, 0o755);
	console.log(`built ${path.relative(root, boostProgram)}`);
	return boostProgram;
}

if (import.meta.filename === process.argv[1]) buildBoost();
