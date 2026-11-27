// The reel's timeline: renderAt(t) puts every layer where it is at second t. Nothing here keeps state
// between frames, so any frame can be drawn on its own, in any order.
/* global document, window */

const DURATION = 30;
const W = 1728, H = 972; // the screen, in points
const K = 1920 / W; // pixels per point at zoom 1

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------------------------------------
// Easing and keyframes

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, k) => a + (b - a) * k;
const inOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const out = (x) => 1 - (1 - x) ** 3;
const inQ = (x) => x * x * x;
const smooth = (x) => x * x * (3 - 2 * x);
const span = (t, a, b) => clamp01((t - a) / (b - a));
/** An overshooting ease, for things that land: the plate. */
const back = (x) => { const c = 1.5; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };

/**
 * A track of keys [t, value...] eased in and out between them; `arc` bends a 2D move off its straight line,
 * as a hand does, by that fraction of its length.
 */
function track(keys, t, ease = inOut) {
	if (t <= keys[0][0]) return keys[0].slice(1);
	for (let i = 1; i < keys.length; i++) {
		const [t1, ...v1] = keys[i];
		const [t0, ...v0] = keys[i - 1];
		if (t <= t1) {
			const k = ease(span(t, t0, t1));
			const v = v0.map((a, j) => (typeof a === "number" ? lerp(a, v1[j], k) : v1[j]));
			const arc = keys[i].arc ?? 0;
			if (arc && v.length >= 2) {
				const dx = v1[0] - v0[0], dy = v1[1] - v0[1];
				const bend = Math.sin(Math.PI * k) * arc;
				v[0] += -dy * bend;
				v[1] += dx * bend;
			}
			return v;
		}
	}
	return keys.at(-1).slice(1);
}
const key = (t, ...v) => [t, ...v];
const arcKey = (arc, t, ...v) => Object.assign([t, ...v], { arc });

// ---------------------------------------------------------------------------------------------------------
// The scenes' geometry, in screen points

const DMG = { x: 594, y: 300 };
const ICON = { x: DMG.x + 130, y: DMG.y + 252 }; // Sunny.app's icon centre in the window
const APPS = { x: DMG.x + 409.5, y: DMG.y + 252 }; // the Applications alias
const CHROME = { x: 144, y: 24 + 32 };

// The popover's captured states (capture.mjs): one picture per tenth of a x1.1 step.
let POP = null;

// ---------------------------------------------------------------------------------------------------------
// Scene 1: the DMG. 0 to 8 s.

const S1 = { from: 0, to: 8 };
const s1Cursor = [
	key(0, 1130, 770),
	key(0.5, 1110, 755),
	arcKey(0.08, 1.95, ICON.x - 3, ICON.y + 6),
	key(2.45, ICON.x - 3, ICON.y + 6),
	arcKey(-0.12, 4.75, APPS.x - 2, APPS.y + 4),
	key(5.25, APPS.x - 2, APPS.y + 4),
	arcKey(0.1, 6.6, APPS.x + 120, APPS.y + 150),
];
const S1_DOWN = 2.15, S1_DRAG = 2.45, S1_UP = 5.1;
const s1Cam = [
	key(0, 1.7, DMG.x + 285, DMG.y + 205),
	key(1.2, 1.73, DMG.x + 280, DMG.y + 210),
	key(2.3, 1.9, ICON.x + 60, ICON.y + 5),
	key(4.9, 1.9, APPS.x - 60, APPS.y + 5),
	key(5.6, 1.88, APPS.x - 80, APPS.y + 10),
	key(7.0, 1.74, DMG.x + 275, DMG.y + 200),
	key(8, 1.72, DMG.x + 275, DMG.y + 200),
];

// ---------------------------------------------------------------------------------------------------------
// Scenes 2 and 3: the browser, the popover, the boost. 8 to 24 s.

const S2 = { from: 8, to: 24 };
const POP_OPEN = 12.75;
const PRESS = 14.0, RELEASE = 18.75;
const TARGET_POS = Math.log(240 / 100) / Math.log(1.1); // 240%, in x1.1 steps
/** The slider position during the drag: a first reach, a breath, then up to 240%. */
function sliderPos(t) {
	if (t < PRESS + 0.15) return 0;
	const a = 3.6;
	if (t < 15.85) return a * inOut(span(t, PRESS + 0.15, 15.85));
	if (t < 16.2) return a;
	return lerp(a, TARGET_POS, inOut(span(t, 16.2, 18.45)));
}

// ---------------------------------------------------------------------------------------------------------
// Scene 4: the logo. 24 to 30 s.

const S4 = { from: 24, to: 30 };

// ---------------------------------------------------------------------------------------------------------
// Sounds, in film time: what render.mjs mixes under the picture.

