import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX, MIN, STEPS_MAX, levelForKey, levelToPosition, levelToSteps, pointerToPosition, positionToLevel, stepsToLevel } from "./slider.ts";

test("positions and levels round-trip on a log scale", () => {
  assert.equal(levelToPosition(MIN), 0);
  assert.equal(levelToPosition(MAX), 1);
  for (const level of [100, 121, 150, 222.5, 300]) {
    assert.ok(Math.abs(positionToLevel(levelToPosition(level)) - level) < 1e-9);
  }
  // Each x1.1 step covers the same distance
  const a = levelToPosition(110) - levelToPosition(100);
  const b = levelToPosition(242) - levelToPosition(220);
  assert.ok(Math.abs(a - b) < 1e-12);
});

test("positions outside the travel are clamped", () => {
  assert.equal(positionToLevel(-1), MIN);
  assert.equal(positionToLevel(2), MAX);
  assert.equal(levelToPosition(50), 0);
});

test("pointer coordinates map to the sun's travel", () => {
  assert.equal(pointerToPosition(500, 500, 100), 0);
  assert.equal(pointerToPosition(100, 500, 100), 1);
  assert.equal(pointerToPosition(300, 500, 100), 0.5);
  assert.equal(pointerToPosition(900, 500, 100), 0);
  assert.equal(pointerToPosition(0, 500, 100), 1);
});

test("keys move by one x1.1 step, three per page, and jump to the ends", () => {
  assert.ok(Math.abs(levelForKey("ArrowUp", 100)! - 110) < 1e-9);
  assert.ok(Math.abs(levelForKey("ArrowRight", 110)! - 121) < 1e-9);
  assert.ok(Math.abs(levelForKey("ArrowDown", 121)! - 110) < 1e-9);
  assert.ok(Math.abs(levelForKey("PageUp", 100)! - 133.1) < 1e-9);
  assert.ok(Math.abs(levelForKey("PageDown", 133.1)! - 100) < 1e-9);
  assert.equal(levelForKey("ArrowDown", 100), MIN);
  assert.equal(levelForKey("ArrowUp", 299), MAX);
  assert.equal(levelForKey("Home", 200), MIN);
  assert.equal(levelForKey("End", 120), MAX);
  assert.equal(levelForKey("a", 120), null);
});

test("the popover slider counts x1.1 steps from 100%", () => {
  assert.equal(levelToSteps(MIN), 0);
  assert.ok(Math.abs(levelToSteps(121) - 2) < 1e-9);
  assert.ok(Math.abs(stepsToLevel(STEPS_MAX) - MAX) < 1e-9);
  assert.equal(stepsToLevel(99), MAX);
  assert.equal(stepsToLevel(-1), MIN);
});
