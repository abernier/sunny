// Makes the app that is handed out, for Apple silicon (arm64) only:
//   node scripts/pack.mjs            release/mac-arm64/Sunny.app
//   node scripts/pack.mjs --dmg      also release/Sunny-arm64.dmg and release/Sunny-arm64.zip
//   node scripts/pack.mjs --mas      the Mac App Store build: release/mas-arm64/Sunny.app and release/mas-arm64/Sunny-<version>-arm64.pkg
//   node scripts/pack.mjs --mas-dev  the same app signed for development, to run on this Mac (no installer)
//
// The app carries luminosity-boost, compiled from ../boost/luminosity-boost.swift (scripts/boost.mjs), in
// Contents/Resources, so that it works on a Mac where nothing else was installed.
//
// Signing: without anything set, the app is signed for this Mac only ("ad hoc"), and it is not notarised.
// CSC_NAME (a Developer ID Application identity in the keychain) or CSC_LINK and CSC_KEY_PASSWORD sign it
// with a real identity instead. SUNNY_VERSION gives the app its version (a release sets it from the tag).
//
// The Mac App Store build is sandboxed (assets/entitlements.mas*.plist) and runs its boost as its own child
// (electron/boost.ts). It is signed with the "Apple Distribution" identity and its installer with the
// "3rd Party Mac Developer Installer" one, both found in the keychain (SUNNY_MAS_IDENTITY picks one by name
// when there are several), and embeds the provisioning profile SUNNY_MAS_PROFILE, by default
// ../.signing/sunny-mas.provisionprofile. SUNNY_BUILD is its build number (CFBundleVersion), which has to grow
// with each upload; it defaults to the version. --mas-dev wants an "Apple Development" identity and, to run
// with its application group, SUNNY_MAS_DEV_PROFILE, a development profile.
import { build as packApp } from "electron-builder";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { isStale, renderAppIcon } from "./app-icon.mjs";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "release");
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: "inherit" });

// Building runs scripts/boost.mjs too: .stage/boost/luminosity-boost is there afterwards.
run(process.execPath, [path.join(root, "scripts", "build.mjs")]);
// The app icon is committed; it is rendered again only when assets/icon.svg is newer than it.
if (isStale()) {
	try {
		renderAppIcon();
	} catch (error) {
		if (!fs.existsSync(path.join(root, "assets", "icon.icns"))) throw error;
		console.warn(`kept the committed assets/icon.icns: ${error.message}`);
	}
}
fs.rmSync(out, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });

const masDev = process.argv.includes("--mas-dev");
const mas = masDev || process.argv.includes("--mas");
const identity = process.env.CSC_NAME ?? (process.env.CSC_LINK ? undefined : "-");
const adhoc = !mas && identity === "-";
const version = process.env.SUNNY_VERSION;
const buildNumber = process.env.SUNNY_BUILD;
const masProfile = process.env.SUNNY_MAS_PROFILE ?? path.resolve(root, "..", ".signing", "sunny-mas.provisionprofile");
if (mas && !masDev && !fs.existsSync(masProfile)) throw new Error(`no provisioning profile at ${masProfile} (set SUNNY_MAS_PROFILE)`);
const macTarget = mas ? [masDev ? "mas-dev" : "mas"] : process.argv.includes("--dmg") ? ["dmg", "zip"] : ["dir"];
await packApp({
	projectDir: root,
	publish: "never",
	config: {
		appId: "com.abernier.sunny",
		productName: "Sunny",
		copyright: "Copyright 2026 Antoine Bernier",
		directories: { output: path.relative(root, out), buildResources: "assets" },
		...(version ? { extraMetadata: { version } } : {}),
		...(buildNumber ? { buildVersion: buildNumber } : {}),
		// Everything the app runs is in the two built folders and the tray icon: the page and the main process are bundles.
		files: ["dist/**", "dist-electron/**", "assets/trayTemplate*.png", "package.json"],
		// Contents/Resources/luminosity-boost. The packer signs it with the rest of the app.
		extraResources: [{ from: ".stage/boost/luminosity-boost", to: "luminosity-boost" }],
		asar: true,
		npmRebuild: false,
		mac: {
			category: "public.app-category.utilities",
			target: macTarget.map((target) => ({ target, arch: ["arm64"] })),
			// No version in the name: the site links to .../releases/latest/download/Sunny-arm64.dmg.
			artifactName: "Sunny-${arch}.${ext}",
			// Also the DMG's volume icon, which defaults to it.
			icon: "assets/icon.icns",
			darkModeSupport: true,
			// The Mac App Store build takes its identities from mas below: the Developer ID or ad hoc one would leak into it.
			...(mas ? {} : { identity, hardenedRuntime: !adhoc }),
			notarize: false,
			minimumSystemVersion: "13.0",
			// A menu-bar app: no dock icon and no menu bar of its own, from the first moment it runs.
			extendInfo: { LSUIElement: true },
		},
		dmg: { title: "Sunny" },
		// Merged over mac above. The installer is named for App Store Connect, version included.
		mas: {
			type: "distribution",
			artifactName: "Sunny-${version}-${arch}.${ext}",
			entitlements: "assets/entitlements.mas.plist",
			// Electron's helpers and luminosity-boost: they inherit the app's sandbox.
			entitlementsInherit: "assets/entitlements.mas.inherit.plist",
			provisioningProfile: masProfile,
			hardenedRuntime: false,
			...(process.env.SUNNY_MAS_IDENTITY ? { identity: process.env.SUNNY_MAS_IDENTITY } : {}),
			extendInfo: {
				LSUIElement: true,
				// Only the encryption the system provides (HTTPS is not even used): no export compliance documents.
				ITSAppUsesNonExemptEncryption: false,
			},
		},
		masDev: {
			provisioningProfile: process.env.SUNNY_MAS_DEV_PROFILE,
		},
	},
});

const app = path.join(out, mas ? (masDev ? "mas-dev-arm64" : "mas-arm64") : "mac-arm64", "Sunny.app");
if (fs.existsSync(app)) {
	// Every part, luminosity-boost included, has to carry a signature the whole agrees with.
	run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
	console.log(`the app is ${path.relative(root, app)}`);
}
// The installer of the Mac App Store build lands beside its app, the others in release/.
for (const dir of new Set([out, path.dirname(app)]))
	for (const file of fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(dmg|zip|pkg)$/.test(f)) : []) console.log(`made ${path.relative(root, path.join(dir, file))}`);
if (adhoc) console.log("signed ad hoc and not notarised: on another Mac, Gatekeeper asks to confirm the first opening (see README)");
