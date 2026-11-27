// The Mac App Store app preview: 1920 x 1080, H.264 High, 30 frames a second, 20 s, with a stereo AAC
// track, into appstore/preview/sunny-preview.mp4.
//
//   node appstore/preview.mjs            the film, then appstore/preview/contact-sheet.png
//   node appstore/preview.mjs --at 2,9   single frames -> appstore/preview/frames/
//
// It is the reel (reel/reel.html and reel.js), left untouched, cut down to what an app preview may show: only
// the app in use. Dropped here: the DMG install (scene 1), the browser window and its web page, the install
// command under the logo. Kept: the desktop, the menu bar, Sunny's item, the real popover and its slider, the
// boost drawn on the screen, and the logo. Film time t is the reel's t + OFFSET.
//
// Needs what the reel needs (reel/README.md): reel/captures/, reel/node_modules, ffmpeg.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { launch } from "../reel/browser.mjs";
import { writeSound } from "../reel/sound.mjs";

const dir = import.meta.dirname;
const reel = path.join(dir, "..", "reel");
const out = path.join(dir, "preview");
const FPS = 30;
/** Where the preview starts in the reel: the hand already on its way to the menu bar, the page left out. */
const OFFSET = 10;

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const run = (cmd, args) => new Promise((done, fail) => spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"] }).on("close", (code) => (code ? fail(new Error(`${cmd} ended with ${code}`)) : done())));

const captures = path.join(reel, "captures");
for (const f of ["popover.json", "AppIcon.svg", "MenuBarIconTemplate@2x.png", "bricolage.woff2"]) {
	if (!fs.existsSync(path.join(captures, f))) throw new Error(`reel/captures/${f} is missing: see reel/README.md`);
}

const browser = await launch({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, args: ["--allow-file-access-from-files", "--force-color-profile=srgb"] });
const { page } = browser;
page.on("pageerror", (e) => { console.error("page error:", e.message); process.exitCode = 1; });
await page.goto(`file://${path.join(reel, "reel.html")}`);

const plate = fs.readFileSync(path.join(captures, "AppIcon.svg"), "utf8").match(/<path id="plate" d="([^"]+)"/)[1];
const pop = JSON.parse(fs.readFileSync(path.join(captures, "popover.json"), "utf8"));
await page.evaluate(async ([plate, pop, offset]) => {
	document.getElementById("plate").setAttribute("d", plate);
	// Only the app: no browser, no web page, no install window, no install command.
	const style = document.createElement("style");
	style.textContent = "#chrome, #dmg, #ghost, #brew { display: none !important; }";
	document.head.appendChild(style);
	await Promise.all(window.setup(pop));
	await document.fonts.load('650 176px "Bricolage"');
	await document.fonts.ready;
	// The reel's timeline, shifted, and a plain menu bar: no app's menus, as on an empty desktop.
	const renderAt = window.renderAt;
	window.renderPreview = (t) => {
		renderAt(t + offset);
		document.getElementById("menus").innerHTML = "";
	};
}, [plate, pop, OFFSET]);
const duration = (await page.evaluate(() => window.DURATION)) - OFFSET;

const picture = async (t) => {
	await page.evaluate((t) => window.renderPreview(t), t);
	return page.screenshot({ type: "png" });
};

fs.mkdirSync(out, { recursive: true });

if (arg("at")) {
	const frames = path.join(out, "frames");
	fs.mkdirSync(frames, { recursive: true });
	for (const s of arg("at").split(",")) fs.writeFileSync(path.join(frames, `${Number(s).toFixed(2).padStart(5, "0")}.png`), await picture(Number(s)));
	console.log(`frames in ${frames}`);
} else {
	const film = path.join(out, "sunny-preview.mp4");
	const silent = path.join(out, "sunny-preview-silent.mp4");
	const ffmpeg = spawn("ffmpeg", [
		"-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
		"-c:v", "libx264", "-profile:v", "high", "-level", "4.0", "-preset", "slow", "-crf", "16", "-maxrate", "12M", "-bufsize", "24M",
		"-pix_fmt", "yuv420p", "-r", String(FPS),
		"-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-movflags", "+faststart", silent,
	], { stdio: ["pipe", "inherit", "inherit"] });
	const n = Math.round(duration * FPS);
	const started = Date.now();
	for (let i = 0; i < n; i++) {
		const png = await picture(i / FPS);
		if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
		if (i % (FPS * 2) === 0) console.log(`${(i / FPS).toFixed(1)} / ${duration.toFixed(1)} s  (${((Date.now() - started) / 1000).toFixed(0)} s)`);
	}
	ffmpeg.stdin.end();
	await new Promise((r) => ffmpeg.on("close", r));

	// The reel's own clicks, those that fall in the preview, shifted with it: 48 kHz stereo, then AAC.
	const sfx = (await page.evaluate(() => window.SFX)).filter((s) => s.t >= OFFSET).map((s) => ({ ...s, t: s.t - OFFSET }));
	const wav = path.join(out, "sfx.wav");
	writeSound(wav, duration, sfx);
	await run("ffmpeg", ["-y", "-loglevel", "error", "-i", silent, "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", "-shortest", "-movflags", "+faststart", film]);
	fs.rmSync(silent);
	fs.rmSync(wav);
	console.log(`${film}  ${duration.toFixed(1)} s, ${n} frames, ${(fs.statSync(film).size / 1e6).toFixed(1)} MB`);

	// Nine stills, three by three, for a look at it at a glance.
	const at = [0.5, 2.5, 3.5, 5, 7, 9, 11.5, 15, 19];
	const inputs = at.flatMap((s) => ["-ss", String(s), "-i", film]);
	const scaled = at.map((_, i) => `[${i}:v]scale=640:360[v${i}]`).join(";");
	const layout = at.map((_, i) => `${(i % 3) * 640}_${Math.floor(i / 3) * 360}`).join("|");
	const sheet = path.join(out, "contact-sheet.png");
	await run("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", `${scaled};${at.map((_, i) => `[v${i}]`).join("")}xstack=inputs=${at.length}:layout=${layout}`, "-frames:v", "1", sheet]);
	console.log(sheet);
}
await browser.close();
