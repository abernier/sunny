// The sun is the slider: drag it up (or use the arrow keys) and the sky goes
// from dusk to blinding noon, like Sunny does to your screen, from 100% to 300%.
(function () {
  const MIN = 100;
  const MAX = 300;
  const STEP = 1.1; // one arrow press = one "luminosity +" step

  const root = document.documentElement;
  const sky = document.getElementById("sky");
  const sun = document.getElementById("sun");
  const percent = document.getElementById("percent");
  const hint = document.getElementById("hint");
  const intro = document.getElementById("intro");

  // Sky palette at dusk (100%), golden hour (~175%) and noon (300%).
  const STOPS = [
    { at: 0, skyTop: "#2d2a6e", skyMid: "#8a5fb3", skyLow: "#ff9fb6", sea: "#3b3f7a", sun: "#ff7a59" },
    { at: 0.5, skyTop: "#6fc3f0", skyMid: "#ffc9b8", skyLow: "#ffb071", sea: "#5ccbb6", sun: "#ffc35a" },
    { at: 1, skyTop: "#fffdf3", skyMid: "#fffbe6", skyLow: "#ffffff", sea: "#e6fbf3", sun: "#fff6c2" },
  ];

  let level = MIN;
  let touched = false;

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mix(a, b, t) {
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    return "rgb(" + ca.map(function (v, i) { return Math.round(v + (cb[i] - v) * t); }).join(",") + ")";
  }

  function paletteAt(t) {
    const upper = t <= STOPS[1].at ? 1 : 2;
    const from = STOPS[upper - 1];
    const to = STOPS[upper];
    const local = (t - from.at) / (to.at - from.at);
    const out = {};
    ["skyTop", "skyMid", "skyLow", "sea", "sun"].forEach(function (key) {
      out[key] = mix(from[key], to[key], local);
    });
    return out;
  }

  // Perceptual scale: equal distance for each x1.1 step.
  function levelToT(value) {
    return Math.log(value / MIN) / Math.log(MAX / MIN);
  }
  function tToLevel(t) {
    return MIN * Math.pow(MAX / MIN, t);
  }

  // Vertical travel of the sun's centre, in px from the top of the sky.
  function track() {
    const skyRect = sky.getBoundingClientRect();
    const size = sun.offsetWidth;
    const horizon = sea().offsetTop;
    const sunLeft = sun.getBoundingClientRect().left;
    const introRect = intro.getBoundingClientRect();
    const overlaps = sunLeft < introRect.right && sunLeft + size > introRect.left;
    const ceiling = overlaps ? introRect.bottom - skyRect.top + 24 : skyRect.height * 0.12;
    const highest = Math.min(ceiling + size / 2, horizon - size * 0.35);
    return { lowest: horizon, highest: highest, size: size };
  }

  function sea() {
    return sky.querySelector(".sea");
  }

  function render() {
    const t = levelToT(level);
    const p = paletteAt(t);
    root.style.setProperty("--sky-top", p.skyTop);
    root.style.setProperty("--sky-mid", p.skyMid);
    root.style.setProperty("--sky-low", p.skyLow);
    root.style.setProperty("--sea", p.sea);
    root.style.setProperty("--sun", p.sun);
    root.style.setProperty("--sun-glow", p.sun.replace("rgb(", "rgba(").replace(")", ",0.35)"));
    sky.classList.toggle("is-dusk", t < 0.32);

    const k = track();
    const centre = k.lowest + (k.highest - k.lowest) * t;
    sun.style.setProperty("--sun-y", centre - k.size / 2 + "px");
    hint.style.setProperty("--hint-y", centre - k.size / 2 - 64 + "px");

    const rounded = Math.round(level);
    percent.textContent = rounded + "%";
    sun.setAttribute("aria-valuenow", String(rounded));
    sun.setAttribute("aria-valuetext", rounded + "%");
  }

  function setLevel(value) {
    level = Math.min(MAX, Math.max(MIN, value));
    if (!touched) {
      touched = true;
      hint.classList.add("is-gone");
    }
    render();
  }

  function levelFromPointer(clientY) {
    const k = track();
    const y = clientY - sky.getBoundingClientRect().top;
    const t = (k.lowest - y) / (k.lowest - k.highest);
    return tToLevel(Math.min(1, Math.max(0, t)));
  }

  let dragging = false;
  sky.addEventListener("pointerdown", function (event) {
    if (event.target.closest("a, .intro")) return;
    // On touch, only the sun itself is draggable, so the page still scrolls.
    if (event.pointerType !== "mouse" && !event.target.closest("#sun")) return;
    dragging = true;
    sky.setPointerCapture(event.pointerId);
    setLevel(levelFromPointer(event.clientY));
    event.preventDefault();
  });
  sky.addEventListener("pointermove", function (event) {
    if (dragging) setLevel(levelFromPointer(event.clientY));
  });
  function stop() { dragging = false; }
  sky.addEventListener("pointerup", stop);
  sky.addEventListener("pointercancel", stop);

  sun.addEventListener("keydown", function (event) {
    const keys = {
      ArrowUp: level * STEP,
      ArrowRight: level * STEP,
      ArrowDown: level / STEP,
      ArrowLeft: level / STEP,
      PageUp: level * Math.pow(STEP, 3),
      PageDown: level / Math.pow(STEP, 3),
      Home: MIN,
      End: MAX,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    setLevel(keys[event.key]);
  });

  window.addEventListener("resize", render);
  if (document.fonts) document.fonts.ready.then(render);
  render();
})();
