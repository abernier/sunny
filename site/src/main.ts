// The sun is the slider: drag it up (or use the arrow keys) and the sky goes
// from dusk to blinding noon, like Sunny does to your screen, from 100% to 300%.
import "./style.css";
import { DUSK_UNTIL, paletteAt } from "./palette.ts";
import { setupMenuBar } from "./menubar.ts";
import { levelForKey, levelToPosition, pointerToPosition, positionToLevel } from "./slider.ts";
import { brightness } from "./store.ts";

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

const root = document.documentElement;
const sky = byId("sky");
const sun = byId("sun");
const percent = byId("percent");
const hint = byId("hint");
const trackElement = byId("track");
const sea = byId("sea");
const details = byId("details");

/**
 * The sun travels in the track (the right column, or under the text on one
 * column): centred horizontally, from the horizon up to the track's top.
 * All values are in px, relative to the sky.
 */
function measureTrack() {
  const skyRect = sky.getBoundingClientRect();
  const trackRect = trackElement.getBoundingClientRect();
  const size = sun.offsetWidth;
  const horizon = sea.offsetTop;
  const top = trackRect.top - skyRect.top;
  return {
    x: trackRect.left - skyRect.left + trackRect.width / 2,
    lowest: horizon,
    highest: Math.min(top + size / 2, horizon - size * 0.35),
    size,
  };
}

function render() {
  const level = brightness.get();
  const position = levelToPosition(level);
  const palette = paletteAt(position);
  root.style.setProperty("--color-sky-top", palette.skyTop);
  root.style.setProperty("--color-sky-mid", palette.skyMid);
  root.style.setProperty("--color-sky-low", palette.skyLow);
  root.style.setProperty("--color-sea", palette.sea);
  root.style.setProperty("--color-sun", palette.sun);
  sky.toggleAttribute("data-dusk", position < DUSK_UNTIL);
  details.toggleAttribute("data-dusk", position < DUSK_UNTIL);

  const track = measureTrack();
  const centre = track.lowest + (track.highest - track.lowest) * position;
  sky.style.setProperty("--sun-x", `${track.x}px`);
  sky.style.setProperty("--sun-y", `${centre - track.size / 2}px`);
  sky.style.setProperty("--reflect", String(0.75 - 0.4 * position));

  percent.textContent = `${level}%`;
  sun.setAttribute("aria-valuenow", String(level));
  sun.setAttribute("aria-valuetext", `${level}%`);
}

// The sun and the menu bar's popover both write the one store; every change repaints the sky.
const setLevel = brightness.set;
const stopHint = brightness.subscribe(() => {
  hint.toggleAttribute("data-gone", true);
  stopHint();
});
brightness.subscribe(render);
setupMenuBar(brightness);

function levelFromPointer(clientY: number) {
  const track = measureTrack();
  const y = clientY - sky.getBoundingClientRect().top;
  return positionToLevel(pointerToPosition(y, track.lowest, track.highest));
}

let dragging = false;
sky.addEventListener("pointerdown", (event) => {
  const target = event.target as Element;
  if (target.closest("a, button, [data-intro], [data-menubar]")) return;
  // On touch, only the sun itself is draggable, so the page still scrolls.
  if (event.pointerType !== "mouse" && !target.closest("#sun")) return;
  dragging = true;
  sky.setPointerCapture(event.pointerId);
  setLevel(levelFromPointer(event.clientY));
  event.preventDefault();
});
sky.addEventListener("pointermove", (event) => {
  if (dragging) setLevel(levelFromPointer(event.clientY));
});
const stop = () => {
  dragging = false;
};
sky.addEventListener("pointerup", stop);
sky.addEventListener("pointercancel", stop);

sun.addEventListener("keydown", (event) => {
  const next = levelForKey(event.key, brightness.get());
  if (next === null) return;
  event.preventDefault();
  setLevel(next);
});

// Homebrew command: an icon button that shows a check once copied, announced in #copy-status.
const status = byId("copy-status");
const resets = new WeakMap<HTMLButtonElement, number>();
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
  button.addEventListener("click", async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(button.dataset.copy ?? "");
      ok = true;
    } catch {
      ok = false;
    }
    button.toggleAttribute("data-copied", ok);
    status.textContent = ok ? "Copied" : "Could not copy, select the command instead";
    window.clearTimeout(resets.get(button));
    resets.set(
      button,
      window.setTimeout(() => {
        button.removeAttribute("data-copied");
        status.textContent = "";
      }, 1600),
    );
  });
}

window.addEventListener("resize", render);
void document.fonts.ready.then(render);
render();