const SFX = [
	{ t: S1_DOWN, k: "down" }, { t: S1_UP, k: "up" }, { t: S1_UP + 0.06, k: "drop" },
	{ t: 12.6, k: "click" },
	{ t: PRESS, k: "down" }, { t: RELEASE, k: "up" },
	{ t: 24.05, k: "swell" },
];

// ---------------------------------------------------------------------------------------------------------

function trayRect() {
	const r = $("tray").getBoundingClientRect();
	const s = $("screen").getBoundingClientRect();
	const z = s.width / W;
	return { x: (r.left - s.left) / z, y: (r.top - s.top) / z, w: r.width / z, h: r.height / z };
}

/** The tray item's place: measured once, with no title beside the glyph (the popover is placed then). */
let TRAY = null;

function setLevelUI(level, on) {
	$("tray-title").textContent = on ? ` ${level}%` : "";
}

/** The camera: zoom z, centred on point (fx, fy) of the screen, kept within the screen's edges. */
function camera(z, fx, fy) {
	const hw = W / (2 * z), hh = H / (2 * z);
	fx = Math.min(W - hw, Math.max(hw, fx));
	fy = Math.min(H - hh, Math.max(hh, fy));
	$("screen").style.transform = `translate(${960 - fx * K * z}px, ${540 - fy * K * z}px) scale(${K * z})`;
}

function cursor(x, y, pressed = 0, visible = true) {
	const c = $("cursor");
	c.style.display = visible ? "block" : "none";
	c.style.transform = `translate(${x - 2}px, ${y - 2}px) scale(${1 - 0.1 * pressed})`;
}
/** How far a press is, 0..1: in at once, out again in a moment. */
const pressAt = (t, down, up) => (t < down ? 0 : t < up ? Math.min(1, (t - down) / 0.05) : Math.max(0, 1 - (t - up) / 0.1));

/**
 * The exposure a level gives the screen, in linear light. Sunny's level is the gain over the SDR white; the
 * film shows it a little under that (power 0.8), since a picture on another screen cannot go past its white.
 */
const boost = (level) => (level / 100) ** 0.8;

/** The tone curve of a boost: exposure f in linear light, a soft shoulder over the knee. */
function toneTable(f) {
	const n = 96, knee = 0.72, v = [];
	for (let i = 0; i < n; i++) {
		const x = i / (n - 1);
		let l = x ** 2.2 * f;
		if (l > knee) l = knee + (1 - knee) * Math.tanh((l - knee) / (1 - knee));
		v.push((l ** (1 / 2.2)).toFixed(4));
	}
	return v.join(" ");
}
function highTable() {
	const n = 32, v = [];
	for (let i = 0; i < n; i++) v.push((clamp01((i / (n - 1) - 0.78) / 0.22) ** 1.6).toFixed(4));
	return v.join(" ");
}
const HIGH = highTable();
let lastF = -1;
/** The screen's exposure: 1 is the panel as macOS drives it, above 1 a boost (see boost()). */
function exposure(f) {
	const view = $("view");
	if (Math.abs(f - 1) < 0.002) { view.style.filter = "none"; lastF = 1; return; }
	if (f !== lastF) {
		const tone = toneTable(f);
		for (const id of ["fr", "fg", "fb"]) $(id).setAttribute("tableValues", tone);
		for (const id of ["hr", "hg", "hb"]) $(id).setAttribute("tableValues", HIGH);
		$("bloom").setAttribute("k3", (0.32 * clamp01((f - 1) / 1.4)).toFixed(3));
		lastF = f;
	}
	view.style.filter = "url(#expose)";
}

function showScene(n) {
	$("dmg").style.display = n === 1 ? "block" : "none";
	$("ghost").style.display = n === 1 ? "block" : "none";
	$("chrome").style.display = n === 2 ? "block" : "none";
	$("pop").style.display = n === 2 ? "block" : "none";
	$("view").style.display = n === 4 ? "none" : "block";
	$("logo").style.opacity = n === 4 ? 1 : 0;
	$("menus").innerHTML = (n === 1 ? ["File", "Edit", "View", "Go", "Window", "Help"] : ["File", "Edit", "View", "History", "Bookmarks", "Profiles", "Tab", "Window", "Help"]).map((m) => `<span>${m}</span>`).join("");
}

let shownPop = null;
function popFrame(file) {
	if (shownPop === file) return;
	for (const img of $("pop-frames").children) img.style.display = img.dataset.file === file ? "block" : "none";
	shownPop = file;
}

function renderAt(t) {
	$("flash").style.opacity = 0;
	if (t < S1.to) return scene1(t);
	if (t < S2.to) return scene2(t);
	return scene4(t);
}

