// Draws the reel frame by frame in headless Chrome for Testing and hands the frames to ffmpeg.
//
//   node reel/render.mjs                    the film -> reel/sunny-reel.mp4, and reel/sunny-reel-poster.png
//   node reel/render.mjs --fps 30           30 frames a second instead of 60
//   node reel/render.mjs --at 1,4,7.5       single frames -> reel/frames/<seconds>.png
//   node reel/render.mjs --from 12 --to 20  a part -> reel/sunny-reel-part.mp4
//   node reel/render.mjs --sheet            after the film: reel/frames/contact-sheet.png, nine stills
//   node reel/render.mjs --sheet-only       only the contact sheet, of the film already rendered
//
// It needs reel/captures/ (node reel/capture.mjs, and the two window captures, see README.md) and ffmpeg.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { launch } from "./browser.mjs";
import { writeSound } from "./sound.mjs";

const dir = import.meta.dirname;
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const flag = (name) => process.argv.includes(`--${name}`);
const FPS = Number(arg("fps") ?? 60);
const captures = path.join(dir, "captures");
for (const f of ["dmg-window.png", "dmg-background@2x.png", "chrome-toolbar.png", "page.png", "popover.json", "AppIcon.png", "MenuBarIconTemplate@2x.png"]) {
	if (!fs.existsSync(path.join(captures, f))) throw new Error(`reel/captures/${f} is missing: see reel/README.md`);
}

const run = (cmd, args) => new Promise((done, fail) => spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"] }).on("close", (code) => (code ? fail(new Error(`${cmd} ended with ${code}`)) : done())));

const browser = await launch({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, args: ["--allow-file-access-from-files", "--force-color-profile=srgb"] });
const { page } = browser;
page.on("pageerror", (e) => { console.error("page error:", e.message); process.exitCode = 1; });
await page.goto(`file://${path.join(dir, "reel.html")}`);
// The real plate of the app icon (a superellipse), in place of the circle-ish stand-in the page starts with.
const plate = fs.readFileSync(path.join(captures, "AppIcon.svg"), "utf8").match(/<path id="plate" d="([^"]+)"/)[1];
const pop = JSON.parse(fs.readFileSync(path.join(captures, "popover.json"), "utf8"));
await page.evaluate(async ([plate, pop]) => {
	document.getElementById("plate").setAttribute("d", plate);
	await Promise.all(window.setup(pop));
	await document.fonts.load('650 176px "Bricolage"');
	await document.fonts.ready;
}, [plate, pop]);
const duration = await page.evaluate(() => window.DURATION);

const picture = async (t) => {
	await page.evaluate((t) => window.renderAt(t), t);
	return page.screenshot({ type: "png" });
};

const frames = path.join(dir, "frames");

/** Nine stills of the film, three by three, for a look at it at a glance: reel/frames/contact-sheet.png. */
async function contactSheet(film) {
	fs.mkdirSync(frames, { recursive: true });
	const at = [1, 4, 7, 10, 14, 18, 21, 25, 29];
	const sheet = path.join(frames, "contact-sheet.png");
	const inputs = at.flatMap((s) => ["-ss", String(s), "-i", film]);
	const scaled = at.map((_, i) => `[${i}:v]scale=640:360[v${i}]`).join(";");
	const layout = at.map((_, i) => `${(i % 3) * 640}_${Math.floor(i / 3) * 360}`).join("|");
	await run("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", `${scaled};${at.map((_, i) => `[v${i}]`).join("")}xstack=inputs=${at.length}:layout=${layout}`, "-frames:v", "1", sheet]);
	console.log(sheet);
}

if (flag("sheet-only")) {
	await contactSheet(path.join(dir, "sunny-reel.mp4"));
} else if (arg("at")) {
	fs.mkdirSync(frames, { recursive: true });
	for (const s of arg("at").split(",")) fs.writeFileSync(path.join(frames, `${Number(s).toFixed(2).padStart(5, "0")}.png`), await picture(Number(s)));
	console.log(`frames in ${frames}`);
} else {
	const part = arg("from") || arg("to");
	const from = Number(arg("from") ?? 0), to = Math.min(duration, Number(arg("to") ?? duration));
	const out = path.join(dir, part ? "sunny-reel-part.mp4" : "sunny-reel.mp4");
	const silent = out.replace(/\.mp4$/, "-silent.mp4");
	const ffmpeg = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-movflags", "+faststart", silent], { stdio: ["pipe", "inherit", "inherit"] });
	const n = Math.round((to - from) * FPS);
	const started = Date.now();
	for (let i = 0; i < n; i++) {
		const png = await picture(from + i / FPS);
		if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
		if (i % (FPS * 2) === 0) console.log(`${(from + i / FPS).toFixed(1)} / ${to.toFixed(1)} s  (${((Date.now() - started) / 1000).toFixed(0)} s)`);
	}
	ffmpeg.stdin.end();
	await new Promise((r) => ffmpeg.on("close", r));

	// The sound: the clicks the film's cues ask for, made here, or silence where there are none.
	const sfx = (await page.evaluate(() => window.SFX)).filter((s) => s.t >= from && s.t < to).map((s) => ({ ...s, t: s.t - from }));
	const wav = path.join(dir, "sfx.wav");
	writeSound(wav, to - from, sfx);
	await run("ffmpeg", ["-y", "-loglevel", "error", "-i", silent, "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out]);
	fs.rmSync(silent);
	fs.rmSync(wav);
	console.log(`${out}  ${(to - from).toFixed(1)} s, ${n} frames, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);

	if (!part) {
		const poster = path.join(dir, "sunny-reel-poster.png");
		fs.writeFileSync(poster, await picture(28.4));
		console.log(poster);
	}
	if (flag("sheet")) await contactSheet(out);
}
await browser.close();
