// Captures what the reel shows of the real UI, into reel/captures/ (not versioned).
//
//   node reel/capture.mjs              the popover and the web page
//   node reel/capture.mjs popover      only the popover
//   node reel/capture.mjs page         only the web page
//
// The popover is the real one: the app's SwiftUI view (native/Sources/SunnyKit/PopoverView.swift), drawn
// offscreen by `swift run boost-check popover` from a preview model (the display's brightness is never
// touched), one picture per tenth of a x1.1 step of the slider, with popover.json saying where its parts are.
//
// The two window captures (the DMG's Finder window and the browser's toolbar) need the screen: they are
// taken once by hand, see README.md, and are not redone here.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { launch } from "./browser.mjs";

const dir = import.meta.dirname;
const out = path.join(dir, "captures");
const only = process.argv[2];
fs.mkdirSync(out, { recursive: true });

if (!only || only === "popover") capturePopover();
if (!only || only === "page") await capturePage();
copyStatic();

/** The popover, in dark mode as on the machine the windows were captured on, at three pixels per point. */
function capturePopover() {
	const native = path.join(dir, "..", "native");
	execFileSync("swift", ["run", "--package-path", native, "boost-check", "popover", out], { stdio: "inherit" });
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
	const resources = path.join(dir, "..", "native", "Resources");
	for (const n of ["AppIcon.png", "AppIcon.svg", "MenuBarIconTemplate@2x.png"]) fs.copyFileSync(path.join(resources, n), path.join(out, n));
	const font = path.join(dir, "..", "site", "node_modules", "@fontsource-variable", "bricolage-grotesque", "files", "bricolage-grotesque-latin-standard-normal.woff2");
	if (fs.existsSync(font)) fs.copyFileSync(font, path.join(out, "bricolage.woff2"));
	else console.warn("site/node_modules missing: run pnpm install in site/ for the wordmark's typeface");
}
