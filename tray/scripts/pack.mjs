// Makes the app that is handed out, for Apple silicon (arm64) only:
//   node scripts/pack.mjs            release/mac-arm64/Sunny.app
//   node scripts/pack.mjs --dmg      also release/Sunny-arm64.dmg and release/Sunny-arm64.zip
//
// The app carries luminosity-boost, compiled from ../boost/luminosity-boost.swift (scripts/boost.mjs), in
// Contents/Resources, so that it works on a Mac where nothing else was installed.
//
// Signing: without anything set, the app is signed for this Mac only ("ad hoc"), and it is not notarised.
// CSC_NAME (a Developer ID Application identity in the keychain) or CSC_LINK and CSC_KEY_PASSWORD sign it
// with a real identity instead. SUNNY_VERSION gives the app its version (a release sets it from the tag).
import { build as packApp } from "electron-builder";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "release");
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: "inherit" });

// Building runs scripts/boost.mjs too: .stage/boost/luminosity-boost is there afterwards.
run(process.execPath, [path.join(root, "scripts", "build.mjs")]);
fs.rmSync(out, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });

const identity = process.env.CSC_NAME ?? (process.env.CSC_LINK ? undefined : "-");
const adhoc = identity === "-";
const version = process.env.SUNNY_VERSION;
await packApp({
	projectDir: root,
	publish: "never",
	config: {
		appId: "com.abernier.sunny",
		productName: "Sunny",
		copyright: "Copyright 2026 Antoine Bernier",
		directories: { output: path.relative(root, out), buildResources: "assets" },
		...(version ? { extraMetadata: { version } } : {}),
		// Everything the app runs is in the two built folders and the tray icon: the page and the main process are bundles.
		files: ["dist/**", "dist-electron/**", "assets/trayTemplate*.png", "package.json"],
		// Contents/Resources/luminosity-boost. The packer signs it with the rest of the app.
		extraResources: [{ from: ".stage/boost/luminosity-boost", to: "luminosity-boost" }],
		asar: true,
		npmRebuild: false,
		mac: {
			category: "public.app-category.utilities",
			target: (process.argv.includes("--dmg") ? ["dmg", "zip"] : ["dir"]).map((target) => ({ target, arch: ["arm64"] })),
			// No version in the name: the site links to .../releases/latest/download/Sunny-arm64.dmg.
			artifactName: "Sunny-${arch}.${ext}",
			darkModeSupport: true,
			identity,
			hardenedRuntime: !adhoc,
			notarize: false,
			minimumSystemVersion: "13.0",
			// A menu-bar app: no dock icon and no menu bar of its own, from the first moment it runs.
			extendInfo: { LSUIElement: true },
		},
		dmg: { title: "Sunny" },
	},
});

const app = path.join(out, "mac-arm64", "Sunny.app");
if (fs.existsSync(app)) {
	// Every part, luminosity-boost included, has to carry a signature the whole agrees with.
	run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
	console.log(`the app is ${path.relative(root, app)}`);
}
for (const file of fs.readdirSync(out).filter((f) => /\.(dmg|zip)$/.test(f))) console.log(`made release/${file}`);
if (adhoc) console.log("signed ad hoc and not notarised: on another Mac, Gatekeeper asks to confirm the first opening (see README)");
