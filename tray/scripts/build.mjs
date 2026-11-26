// Builds the app into dist/ (the page) and dist-electron/ (main process and preload), and
// luminosity-boost into .stage/boost/ (scripts/boost.mjs).
//   node scripts/build.mjs            everything
//   node scripts/build.mjs --main     only the main process and the preload (what `dev` needs)
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { buildBoost } from "./boost.mjs";

const root = path.resolve(import.meta.dirname, "..");

/** The main process and the preload, into dist-electron/. */
export async function buildMain() {
	const common = { bundle: true, platform: "node", target: "node22", external: ["electron"], sourcemap: true, logLevel: "warning", absWorkingDir: root };
	await build({ ...common, entryPoints: ["electron/main.ts"], outfile: path.join(root, "dist-electron", "main.js"), format: "esm" });
	// A sandboxed preload is loaded as a classic script.
	await build({ ...common, entryPoints: ["electron/preload.ts"], outfile: path.join(root, "dist-electron", "preload.cjs"), format: "cjs" });
}

/** The tray icon, made once (scripts/icon.mjs). */
export function ensureIcon() {
	if (!fs.existsSync(path.join(root, "assets", "trayTemplate.png"))) execFileSync(process.execPath, [path.join(root, "scripts", "icon.mjs")], { stdio: "inherit" });
}

/** The page, into dist/. */
function buildPage() {
	execFileSync(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js"), "build"], { cwd: root, stdio: "inherit" });
}

if (import.meta.filename === process.argv[1]) {
	ensureIcon();
	await buildMain();
	if (!process.argv.includes("--main")) {
		buildPage();
		buildBoost();
	}
}