function scene1(t) {
	showScene(1);
	exposure(1);
	setLevelUI(100, false);
	$("tray").classList.remove("on");
	const dmg = $("dmg");
	dmg.style.left = `${DMG.x}px`;
	dmg.style.top = `${DMG.y}px`;

	// Selection: the icon's tile and its label, from the press on.
	const sel = $("sel"), label = $("sel-label");
	const selected = t >= S1_DOWN;
	sel.style.left = `${130 - 46}px`; sel.style.top = `${252 - 46}px`; sel.style.width = sel.style.height = "92px";
	sel.style.opacity = selected ? 1 : 0;
	label.style.left = "130px"; label.style.top = "298px";
	label.style.opacity = selected ? 1 : 0;

	const [cx, cy] = track(s1Cursor, t);
	// The drag image: the icon and its name, half transparent, held where it was grabbed.
	const ghost = $("ghost");
	const dragging = t >= S1_DRAG && t < S1_UP + 0.3;
	const grabDX = ICON.x - s1Cursor[3][1], grabDY = ICON.y - s1Cursor[3][2];
	if (dragging) {
		const settle = span(t, S1_UP, S1_UP + 0.28);
		const k = out(settle);
		const gx = lerp(cx + grabDX, APPS.x, k), gy = lerp(cy + grabDY, APPS.y, k);
		const s = 1 - 0.55 * k;
		ghost.style.opacity = (0.62 * Math.min(1, (t - S1_DRAG) / 0.12) * (1 - k)).toFixed(3);
		ghost.style.transform = `translate(${gx - 40}px, ${gy - 40}px) scale(${s})`;
	} else ghost.style.opacity = 0;
	// The Applications folder lights up while the drag is over it.
	const over = dragging && Math.hypot(cx - APPS.x, cy - APPS.y) < 55 && t < S1_UP + 0.05;
	const hi = $("apps-hi");
	hi.style.left = `${409.5 - 50}px`; hi.style.top = `${252 - 48}px`; hi.style.width = "100px"; hi.style.height = "96px";
	hi.style.opacity = over ? 1 : 0;

	cursor(cx, cy, Math.max(pressAt(t, S1_DOWN, S1_UP) * (t < S1_DOWN + 0.2 || t > S1_UP ? 1 : 0.6), 0));
	// The camera follows the hand, a little late, as an operator would.
	const [z, fx, fy] = track(s1Cam, t);
	camera(z, fx, fy);
}

function placePopover() {
	if (!TRAY) {
		setLevelUI(100, false);
		TRAY = trayRect();
	}
	const x = Math.min(Math.max(TRAY.x + TRAY.w / 2 - 150, 4), W - 300 - 4);
	const pop = $("pop");
	pop.style.left = `${x}px`;
	pop.style.top = `${24 + 4}px`;
	return { x, y: 28 };
}

function scene2(t) {
	showScene(2);
	const chrome = $("chrome");
	chrome.style.left = `${CHROME.x}px`;
	chrome.style.top = `${CHROME.y}px`;
	const pp = placePopover();
	const glyph = { x: TRAY.x + 7 + 9, y: 12 };
	const thumb0 = { x: pp.x + POP.track.x, y: pp.y + POP.thumb.y };
	const posX = (pos) => pp.x + POP.track.x + (POP.track.width * pos) / POP.end;

	// The level: the real popover picture nearest the slider's position, and its own number.
	const pos = sliderPos(t);
	const i = Math.min(POP.frames.length - 1, Math.round(pos * 10));
	const pressed = t >= PRESS && t < RELEASE;
	const frame = POP.frames[i];
	const level = t < PRESS + 0.15 ? 100 : frame.level;
	const on = level > 100;
	setLevelUI(level, on);
	popFrame(t < PRESS ? (t > 13.75 ? "popover/hover.png" : "popover/off.png") : frame.file);

	// The popover: opens on the click, a quick fade and settle.
	const pop = $("pop");
	const open = span(t, POP_OPEN, POP_OPEN + 0.16);
	pop.style.opacity = open.toFixed(3);
	pop.style.transform = `translateY(${(1 - out(open)) * -4}px) scale(${0.985 + 0.015 * out(open)})`;
	$("tray").classList.toggle("on", t >= 12.6);

	// The hand: across the page, to the menu bar, onto the slider, along it.
	const keys = [
		key(8, 980, 640),
		key(8.6, 965, 630),
		arcKey(0.06, 11.9, glyph.x - 70, glyph.y + 70),
		arcKey(0.05, 12.5, glyph.x + 1, glyph.y + 2),
		key(12.95, glyph.x + 1, glyph.y + 2),
		arcKey(-0.1, 13.75, thumb0.x + 1, thumb0.y + 1),
	];
	let cx, cy;
	if (t < PRESS) [cx, cy] = track(keys, t);
	else if (t < RELEASE + 0.3) { cx = posX(pos) + 1; cy = thumb0.y + 1; }
	else [cx, cy] = track([key(RELEASE + 0.3, posX(pos) + 1, thumb0.y + 1), arcKey(0.1, 20.6, posX(pos) + 150, thumb0.y + 200)], t);
	cursor(cx, cy, Math.max(pressAt(t, 12.55, 12.66), pressAt(t, PRESS, RELEASE) * 0.6));

	// The boost on screen: in step with the level the slider has set.
	exposure(on ? boost(level) : 1);

	// The camera: wide on the page, then a cut close on the menu bar, the popover, and back out wide.
	let z, fx, fy;
	if (t < 12) {
		[z, fx, fy] = track([key(8, 1.0, W / 2, H / 2), key(12, 1.1, W / 2 + 60, H / 2 - 30)], t, smooth);
	} else {
		const popC = { x: pp.x + 150, y: pp.y + 95 };
		[z, fx, fy] = track([
			key(12, 1.75, glyph.x - 40, 150),
			key(12.7, 1.78, glyph.x - 50, 140),
			key(13.8, 1.85, popC.x, popC.y + 20),
			key(PRESS + 0.2, 1.85, popC.x, popC.y + 20),
			key(RELEASE - 0.3, 1.7, popC.x - 40, popC.y + 40),
			key(RELEASE + 0.1, 1.7, popC.x - 40, popC.y + 40),
			key(20.4, 1.0, W / 2, H / 2),
			key(24, 1.04, W / 2 + 40, H / 2),
		], t);
	}
	camera(z, fx, fy);

	// The last beat: the light goes on rising until the screen is white, and the logo comes out of it.
	if (t > 23.55) {
		const k = inQ(span(t, 23.55, 24));
		exposure(lerp(on ? boost(level) : 1, 9, k));
		$("flash").style.opacity = (0.85 * inQ(span(t, 23.75, 24))).toFixed(3);
	}
}

