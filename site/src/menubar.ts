// A simulated macOS menu bar at the top of the sky, with Sunny's tray item and its popover:
// the same controls as the real app, all on the page's one brightness store.
import { MIN, MAX, STEPS_MAX, levelForKey, levelToSteps, stepsToLevel } from "./slider.ts";
import type { BrightnessStore } from "./store.ts";

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

/** The clock's text, like the menu bar's: short weekday and time, in the visitor's locale. */
export function formatClock(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(date);
}

/** Wires the menu bar to a brightness store. */
export function setupMenuBar(store: BrightnessStore) {
  const item = byId<HTMLButtonElement>("tray-item");
  const title = byId("tray-title");
  const popover = byId("tray-popover");
  const boost = byId<HTMLButtonElement>("tray-switch");
  const dimmer = byId<HTMLButtonElement>("tray-dimmer");
  const brighter = byId<HTMLButtonElement>("tray-brighter");
  const value = byId("tray-level");
  const slider = byId<HTMLInputElement>("tray-slider");
  const quit = byId<HTMLButtonElement>("tray-quit");
  const clock = byId<HTMLTimeElement>("clock");

  // One slider unit is one x1.1 step, as in the real app; the keys move by whole steps (below), a drag by any amount.
  const sliderEnd = STEPS_MAX;
  slider.max = String(sliderEnd);

  function render(level: number) {
    const on = level > MIN;
    title.textContent = on ? `${level}%` : "";
    item.setAttribute("aria-label", on ? `Sunny, ${level}%` : "Sunny");
    boost.setAttribute("aria-checked", String(on));
    dimmer.disabled = level <= MIN;
    brighter.disabled = level >= MAX;
    value.firstChild!.textContent = String(level);
    // While the thumb is dragged it keeps its own position, not the rounded level's.
    if (Math.round(stepsToLevel(slider.valueAsNumber)) !== level) slider.value = String(levelToSteps(level));
    slider.setAttribute("aria-valuetext", `${level}%`);
    // --fill: the slider's filled share, in percent of its width.
    slider.style.setProperty("--fill", `${(slider.valueAsNumber / sliderEnd) * 100}%`);
  }

  function open() {
    popover.hidden = false;
    item.setAttribute("aria-expanded", "true");
    boost.focus();
  }
  function close(returnFocus: boolean) {
    if (popover.hidden) return;
    popover.hidden = true;
    item.setAttribute("aria-expanded", "false");
    // After the click's own focus change, so that it does not take the focus back.
    if (returnFocus) window.setTimeout(() => item.focus());
  }

  item.addEventListener("click", () => (popover.hidden ? open() : close(true)));
  popover.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    close(true);
  });
  item.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close(true);
  });
  // A click outside closes it, except on the sun, so both can be watched moving together.
  document.addEventListener("pointerdown", (event) => {
    const target = event.target as Element;
    if (popover.hidden || popover.contains(target) || item.contains(target) || target.closest("#sun")) return;
    // Focus goes back to the item, unless the click itself lands on something that takes focus.
    close(!target.closest("a, button, input, [tabindex]"));
  });

  boost.addEventListener("click", () => store.toggle(store.get() <= MIN));
  dimmer.addEventListener("click", () => store.step(-1));
  brighter.addEventListener("click", () => store.step(1));
  quit.addEventListener("click", () => close(true));
  slider.addEventListener("input", () => store.set(stepsToLevel(slider.valueAsNumber)));
  // Keys move like the sun's: one x1.1 step per arrow, three per page.
  slider.addEventListener("keydown", (event) => {
    const next = levelForKey(event.key, store.get());
    if (next === null) return;
    event.preventDefault();
    store.set(next);
  });

  store.subscribe(render);
  render(store.get());

  // The clock, on the minute.
  const tick = () => {
    const now = new Date();
    clock.textContent = formatClock(now);
    clock.dateTime = now.toISOString();
    window.setTimeout(tick, 60_000 - (now.getTime() % 60_000));
  };
  tick();
}
