/** The sky's colours at one moment of the day. */
export type Palette = {
  skyTop: string;
  skyMid: string;
  skyLow: string;
  sea: string;
  sun: string;
};

/** Dusk (100%), golden hour (about 175%) and noon (300%), at their positions on the sun's travel. */
export const STOPS = [
  { at: 0, skyTop: "#2d2a6e", skyMid: "#8a5fb3", skyLow: "#ff9fb6", sea: "#3b3f7a", sun: "#ff7a59" },
  { at: 0.5, skyTop: "#6fc3f0", skyMid: "#ffc9b8", skyLow: "#ffb071", sea: "#5ccbb6", sun: "#ffc35a" },
  { at: 1, skyTop: "#fffdf3", skyMid: "#fffbe6", skyLow: "#ffffff", sea: "#e6fbf3", sun: "#fff6c2" },
] as const;

/** Below this position the sky is dark enough for light text. */
export const DUSK_UNTIL = 0.32;

const KEYS = ["skyTop", "skyMid", "skyLow", "sea", "sun"] as const;

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mixes two hex colours, t = 0 gives `from`, t = 1 gives `to`. */
export function mix(from: string, to: string, t: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const channels = a.map((value, i) => Math.round(value + (b[i]! - value) * t));
  return `rgb(${channels.join(",")})`;
}

/** The sky's colours at a position on the sun's travel (0..1). */
export function paletteAt(position: number): Palette {
  const t = Math.min(1, Math.max(0, position));
  const upper = t <= STOPS[1].at ? 1 : 2;
  const from = STOPS[upper - 1]!;
  const to = STOPS[upper]!;
  const local = (t - from.at) / (to.at - from.at);
  const palette = {} as Palette;
  for (const key of KEYS) palette[key] = mix(from[key], to[key], local);
  return palette;
}
