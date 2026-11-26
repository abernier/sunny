// The reel's few sounds, made here: shaped noise, no tone, quiet. A click is a switch snapping; a drop is
// softer and lower; the swell is air rising under the cut to the logo.
import fs from "node:fs";

const SR = 48000;

/** A seeded random source, so that every render sounds the same. */
function random(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let x = Math.imul(s ^ (s >>> 15), 1 | s);
		x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
		return ((x ^ (x >>> 14)) >>> 0) / 4294967296 - 0.5;
	};
}
const rnd = random(7);

/** Noise through a two-pole band-pass around `hz`, decaying with time constant `tau` seconds. */
function burst(seconds, hz, q, tau, gain) {
	const n = Math.round(seconds * SR), y = new Float32Array(n);
	const w = (2 * Math.PI * hz) / SR, alpha = Math.sin(w) / (2 * q);
	const b0 = alpha, a0 = 1 + alpha, a1 = -2 * Math.cos(w), a2 = 1 - alpha;
	let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
	for (let i = 0; i < n; i++) {
		const x = rnd() * 2;
		const v = (b0 * x - b0 * x2 - a1 * y1 - a2 * y2) / a0;
		x2 = x1; x1 = x; y2 = y1; y1 = v;
		const t = i / SR;
		y[i] = v * gain * Math.min(1, t / 0.0003) * Math.exp(-t / tau);
	}
	return y;
}
const mix = (...parts) => {
	const n = Math.max(...parts.map((p) => p.length)), y = new Float32Array(n);
	for (const p of parts) for (let i = 0; i < p.length; i++) y[i] += p[i];
	return y;
};

const SOUNDS = {
	down: () => mix(burst(0.04, 3600, 1.2, 0.0012, 0.5), burst(0.04, 1800, 1.0, 0.0025, 0.3)),
	up: () => mix(burst(0.04, 4200, 1.2, 0.001, 0.3), burst(0.04, 2100, 1.0, 0.002, 0.18)),
	click: () => {
		const a = SOUNDS.down(), b = SOUNDS.up(), y = new Float32Array(Math.round(0.14 * SR));
		y.set(a.subarray(0, Math.min(a.length, y.length)));
		const o = Math.round(0.07 * SR);
		for (let i = 0; i < b.length && o + i < y.length; i++) y[o + i] += b[i];
		return y;
	},
	drop: () => mix(burst(0.12, 700, 0.9, 0.018, 0.35), burst(0.08, 1500, 1.0, 0.006, 0.12)),
	swell: () => {
		const n = Math.round(0.9 * SR), y = burst(0.9, 900, 0.5, 10, 0.12), z = burst(0.9, 2600, 0.6, 10, 0.08);
		for (let i = 0; i < n; i++) {
			const k = i / n;
			y[i] = (y[i] + z[i]) * Math.sin(Math.PI * Math.min(1, k * 1.6)) ** 2 * (k < 0.62 ? 1 : Math.max(0, 1 - (k - 0.62) / 0.38));
		}
		return y;
	},
};

/** Writes `seconds` of 48 kHz stereo 16-bit audio with each cue's sound at its time, the rest silence. */
export function writeSound(file, seconds, cues) {
	const n = Math.round(seconds * SR), y = new Float32Array(n);
	for (const c of cues) {
		const s = SOUNDS[c.k]?.();
		if (!s) continue;
		// The swell leads its cue: it peaks on the cut.
		const at = Math.round((c.t - (c.k === "swell" ? 0.55 : 0)) * SR);
		for (let i = 0; i < s.length; i++) if (at + i >= 0 && at + i < n) y[at + i] += s[i];
	}
	const data = Buffer.alloc(n * 4);
	for (let i = 0; i < n; i++) {
		const v = Math.max(-1, Math.min(1, y[i])) * 32767;
		data.writeInt16LE(v | 0, i * 4);
		data.writeInt16LE(v | 0, i * 4 + 2);
	}
	const head = Buffer.alloc(44);
	head.write("RIFF", 0); head.writeUInt32LE(36 + data.length, 4); head.write("WAVE", 8);
	head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(2, 22);
	head.writeUInt32LE(SR, 24); head.writeUInt32LE(SR * 4, 28); head.writeUInt16LE(4, 32); head.writeUInt16LE(16, 34);
	head.write("data", 36); head.writeUInt32LE(data.length, 40);
	fs.writeFileSync(file, Buffer.concat([head, data]));
}
