import { Button } from "@ui-sdk/react/button";
import { Slider, SliderControl, SliderIndicator, SliderThumb, SliderTrack } from "@ui-sdk/react/slider";
import { Switch, SwitchThumb } from "@ui-sdk/react/switch";
import { useEffect, useState } from "react";
import { type BoostState, bridge } from "./bridge.ts";
import { levelToSlider, MAX_LEVEL, MIN_LEVEL, SLIDER_MAX, sliderToLevel } from "./level.ts";

// One slider unit is one x1.1 step; a tenth of one is about 1%. The end is rounded up so that 300% is reachable.
const SLIDER_STEP = 0.1;
const SLIDER_END = Math.ceil(SLIDER_MAX / SLIDER_STEP) * SLIDER_STEP;

const switchClass =
	"relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full bg-black/25 p-[2px] outline-none transition-colors data-checked:bg-amber-500 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-500 focus-visible:ring-2 focus-visible:ring-sky-500 dark:bg-white/20 dark:data-checked:bg-amber-500";
const thumbClass = "block size-[14px] rounded-full bg-white shadow-sm transition-transform data-checked:translate-x-[14px]";

const buttonClass =
	"grid size-8 place-items-center rounded-full bg-black/10 text-lg leading-none text-neutral-800 outline-none transition-colors hover:bg-black/15 active:bg-black/20 focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-40 dark:bg-white/10 dark:text-neutral-100 dark:hover:bg-white/15 dark:active:bg-white/20";

export function App() {
	const [state, setState] = useState<BoostState>({ level: MIN_LEVEL, running: false });
	// While a thumb is dragged the page shows its own value, not the slightly older one the main process echoes.
	const [dragged, setDragged] = useState<number | undefined>(undefined);
	const [atLogin, setAtLogin] = useState<boolean | null>(null);

	useEffect(() => {
		void bridge.state().then(setState);
		void bridge.openAtLogin().then(setAtLogin);
		return bridge.onState(setState);
	}, []);

	const on = state.running && state.level > MIN_LEVEL;
	const level = dragged ?? (on ? state.level : MIN_LEVEL);

	return (
		<main className="flex h-screen flex-col gap-3 px-4 pt-3 pb-2 text-neutral-900 select-none dark:text-neutral-100">
			<header className="flex items-center justify-between">
				<h1 className="text-[13px] font-semibold">Sunny</h1>
				<label className="flex items-center gap-2 text-[13px] text-neutral-600 dark:text-neutral-300">
					Boost
					<Switch
						checked={on}
						onCheckedChange={(checked) => void bridge.toggle(checked)}
						className={switchClass}
					>
						<SwitchThumb className={thumbClass} />
					</Switch>
				</label>
			</header>

			<div className="flex items-center justify-between">
				<Button aria-label="Dimmer (divide by 1.1)" className={buttonClass} disabled={level <= MIN_LEVEL} onClick={() => void bridge.step(-1)}>
					−
				</Button>
				<output data-testid="level" aria-live="polite" className="text-4xl font-semibold tabular-nums tracking-tight">
					{level}
					<span className="text-xl font-normal text-neutral-500 dark:text-neutral-400">%</span>
				</output>
				<Button aria-label="Brighter (multiply by 1.1)" className={buttonClass} disabled={level >= MAX_LEVEL} onClick={() => void bridge.step(1)}>
					+
				</Button>
			</div>

			<Slider
				value={levelToSlider(level)}
				min={0}
				max={SLIDER_END}
				step={SLIDER_STEP}
				largeStep={1}
				format={(position: number) => `${sliderToLevel(position)}%`}
				onValueChange={(position: number) => {
					const next = sliderToLevel(position);
					setDragged(next);
					void bridge.set(next);
				}}
				onValueCommit={() => setDragged(undefined)}
			>
				<SliderControl className="flex h-6 items-center">
					<SliderTrack className="relative h-1 w-full rounded-full bg-black/15 dark:bg-white/15">
						<SliderIndicator className="h-full rounded-full bg-amber-500" />
						<SliderThumb
							aria-label="Brightness"
							className="top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/10 bg-white shadow has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-500"
						/>
					</SliderTrack>
				</SliderControl>
			</Slider>

			<footer className="mt-auto flex items-center justify-between border-t border-black/10 pt-1.5 text-[12px] text-neutral-500 dark:border-white/10 dark:text-neutral-400">
				{atLogin === null ? (
					<span />
				) : (
					<label className="flex items-center gap-2">
						<Switch checked={atLogin} onCheckedChange={(checked) => void bridge.setOpenAtLogin(checked).then(setAtLogin)} className={switchClass}>
							<SwitchThumb className={thumbClass} />
						</Switch>
						Open at login
					</label>
				)}
				<Button className="rounded px-2 py-0.5 outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-white/10" onClick={() => void bridge.quit()}>
					Quit
				</Button>
			</footer>
		</main>
	);
}
