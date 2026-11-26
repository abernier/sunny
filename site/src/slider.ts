/** Lowest brightness, in percent (the display's own maximum). */
export const MIN = 100;
/** Highest brightness, in percent. */
export const MAX = 300;
/** One arrow press is one `luminosity +` step. */
export const STEP = 1.1;
/** PageUp and PageDown move this many steps at once. */
export const PAGE_STEPS = 3;

/** Keeps a level within MIN..MAX. */
export function clampLevel(level: number): number {
  return Math.min(MAX, Math.max(MIN, level));
}

/** Position on the sun's travel (0 = horizon, 1 = top) for a level: equal distance per x1.1 step. */
export function levelToPosition(level: number): number {
  return Math.log(clampLevel(level) / MIN) / Math.log(MAX / MIN);
}

/** Level for a position on the sun's travel, the inverse of levelToPosition. */
export function positionToLevel(position: number): number {
  const t = Math.min(1, Math.max(0, position));
  return MIN * (MAX / MIN) ** t;
}

/**
 * Position for a vertical pointer coordinate, given the y of the lowest
 * (horizon) and highest centre of the sun in the same coordinate space.
 */
export function pointerToPosition(y: number, lowest: number, highest: number): number {
  if (lowest === highest) return 0;
  return Math.min(1, Math.max(0, (lowest - y) / (lowest - highest)));
}

/** Level after a key press, or null when the key is not a slider key. */
export function levelForKey(key: string, level: number): number | null {
  switch (key) {
    case "ArrowUp":
    case "ArrowRight":
      return clampLevel(level * STEP);
    case "ArrowDown":
    case "ArrowLeft":
      return clampLevel(level / STEP);
    case "PageUp":
      return clampLevel(level * STEP ** PAGE_STEPS);
    case "PageDown":
      return clampLevel(level / STEP ** PAGE_STEPS);
    case "Home":
      return MIN;
    case "End":
      return MAX;
    default:
      return null;
  }
}
