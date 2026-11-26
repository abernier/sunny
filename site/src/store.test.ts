import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX, MIN } from "./slider.ts";
import { DEFAULT_BOOST, createStore } from "./store.ts";

test("set clamps to 100..300 and rounds to an integer percent", () => {
  const store = createStore();
  assert.equal(store.get(), MIN);
  store.set(182.6);
  assert.equal(store.get(), 183);
  store.set(1000);
  assert.equal(store.get(), MAX);
  store.set(-5);
  assert.equal(store.get(), MIN);
  assert.equal(createStore(400).get(), MAX);
});

test("subscribers hear each change once, and no longer after unsubscribing", () => {
  const store = createStore();
  const heard: number[] = [];
  const stop = store.subscribe((level) => heard.push(level));
  store.set(200);
  store.set(200);
  store.set(120);
  stop();
  store.set(250);
  assert.deepEqual(heard, [200, 120]);
});

test("steps are x1.1 and clamp at both ends", () => {
  const store = createStore();
  store.step(1);
  assert.equal(store.get(), 110);
  store.step(1);
  assert.equal(store.get(), 121);
  store.step(-1);
  assert.equal(store.get(), 110);
  store.step(-5);
  assert.equal(store.get(), MIN);
  store.set(290);
  store.step(1);
  assert.equal(store.get(), MAX);
  store.step(3);
  assert.equal(store.get(), MAX);
});

test("the switch turns off to 100% and back on to the last boost", () => {
  const store = createStore();
  store.toggle(true);
  assert.equal(store.get(), DEFAULT_BOOST);
  store.set(220);
  store.toggle(false);
  assert.equal(store.get(), MIN);
  store.toggle(true);
  assert.equal(store.get(), 220);
});
