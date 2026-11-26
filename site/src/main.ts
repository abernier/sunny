// The sun is the slider: drag it up (or use the arrow keys) and the sky goes
// from dusk to blinding noon, like Sunny does to your screen, from 100% to 300%.
import "./style.css";
import { DUSK_UNTIL, paletteAt } from "./palette.ts";
import { MIN, clampLevel, levelForKey, levelToPosition, pointerToPosition, positionToLevel } from "./slider.ts";

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

let level = MIN;
let touched = false;

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
  const position = levelToPosition(level);
  const palette = paletteAt(position);
  root.style.setProperty("--color-sky-top", palette.skyTop);
  root.style.setProperty("--color-sky-mid", palette.skyMid);
  root.style.setProperty("--color-sky-low", palette.skyLow);
  root.style.setProperty("--color-sea", palette.sea);
  root.style.setProperty("--color-sun", palette.sun);
  sky.toggleAttribute("data-dusk", position < DUSK_UNTIL);

  const track = measureTrack();
  const centre = track.lowest + (track.highest - track.lowest) * position;
  sky.style.setProperty("--sun-x", `${track.x}px`);
  sky.style.setProperty("--sun-y", `${centre - track.size / 2}px`);
  sky.style.setProperty("--reflect", String(0.75 - 0.4 * position));

  const rounded = Math.round(level);
  percent.textContent = `${rounded}%`;
  sun.setAttribute("aria-valuenow", String(rounded));
  sun.setAttribute("aria-valuetext", `${rounded}%`);
}

function setLevel(value: number) {
  level = clampLevel(value);
  if (!touched) {
    touched = true;
    hint.toggleAttribute("data-gone", true);
  }
  render();
}

function levelFromPointer(clientY: number) {
  const track = measureTrack();
  const y = clientY - sky.getBoundingClientRect().top;
  return positionToLevel(pointerToPosition(y, track.lowest, track.highest));
}

let dragging = false;
sky.addEventListener("pointerdown", (event) => {
  const target = event.target as Element;
  if (target.closest("a, button, [data-intro]")) return;
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
  const next = levelForKey(event.key, level);
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
