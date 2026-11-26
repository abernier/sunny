// Draws the tray icon, a sun, as black on transparent PNGs that macOS uses as a template image:
// assets/trayTemplate.png (18x18) and assets/trayTemplate@2x.png (36x36). No dependency: the shape is
// sampled with 4x4 supersampling and the PNG is encoded by hand.
//   node scripts/icon.mjs
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve(import.meta.dirname, "..");
const SIZE = 18;
const RAYS = 8;

/** Distance from point p to the segment a-b. */
function segmentDistance(px, py, ax, ay, bx, by) {
	const dx = bx - ax;
	const dy = by - ay;
	const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
	return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Whether a point (in 18-unit icon space) is inked: a disc and eight rounded rays. */
function inked(x, y) {
	const c = SIZE / 2;
	if (Math.hypot(x - c, y - c) <= 3.6) return true;
	for (let i = 0; i < RAYS; i++) {
		const a = (i / RAYS) * Math.PI * 2;
		const [cos, sin] = [Math.cos(a), Math.sin(a)];
		if (segmentDistance(x, y, c + cos * 5.8, c + sin * 5.8, c + cos * 7.6, c + sin * 7.6) <= 0.85) return true;
	}
	return false;
}

function crc32(buf) {
	let c = ~0;
	for (const byte of buf) {
		c ^= byte;
		for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
	}
	return ~c >>> 0;
}

function chunk(type, data) {
	const out = Buffer.alloc(12 + data.length);
	out.writeUInt32BE(data.length, 0);
	out.write(type, 4, "ascii");
	data.copy(out, 8);
	out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
	return out;
}

function png(scale) {
	const px = SIZE * scale;
	const samples = 4;
	const rows = [];
	for (let y = 0; y < px; y++) {
		const row = Buffer.alloc(1 + px * 4);
		for (let x = 0; x < px; x++) {
			let hits = 0;
			for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) if (inked((x + (sx + 0.5) / samples) / scale, (y + (sy + 0.5) / samples) / scale)) hits++;
			row[1 + x * 4 + 3] = Math.round((hits / (samples * samples)) * 255);
		}
		rows.push(row);
	}
	const header = Buffer.alloc(13);
	header.writeUInt32BE(px, 0);
	header.writeUInt32BE(px, 4);
	header.set([8, 6, 0, 0, 0], 8);
	return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}

fs.mkdirSync(path.join(root, "assets"), { recursive: true });
fs.writeFileSync(path.join(root, "assets", "trayTemplate.png"), png(1));
fs.writeFileSync(path.join(root, "assets", "trayTemplate@2x.png"), png(2));
console.log("wrote assets/trayTemplate.png and assets/trayTemplate@2x.png");
