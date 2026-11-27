import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveBoostBin, resolveStateFile } from "../electron/boost.ts";

const base = { env: {}, resourcesPath: "/App/Contents/Resources", home: "/Users/me", appRoot: "/repo/tray" };

test("SUNNY_BOOST_BIN wins over everything", () => {
	assert.equal(resolveBoostBin({ ...base, env: { SUNNY_BOOST_BIN: "/x/luminosity-boost" }, exists: () => true }), "/x/luminosity-boost");
});

test("the packaged app runs the program in its resources", () => {
	assert.equal(resolveBoostBin({ ...base, exists: () => true }), "/App/Contents/Resources/luminosity-boost");
});

test("development runs ~/.local/bin, then the one built in .stage", () => {
	assert.equal(resolveBoostBin({ ...base, exists: (f) => f.startsWith("/Users/me/") }), "/Users/me/.local/bin/luminosity-boost");
	assert.equal(resolveBoostBin({ ...base, resourcesPath: undefined, exists: () => false }), "/repo/tray/.stage/boost/luminosity-boost");
});

test("the Mac App Store build runs only the program it carries", () => {
	assert.equal(resolveBoostBin({ ...base, mas: true, env: { SUNNY_BOOST_BIN: "/x/luminosity-boost" }, exists: () => true }), "/App/Contents/Resources/luminosity-boost");
});

test("the state file is the shell function's, unless the environment or the Mac App Store sandbox says otherwise", () => {
	assert.equal(resolveStateFile({ env: {}, home: "/Users/me" }), "/Users/me/.local/state/luminosity-percent");
	assert.equal(resolveStateFile({ env: { SUNNY_STATE_FILE: "/x/state" }, home: "/Users/me" }), "/x/state");
	const container = "/Users/me/Library/Containers/com.abernier.sunny/Data";
	assert.equal(resolveStateFile({ env: { SUNNY_STATE_FILE: "/x/state" }, home: container, mas: true }), `${container}/Library/Application Support/Sunny/luminosity-percent`);
});
