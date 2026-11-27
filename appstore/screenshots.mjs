// The Mac App Store screenshots: 2880 x 1800 PNGs (16:10, no alpha), into appstore/screenshots/.
//
//   node appstore/screenshots.mjs
//
// What they show of the app is captured, not mocked: the popover is the real renderer (tray/src, React),
// served by Vite in memory, driven through the same bridge the Electron preload gives it, and captured in
// headless Chrome for Testing at three pixels per point (as reel/capture.mjs does). The menu-bar glyph is
// tray/assets/trayTemplate@2x.png. Drawn here: the wallpaper (the site's sky, sun and sea, src/palette.ts),
// a plain menu bar, the popover's vibrancy, the cursor and the headlines (the site's Bricolage Grotesque).
//
// Needs Node 24, ffmpeg, and node_modules in reel/ (playwright-core), tray/ and site/.
// Nothing is written into tray/: Vite runs without its config file and keeps its cache in a temp folder.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launch } from "../reel/browser.mjs";

const dir = import.meta.dirname;
const root = path.join(dir, "..");
const tray = path.join(root, "tray");
const out = path.join(dir, "screenshots");

/** The shots, in store order. `level` is the popover's level; `cursor` points at a part of it. */
const SHOTS = [
	{ file: "1-brighter-than-max.png", headline: "Brighter than&nbsp;max.", level: 200 },
	{ file: "2-up-to-300-percent.png", headline: "Up to 300% brightness.", level: 300 },
	{ file: "3-one-slider.png", headline: "One slider in your menu&nbsp;bar.", level: 150, cursor: "thumb" },
	{ file: "4-back-to-normal.png", headline: "Back to normal in one&nbsp;click.", level: 100, cursor: "switch" },
];

// The site's sky at a moment of the day (site/src/palette.ts), and where the sun is for a level (site/src/slider.ts).
const STOPS = [
	{ at: 0, skyTop: "#2d2a6e", skyMid: "#8a5fb3", skyLow: "#ff9fb6", sea: "#3b3f7a", sun: "#ff7a59" },
	{ at: 0.5, skyTop: "#6fc3f0", skyMid: "#ffc9b8", skyLow: "#ffb071", sea: "#5ccbb6", sun: "#ffc35a" },
	{ at: 1, skyTop: "#fffdf3", skyMid: "#fffbe6", skyLow: "#ffffff", sea: "#e6fbf3", sun: "#fff6c2" },
];
const DUSK_UNTIL = 0.32;
const levelToPosition = (level) => Math.log(level / 100) / Math.log(3);

function mix(from, to, t) {
	const rgb = (hex) => [0, 2, 4].map((i) => Number.parseInt(hex.slice(1 + i, 3 + i), 16));
	const a = rgb(from);
	const b = rgb(to);
	return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
}

function paletteAt(position) {
	const upper = position <= 0.5 ? 1 : 2;
	const from = STOPS[upper - 1];
	const to = STOPS[upper];
	const t = (position - from.at) / (to.at - from.at);
	return Object.fromEntries(["skyTop", "skyMid", "skyLow", "sea", "sun"].map((k) => [k, mix(from[k], to[k], t)]));
}

