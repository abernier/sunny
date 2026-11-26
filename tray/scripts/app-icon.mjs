// Renders the app icon, assets/icon.svg, to assets/icon.png (1024x1024) and assets/icon.icns (16 to 1024, with @2x),
// which the packed app carries. Both outputs are committed: this only has to run after icon.svg changes.
//   node scripts/app-icon.mjs              always render
//   node scripts/app-icon.mjs --if-stale   only when an output is missing or older than icon.svg
//
// No dependency: the SVG is rendered by `rsvg-convert` if it is on the PATH, otherwise by a headless Chrome
// (SUNNY_CHROME, or the newest Chrome for Testing that Playwright or Puppeteer downloaded). `sips` scales the
// 1024 render down and `iconutil` packs the iconset, both part of macOS.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const svg = path.join(root, "assets", "icon.svg");
const png = path.join(root, "assets", "icon.png");
const icns = path.join(root, "assets", "icon.icns");

/** Whether icon.png or icon.icns is missing or older than icon.svg. */
export function isStale() {
	const source = fs.statSync(svg).mtimeMs;
	return [png, icns].some((file) => !fs.existsSync(file) || fs.statSync(file).mtimeMs < source);
}

/** A program on the PATH, or undefined. */
function which(program) {
	try {
		return execFileSync("/usr/bin/which", [program], { encoding: "utf8" }).trim() || undefined;
	} catch {
		return undefined;
	}
}

/** The newest headless Chrome found: SUNNY_CHROME, then the Playwright and Puppeteer download caches. */
function findChrome() {
	if (process.env.SUNNY_CHROME) return process.env.SUNNY_CHROME;
	const home = os.homedir();
	const candidates = [];
	const playwright = path.join(home, "Library", "Caches", "ms-playwright");
	for (const dir of fs.existsSync(playwright) ? fs.readdirSync(playwright) : []) {
		const version = Number(dir.split("-").pop());
		if (dir.startsWith("chromium_headless_shell-")) candidates.push({ version, file: path.join(playwright, dir, "chrome-headless-shell-mac-arm64", "chrome-headless-shell") });
		if (dir.startsWith("chromium-")) candidates.push({ version, file: path.join(playwright, dir, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing") });
	}
	const puppeteer = path.join(home, ".cache", "puppeteer", "chrome-headless-shell");
	for (const dir of fs.existsSync(puppeteer) ? fs.readdirSync(puppeteer) : []) {
		candidates.push({ version: Number(dir.split(".")[2] ?? 0), file: path.join(puppeteer, dir, "chrome-headless-shell-mac-arm64", "chrome-headless-shell") });
	}
	return candidates.filter((c) => fs.existsSync(c.file)).sort((a, b) => b.version - a.version)[0]?.file;
}

/** Renders an SVG file to a square PNG of `size` pixels, transparent where the SVG draws nothing. */
export function renderSvg(input, output, size) {
	const rsvg = which("rsvg-convert");
	if (rsvg) {
		execFileSync(rsvg, ["--width", String(size), "--height", String(size), "--output", output, input]);
		return;
	}
	const chrome = findChrome();
	if (!chrome) throw new Error("no SVG renderer: install librsvg (brew install librsvg), or set SUNNY_CHROME to a headless Chrome");
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-icon-"));
	try {
		// A page that shows the SVG at exactly size x size, so the screenshot is the icon.
		const page = path.join(tmp, "page.html");
		const style = `html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}`;
		fs.writeFileSync(page, `<!doctype html><style>${style}</style><img src="${new URL(`file://${input}`).href}">`);
		execFileSync(
			chrome,
			[
				"--headless",
				"--use-mock-keychain",
				"--password-store=basic",
				`--user-data-dir=${path.join(tmp, "profile")}`,
				"--no-first-run",
				"--disable-gpu",
				"--hide-scrollbars",
				"--force-device-scale-factor=1",
				"--default-background-color=00000000",
				"--allow-file-access-from-files",
				`--window-size=${size},${size}`,
				`--screenshot=${output}`,
				`file://${page}`,
			],
			{ stdio: "ignore" },
		);
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
	if (!fs.existsSync(output)) throw new Error(`${chrome} did not write ${output}`);
}

/** Renders icon.png, then scales it into an iconset and packs icon.icns. */
export function renderAppIcon() {
	renderSvg(svg, png, 1024);
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-iconset-"));
	const iconset = path.join(tmp, "icon.iconset");
	fs.mkdirSync(iconset);
	try {
		for (const size of [16, 32, 128, 256, 512]) {
			for (const [scale, suffix] of [[1, ""], [2, "@2x"]]) {
				const file = path.join(iconset, `icon_${size}x${size}${suffix}.png`);
				execFileSync("/usr/bin/sips", ["-z", String(size * scale), String(size * scale), png, "--out", file], { stdio: "ignore" });
			}
		}
		execFileSync("/usr/bin/iconutil", ["--convert", "icns", "--output", icns, iconset]);
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
}

if (import.meta.filename === process.argv[1]) {
	if (process.argv.includes("--if-stale") && !isStale()) process.exit(0);
	renderAppIcon();
	console.log("wrote assets/icon.png and assets/icon.icns");
}
