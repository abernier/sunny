// The one browser the reel uses: Chrome for Testing, headless, on a throwaway profile, and never the
// login keychain (mock keychain, basic password store), so no macOS password prompt ever shows.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

/** Chrome for Testing: $SUNNY_REEL_CHROME, else the newest one Playwright or Puppeteer installed. */
export const CHROME = process.env.SUNNY_REEL_CHROME ?? findChrome();

function findChrome() {
	const app = "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
	const roots = [path.join(os.homedir(), "Library/Caches/ms-playwright"), path.join(os.homedir(), ".cache/puppeteer/chrome")];
	const found = [];
	for (const root of roots) {
		if (!fs.existsSync(root)) continue;
		for (const d of fs.readdirSync(root)) {
			const p = path.join(root, d, "chrome-mac-arm64", app);
			if (fs.existsSync(p)) found.push({ p, t: fs.statSync(p).mtimeMs });
		}
	}
	if (!found.length) throw new Error("No Chrome for Testing found: set SUNNY_REEL_CHROME");
	return found.sort((a, b) => b.t - a.t)[0].p;
}

/**
 * A headless page on a fresh profile (under $TMPDIR), with the given viewport, pixel scale and colour scheme.
 * `close` ends the browser and removes the profile.
 */
export async function launch({ viewport, deviceScaleFactor = 1, colorScheme = "dark", args = [] }) {
	const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sunny-reel-"));
	const ctx = await chromium.launchPersistentContext(profile, {
		executablePath: CHROME,
		headless: true,
		viewport,
		deviceScaleFactor,
		colorScheme,
		args: ["--use-mock-keychain", "--password-store=basic", "--no-first-run", "--hide-scrollbars", ...args],
	});
	const page = ctx.pages()[0] ?? (await ctx.newPage());
	return {
		page,
		close: async () => {
			await ctx.close();
			fs.rmSync(profile, { recursive: true, force: true });
		},
	};
}
