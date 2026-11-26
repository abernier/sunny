import assert from "node:assert/strict";
import { test } from "node:test";
import { mix, paletteAt } from "./palette.ts";

test("mix interpolates each channel", () => {
  assert.equal(mix("#000000", "#ffffff", 0), "rgb(0,0,0)");
  assert.equal(mix("#000000", "#ffffff", 1), "rgb(255,255,255)");
  assert.equal(mix("#000000", "#ff0080", 0.5), "rgb(128,0,64)");
});

test("the palette hits dusk, golden hour and noon at the stops", () => {
  assert.equal(paletteAt(0).skyTop, "rgb(45,42,110)");
  assert.equal(paletteAt(0.5).sun, "rgb(255,195,90)");
  assert.equal(paletteAt(1).skyLow, "rgb(255,255,255)");
  assert.deepEqual(paletteAt(-1), paletteAt(0));
});