const dataUri = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString("base64")}`;

const captures = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-appstore-"));
try {
	const parts = await capturePopover();
	fs.mkdirSync(out, { recursive: true });
	await compose(parts);
} finally {
	fs.rmSync(captures, { recursive: true, force: true });
}

/** The popover at each shot's level, dark as the menu bar over these skies, with the parts a cursor points at. */
async function capturePopover() {
	const fromTray = (p) => import(pathToFileURL(path.join(tray, "node_modules", p)).href);
	const { createServer } = await fromTray("vite/dist/node/index.js");
	const { default: react } = await fromTray("@vitejs/plugin-react/dist/index.js");
	const { default: tailwindcss } = await fromTray("@tailwindcss/vite/dist/index.mjs");
	const server = await createServer({
		root: tray,
		configFile: false,
		cacheDir: path.join(captures, "vite"),
		plugins: [react(), tailwindcss()],
		server: { port: 5298, strictPort: true },
		logLevel: "warn",
	});
	await server.listen();
	const browser = await launch({ viewport: { width: 300, height: 200 }, deviceScaleFactor: 3, colorScheme: "dark" });
	try {
		const { page } = browser;
		// The preload's bridge (see reel/capture.mjs), with a handle to set the level from here.
		await page.addInitScript(() => {
			let state = { level: 100, running: false };
			const listeners = new Set();
			const set = async (level) => {
				const next = Math.min(300, Math.max(100, Math.round(level)));
				state = { level: next, running: next > 100 };
				for (const fn of listeners) fn(state);
			};
			window.__setLevel = set;
			window.sunny = {
				state: async () => state,
				set,
				step: (steps) => set((state.running ? state.level : 100) * 1.1 ** steps),
				toggle: (on) => set(on ? 150 : 100),
				quit: async () => {},
				openAtLogin: async () => false,
				setOpenAtLogin: async (on) => on,
				onState: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
			};
		});
		await page.goto("http://localhost:5298/");
		await page.getByTestId("level").waitFor();
		await page.evaluate(() => document.fonts.ready);

		const parts = {};
		for (const shot of SHOTS) {
			await page.mouse.move(299, 199);
			await page.evaluate((level) => window.__setLevel(level), shot.level);
			await page.waitForTimeout(400);
			const thumb = await page.getByRole("slider").boundingBox();
			const sw = await page.getByRole("switch").first().boundingBox();
			const at = { thumb: { x: thumb.x + thumb.width / 2, y: thumb.y + thumb.height / 2 }, switch: { x: sw.x + sw.width / 2, y: sw.y + sw.height / 2 } };
			// A hovered part looks hovered, as it would under the pointer.
			if (shot.cursor) {
				await page.mouse.move(at[shot.cursor].x, at[shot.cursor].y);
				await page.waitForTimeout(300);
			}
			const file = path.join(captures, `popover-${shot.level}.png`);
			await page.screenshot({ path: file, omitBackground: true });
			const text = await page.getByTestId("level").innerText();
			if (Number.parseInt(text, 10) !== shot.level) throw new Error(`popover shows ${text}, expected ${shot.level}%`);
			parts[shot.file] = { file, at };
		}
		return parts;
	} finally {
		await browser.close();
		await server.close();
	}
}

/** Each shot, drawn at 1440 x 900 points and two pixels per point, then flattened to RGB. */
async function compose(parts) {
	const font = path.join(root, "site", "node_modules", "@fontsource-variable", "bricolage-grotesque", "files", "bricolage-grotesque-latin-standard-normal.woff2");
	const glyph = dataUri(path.join(tray, "assets", "trayTemplate@2x.png"), "image/png");
	const browser = await launch({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
	try {
		const { page } = browser;
		for (const shot of SHOTS) {
			const part = parts[shot.file];
			await page.setContent(html({ shot, popover: dataUri(part.file, "image/png"), at: part.at, glyph, font: dataUri(font, "font/woff2") }));
			await page.evaluate(() => document.fonts.ready);
			await page.waitForTimeout(200);
			const raw = path.join(captures, shot.file);
			await page.screenshot({ path: raw });
			const target = path.join(out, shot.file);
			execFileSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-pix_fmt", "rgb24", target]);
			console.log(`${path.relative(root, target)}: ${shot.level}%`);
		}
	} finally {
		await browser.close();
	}
}

function html({ shot, popover, at, glyph, font }) {
	const position = levelToPosition(shot.level);
	const sky = paletteAt(position);
	const dusk = position < DUSK_UNTIL;
	const ink = "#2a1838";
	const cream = "#fff7f0";
	const text = dusk ? cream : ink;
	// The menu bar and popover are shown at 1.5x, so that the popover's 3x capture lands on device pixels 1:1.
	const Z = 1.5;
	const POP = { x: 1440 / Z - 300 - 96, y: 24 + 5 };
	const trayX = POP.x + 150;
	const cursorAt = shot.cursor ? at[shot.cursor] : null;
	// The sun rises with the level, from the horizon to high in the sky, on the left under the headline.
	const horizon = 900 * 0.7;
	const sunSize = 300;
	const sunY = horizon - sunSize * 0.42 - position * 330;
	return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Bricolage"; src: url(${font}) format("woff2-variations"); font-weight: 200 800; font-stretch: 75% 100%; }
* { box-sizing: border-box; margin: 0; }
html, body { width: 1440px; height: 900px; overflow: hidden; background: ${sky.sea}; }
#sky { position: absolute; inset: 0 0 ${900 - horizon}px 0; background: linear-gradient(to bottom, ${sky.skyTop}, ${sky.skyMid} 55%, ${sky.skyLow}); }
#sea { position: absolute; inset: ${horizon}px 0 0 0; background: linear-gradient(to bottom, color-mix(in srgb, ${sky.sea} 65%, ${sky.skyLow}), ${sky.sea} 70%); overflow: hidden; }
#sun { position: absolute; left: ${360 - sunSize / 2}px; top: ${sunY}px; width: ${sunSize}px; height: ${sunSize}px; border-radius: 50%; background: ${sky.sun};
	box-shadow: 0 0 0 ${sunSize * 0.08}px color-mix(in srgb, ${sky.sun} 35%, transparent), 0 0 ${sunSize * 0.6}px color-mix(in srgb, ${sky.sun} 35%, transparent); }
#reflection { position: absolute; left: ${360 - sunSize / 2}px; top: 0; width: ${sunSize}px; height: 83%; opacity: ${0.35 + 0.5 * (1 - position)};
	background: repeating-linear-gradient(to bottom, ${sky.sun} 0 5px, transparent 5px 13px); mask-image: linear-gradient(to bottom, black 10%, transparent); }
#headline { position: absolute; left: 96px; top: 168px; width: 640px; font-family: "Bricolage", sans-serif; font-weight: 650; font-stretch: 82%;
	font-size: 96px; line-height: 0.95; letter-spacing: -0.03em; color: ${text}; text-shadow: 0.025em 0.025em 0 #ff6f9c; text-wrap: balance; }

#desk { position: absolute; left: 0; top: 0; width: ${1440 / Z}px; height: ${900 / Z}px; zoom: ${Z}; font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
#bar { position: absolute; inset: 0 0 auto 0; height: 24px; background: rgba(20, 10, 30, ${dusk ? 0.32 : 0.22}); backdrop-filter: blur(20px) saturate(1.4);
	color: #fff; font-size: 13px; display: flex; align-items: center; justify-content: flex-end; gap: 4px; padding-right: 12px; }
.item { height: 22px; display: flex; align-items: center; padding: 0 7px; border-radius: 5px; font-variant-numeric: tabular-nums; white-space: pre; }
.item.on { background: rgba(255, 255, 255, 0.22); }
.item img { width: 18px; height: 18px; filter: invert(1); display: block; }
#pop { position: absolute; left: ${POP.x}px; top: ${POP.y}px; width: 300px; height: 200px; }
#pop .material { position: absolute; inset: 0; border-radius: 10px; background: rgba(38, 36, 44, 0.74); backdrop-filter: blur(28px) saturate(1.8);
	box-shadow: 0 18px 50px rgba(20, 6, 30, 0.45), inset 0 0 0 0.5px rgba(255, 255, 255, 0.16), 0 0 0 0.5px rgba(0, 0, 0, 0.6); }
#pop img { position: absolute; inset: 0; width: 300px; height: 200px; }
#cursor { position: absolute; width: 26px; height: 34px; }
</style></head><body>
<div id="sky"><div id="sun"></div></div>
<div id="sea"><div id="reflection"></div></div>
<h1 id="headline">${shot.headline}</h1>
<div id="desk">
	<div id="bar">
		<div class="item on" id="tray" style="position: absolute; left: ${trayX}px; transform: translateX(-50%)"><img src="${glyph}" alt="">${shot.level > 100 ? ` ${shot.level}%` : ""}</div>
		<div class="item"><svg width="17" height="13" viewBox="0 0 17 13" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"><path d="M1.5 4.6a10 10 0 0 1 14 0M4 7.3a6.4 6.4 0 0 1 9 0"/><circle cx="8.5" cy="10.4" r="1.3" fill="#fff" stroke="none"/></svg></div>
		<div class="item"><svg width="26" height="12" viewBox="0 0 26 12"><rect x="0.6" y="0.6" width="22" height="10.8" rx="3" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.1"/><rect x="2.3" y="2.3" width="15.5" height="7.4" rx="1.6" fill="#fff"/><path d="M24 4.2v3.6a1.8 1.8 0 0 0 0-3.6z" fill="rgba(255,255,255,.55)"/></svg></div>
		<div class="item">Thu 26 Nov&nbsp;&nbsp;9:41</div>
	</div>
	<div id="pop"><div class="material"></div><img src="${popover}" alt=""></div>
	${
		cursorAt
			? `<svg id="cursor" viewBox="0 0 26 34" style="left: ${POP.x + cursorAt.x - 2}px; top: ${POP.y + cursorAt.y - 2}px">
		<defs><filter id="cs" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.2" flood-opacity=".45"/></filter></defs>
		<path filter="url(#cs)" d="M2 2 L2 25.5 L7.6 20.3 L11.4 29.2 L15.4 27.5 L11.7 18.8 L19.2 18.8 Z" fill="#000" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/></svg>`
			: ""
	}
</div>
</body></html>`;
}
