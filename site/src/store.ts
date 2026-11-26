// The one brightness level of the page, shared by the sun and the menu bar's popover.
// Like the real app, a level is an integer percent: 100 is normal (off), 300 the panel limit.
import { MIN, STEP, clampLevel } from "./slider.ts";

/** The level the switch turns on to when there is no earlier boost to return to, as in the real app. */
export const DEFAULT_BOOST = 150;

/** A brightness store: one level, any number of listeners. */
export type BrightnessStore = ReturnType<typeof createStore>;

/** Creates a store holding one level, clamped to 100..300 and rounded to an integer percent. */
export function createStore(initial: number = MIN) {
  let level = Math.round(clampLevel(initial));
  // The last boost, which the switch returns to when turned back on.
  let last = level > MIN ? level : DEFAULT_BOOST;
  const listeners = new Set<(level: number) => void>();

  /** The current level. */
  const get = () => level;

  /** Sets the level (clamped and rounded); listeners are called only when it changes. */
  const set = (value: number) => {
    const next = Math.round(clampLevel(value));
    if (next === level) return;
    level = next;
    if (level > MIN) last = level;
    for (const listener of listeners) listener(level);
  };

  /** Moves the level by `steps` x1.1 steps (negative steps divide), like `luminosity +` and `luminosity -`. */
  const step = (steps: number) => set(level * STEP ** steps);

  /** Turns the boost off (back to 100%) or on again (to the last boost). */
  const toggle = (on: boolean) => set(on ? last : MIN);

  /** Calls `listener` with each new level; returns the function that stops it. */
  const subscribe = (listener: (level: number) => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  };

  return { get, set, step, toggle, subscribe };
}

/** The page's brightness. */
export const brightness = createStore();
