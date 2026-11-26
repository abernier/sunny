import assert from "node:assert/strict";
import { test } from "node:test";
import { clampLevel, isBoost, levelToSlider, parseLevel, SLIDER_MAX, sliderToLevel, stepLevel, throttle } from "../src/level.ts";

test("clampLevel rounds to an integer within 100..300", () => {
	assert.equal(clampLevel(150.4), 150);
	assert.equal(clampLevel(150.5), 151);
	assert.equal(clampLevel(42), 100);
	assert.equal(clampLevel(1000), 300);
	assert.equal(clampLevel(Number.NaN), 100);
	assert.equal(clampLevel(Number.POSITIVE_INFINITY), 100);
});

test("parseLevel reads the state file like the shell function writes it", () => {
	assert.equal(parseLevel("150\n"), 150);
	assert.equal(parseLevel(""), 100);
	assert.equal(parseLevel("garbage"), 100);
	assert.equal(parseLevel(undefined), 100);
	assert.equal(parseLevel("999"), 300);
});

test("stepLevel multiplies or divides by 1.1 per step, rounded and clamped", () => {
	assert.equal(stepLevel(100, 1), 110);
	assert.equal(stepLevel(110, 1), 121);
	assert.equal(stepLevel(150, 1), 165);
	assert.equal(stepLevel(165, -1), 150);
	assert.equal(stepLevel(100, 2), 121);
	assert.equal(stepLevel(105, -1), 100);
	assert.equal(stepLevel(290, 1), 300);
	assert.equal(stepLevel(300, 1), 300);
	assert.equal(stepLevel(100, -1), 100);
});

test("isBoost is true above 100 only", () => {
	assert.equal(isBoost(100), false);
	assert.equal(isBoost(101), true);
	assert.equal(isBoost(50), false);
});

test("the slider maps logarithmically: one unit is one x1.1 step", () => {
	assert.equal(sliderToLevel(0), 100);
	assert.equal(sliderToLevel(1), 110);
	assert.equal(sliderToLevel(2), 121);
	assert.equal(sliderToLevel(SLIDER_MAX), 300);
	assert.ok(Math.abs(SLIDER_MAX - Math.log(3) / Math.log(1.1)) < 1e-12);
	assert.equal(levelToSlider(100), 0);
	assert.ok(Math.abs(levelToSlider(300) - SLIDER_MAX) < 1e-12);
	// Equal distances are equal ratios: the middle of the scale is the geometric mean of 100 and 300.
	assert.equal(sliderToLevel(SLIDER_MAX / 2), Math.round(Math.sqrt(100 * 300)));
	for (const level of [100, 123, 150, 200, 250, 300]) assert.equal(sliderToLevel(levelToSlider(level)), level);
});

test("throttle runs the first call at once and folds the rest into one trailing call", async () => {
	const calls: number[] = [];
	const t = throttle((n: number) => calls.push(n), 30);
	t(1);
	t(2);
	t(3);
	assert.deepEqual(calls, [1]);
	await new Promise((r) => setTimeout(r, 60));
	assert.deepEqual(calls, [1, 3]);
	t(4);
	t.flush();
	assert.deepEqual(calls, [1, 3, 4]);
});
