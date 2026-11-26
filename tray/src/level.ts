// The brightness level and its scale, shared by the main process and the page.
// A level is an integer percent of the display's normal maximum: 100 is normal (off), 300 the panel limit.

/** The normal brightness: no boost. */
export const MIN_LEVEL = 100;
/** The highest boost the panel allows. */
export const MAX_LEVEL = 300;
/** One "+" or "-" step multiplies or divides the level by this, because perceived brightness is not linear. */
export const STEP_RATIO = 1.1;
/** The level the switch turns on to when there is no earlier boost to return to. */
export const DEFAULT_BOOST = 150;

/** A level as the state file holds it: an integer within 100..300. Anything that is not a number is normal. */
export function clampLevel(value: number): number {
	if (!Number.isFinite(value)) return MIN_LEVEL;
	return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(value)));
}

/** The level after `steps` x1.1 steps (negative steps divide), like `luminosity +` and `luminosity -`. */
export function stepLevel(level: number, steps: number): number {
	return clampLevel(level * STEP_RATIO ** steps);
}

/** Whether a level is a boost, that is, whether `luminosity-boost` should run for it. */
export function isBoost(level: number): boolean {
	return clampLevel(level) > MIN_LEVEL;
}

/**
 * The slider's scale is counted in x1.1 steps from 100%, so that equal distances on it are equal ratios.
 * Its end is the number of steps from 100% to 300% (about 11.53).
 */
export const SLIDER_MAX = Math.log(MAX_LEVEL / MIN_LEVEL) / Math.log(STEP_RATIO);

/** The level at a slider position (in x1.1 steps from 100%). */
export function sliderToLevel(position: number): number {
	return clampLevel(MIN_LEVEL * STEP_RATIO ** position);
}

/** The slider position (in x1.1 steps from 100%) of a level. */
export function levelToSlider(level: number): number {
	return Math.log(clampLevel(level) / MIN_LEVEL) / Math.log(STEP_RATIO);
}

/** Parses the state file's contents. A missing or unreadable file means normal brightness. */
export function parseLevel(text: string | undefined): number {
	if (text === undefined) return MIN_LEVEL;
	return clampLevel(Number.parseFloat(text.trim()));
}

/**
 * Calls `fn` at most once every `ms` milliseconds with the latest arguments: the first call runs at once,
 * later ones within the interval are folded into one trailing call.
 */
export function throttle<Args extends unknown[]>(fn: (...args: Args) => void, ms: number, now: () => number = Date.now) {
	let last = Number.NEGATIVE_INFINITY;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pending: Args | undefined;
	const run = (args: Args) => {
		last = now();
		fn(...args);
	};
	const throttled = (...args: Args) => {
		const wait = last + ms - now();
		if (wait <= 0 && !timer) return run(args);
		pending = args;
		timer ??= setTimeout(() => {
			timer = undefined;
			const next = pending!;
			pending = undefined;
			run(next);
		}, Math.max(0, wait));
	};
	/** Runs the pending trailing call now, if there is one. */
	throttled.flush = () => {
		if (!timer) return;
		clearTimeout(timer);
		timer = undefined;
		const next = pending!;
		pending = undefined;
		run(next);
	};
	return throttled;
}
