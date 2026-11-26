// Captures what the reel shows of the real UI, into reel/captures/ (not versioned).
//
//   node reel/capture.mjs              the popover and the web page
//   node reel/capture.mjs popover      only the popover
//   node reel/capture.mjs page         only the web page
//
// The popover is the real renderer (tray/src, React), served by Vite like `pnpm dev:page`, with a bridge
// injected in place of the Electron preload: the same interface, starting off at 100%. A headless browser
// drags the real slider with the mouse, one x1.1 tenth-step at a time, and every position is kept as a PNG.
//
// The two window captures (the DMG's Finder window and the browser's toolbar) need the screen: they are
// taken once by hand, see README.md, and are not redone here.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { launch } from "./browser.mjs";

const dir = import.meta.dirname;
const out = path.join(dir, "captures");
const only = process.argv[2];
fs.mkdirSync(out, { recursive: true });

if (!only || only === "popover") await capturePopover();
if (!only || only === "page") await capturePage();
copyStatic();

/** The popover, in dark mode as on the machine the windows were captured on, at three pixels per point. */
async function capturePopover() {
	const tray = path.join(dir, "..", "tray");
	const port = 5297;
	const vite = spawn(path.join(tray, "node_modules", ".bin", "vite"), ["--port", String(port), "--strictPort"], { cwd: tray, stdio: ["ignore", "pipe", "inherit"] });
	try {
		await new Promise((done, fail) => {
			vite.stdout.on("data", (d) => String(d).includes("Local") && done());
			vite.on("close", (code) => fail(new Error(`vite ended with ${code}`)));
		});
		const browser = await launch({ viewport: { width: 300, height: 200 }, deviceScaleFactor: 3 });
		const { page } = browser;
		// The preload's bridge, as the packaged app gives it: off at first, the last boost 150%, open at login off.
		await page.addInitScript(() => {
			const clamp = (v) => Math.min(300, Math.max(100, Math.round(v)));
			let state = { level: 100, running: false };
			let last = 150;
			const listeners = new Set();
			const set = async (level) => {
				const next = clamp(level);
				if (next > 100) last = next;
				state = { level: next, running: next > 100 };
				for (const fn of listeners) fn(state);
			};
			window.sunny = {
				state: async () => state,
				set,
				step: (steps) => set((state.running ? state.level : 100) * 1.1 ** steps),
				toggle: (on) => set(on ? last : 100),
				quit: async () => {},
				openAtLogin: async () => false,
				setOpenAtLogin: async (on) => on,
				onState: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
			};
		});
		await page.goto(`http://localhost:${port}/`);
		await page.getByTestId("level").waitFor();
		await page.evaluate(() => document.fonts.ready);
		const pdir = path.join(out, "popover");
		fs.rmSync(pdir, { recursive: true, force: true });
		fs.mkdirSync(pdir);
		const shot = (name) => page.screenshot({ path: path.join(pdir, name), omitBackground: true });
		await page.waitForTimeout(400);
		await shot("off.png");

		// The track, and where on it each slider position is (the scale runs 0..SLIDER_END in x1.1 steps).
		const thumb = page.getByRole("slider");
		const track = await page.locator(".h-1.w-full").first().boundingBox();
		const end = Math.ceil((Math.log(3) / Math.log(1.1)) / 0.1) * 0.1;
		const tb = await thumb.boundingBox();
		const xAt = (pos) => track.x + (track.width * pos) / end;
		const y = tb.y + tb.height / 2;
		// Hovered first, then pressed: the frames of the press are the thumb as it is under the pointer.
		await page.mouse.move(xAt(0) + 0.5, y);
		await page.waitForTimeout(250);
		await shot("hover.png");
		await page.mouse.down();
		const frames = [];
		const LAST = 94; // 9.4 steps: 1.1^9.4 = 245%, a little past where the reel stops
		for (let i = 0; i <= LAST; i++) {
			await page.mouse.move(xAt(i / 10) + 0.5, y);
			await page.waitForTimeout(i < 3 ? 260 : 90);
			const level = Number((await page.getByTestId("level").innerText()).replace("%", ""));
			const name = `${String(i).padStart(3, "0")}.png`;
			await shot(name);
			frames.push({ pos: i / 10, level, file: `popover/${name}` });
		}
		await page.mouse.up();
		const knob = await thumb.boundingBox();
		fs.writeFileSync(
			path.join(out, "popover.json"),
			JSON.stringify({ size: [300, 200], track: { x: track.x, y: track.y, width: track.width, height: track.height }, end, thumb: { y, size: knob.width }, frames }, null, "\t"),
		);
		console.log(`popover: ${frames.length} positions, ${frames[0].level}% to ${frames.at(-1).level}%`);
		await browser.close();
	} finally {
		vite.kill();
	}
}

/** The web page, 1440 x 800 at two pixels per point, cookies refused, scrolled to the launch trailer's picture. */
async function capturePage() {
	const browser = await launch({ viewport: { width: 1440, height: 800 }, deviceScaleFactor: 2 });
	const { page } = browser;
	await page.goto("https://www.rockstargames.com/VI", { waitUntil: "domcontentloaded", timeout: 90000 });
	await page.waitForTimeout(6000);
	// The most private choice: refuse every cookie that is not needed.
	const reject = page.getByRole("button", { name: "REJECT ALL" });
	if (await reject.count()) await reject.first().click();
	await page.waitForTimeout(1500);
	await page.evaluate(() => scrollTo(0, 1500));
	await page.waitForTimeout(5000);
	await page.screenshot({ path: path.join(out, "page.png") });
	console.log("page: captured");
	await browser.close();
}

/** The app's own pictures and the site's typeface, next to the captures, so that the film page finds them. */
function copyStatic() {
	const assets = path.join(dir, "..", "tray", "assets");
	for (const n of ["icon.png", "icon.svg", "trayTemplate@2x.png"]) fs.copyFileSync(path.join(assets, n), path.join(out, n));
	const font = path.join(dir, "..", "site", "node_modules", "@fontsource-variable", "bricolage-grotesque", "files", "bricolage-grotesque-latin-standard-normal.woff2");
	if (fs.existsSync(font)) fs.copyFileSync(font, path.join(out, "bricolage.woff2"));
	else console.warn("site/node_modules missing: run pnpm install in site/ for the wordmark's typeface");
}