function scene4(t) {
	showScene(4);
	const T = t - S4.from;
	// Out of the white: the flash goes at once, and the scene itself comes down from overexposed.
	$("flash").style.opacity = (1 - out(span(T, 0, 0.1))).toFixed(3);
	const over = lerp(5, 1, out(span(T, 0, 0.7)));
	// The plate lands, the sun rises into it, the three bands slide across, the name follows.
	const plate = span(T, 0.15, 0.85);
	const pg = $("plate-g");
	pg.style.transform = `scale(${0.72 + 0.28 * back(plate)})`;
	pg.style.opacity = clamp01(plate * 2.2).toFixed(3);
	const rise = out(span(T, 0.55, 1.55));
	$("sun-disc").setAttribute("cy", (512 + 420 * (1 - rise)).toFixed(2));
	["b1", "b2", "b3"].forEach((id, j) => {
		const k = out(span(T, 1.2 + j * 0.13, 1.85 + j * 0.13));
		$(id).setAttribute("x", (203 - 640 * (1 - k)).toFixed(2));
		$(id).setAttribute("width", (618 * k + 1).toFixed(2));
	});
	const w = out(span(T, 1.75, 2.5));
	const word = $("word");
	word.style.opacity = w.toFixed(3);
	word.style.transform = `translateX(${(1 - w) * -24}px)`;
	word.style.clipPath = `inset(-20% ${(1 - w) * 100}% -20% 0)`;
	const row = document.querySelector("#logo .row");
	row.style.transform = `translateX(${-10 + (1 - out(span(T, 1.6, 2.6))) * 150}px) scale(${1 + 0.02 * span(T, 2.6, 6)})`;
	const b = span(T, 3.1, 3.7);
	$("brew").style.opacity = (smooth(b) * 1).toFixed(3);
	$("brew").style.transform = `translateY(${(1 - out(b)) * 8}px)`;
	$("logo").style.opacity = 1;
	// The very end: a short fade, so that the loop or the player's last frame is clean.
	const end = span(T, 5.55, 6);
	const light = over * (1 - smooth(end));
	$("logo").style.filter = Math.abs(light - 1) > 0.001 ? `brightness(${light.toFixed(4)})` : "none";
}

/** Called once by render.mjs: the popover's captured states, then the measured tray. */
window.setup = (pop) => {
	POP = pop;
	// The popover's own size, as boost-check drew it.
	$("pop").style.width = `${pop.size[0]}px`;
	$("pop").style.height = `${pop.size[1]}px`;
	const holder = $("pop-frames");
	for (const f of ["popover/off.png", "popover/hover.png", ...pop.frames.map((x) => x.file)]) {
		const img = document.createElement("img");
		img.src = `captures/${f}`;
		img.dataset.file = f;
		holder.appendChild(img);
	}
	return [...document.images].map((im) => im.decode().catch(() => im.src));
};
window.renderAt = renderAt;
window.DURATION = DURATION;
window.SFX = SFX;
