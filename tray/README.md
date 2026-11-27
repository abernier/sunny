# Sunny (menu bar app)

The menu bar app of [Sunny](../README.md): it controls `luminosity-boost`, the program that pushes the built-in
XDR display past its normal (SDR) brightness using EDR headroom.

- A sun icon in the menu bar, with the current level beside it while boosted. No dock icon.
- Click it: a small popover with an on/off switch, the level, "-" and "+" (each divides or multiplies by 1.1),
  a 100-300% slider, "Open at login" (packaged app only) and Quit. The slider is logarithmic: equal distances
  are equal ratios, one unit is one x1.1 step.
- Right-click it: a menu with Quit.

## How it drives the boost

The app does what the `luminosity` shell function (`../shell/luminosity.bash`) does:

- the level is an integer percent, clamped to 100..300, written to `~/.local/state/luminosity-percent`;
  a running `luminosity-boost` re-reads that file every 100 ms;
- at 100 the boost is stopped (`pkill -x luminosity-boost`); above 100 it is started, detached, if it does not
  run yet, so it outlives the app. Quitting the app leaves the boost as it is.

Changes made elsewhere (the shell function, an editor) show up in the app: it watches the state file and polls
`pgrep -x luminosity-boost` every second. While the slider is dragged, the file is written at most 10 times a second.

Which `luminosity-boost` it starts, first found:

1. `SUNNY_BOOST_BIN`, if set;
2. the one the packaged app carries, `Sunny.app/Contents/Resources/luminosity-boost`;
3. `~/.local/bin/luminosity-boost`, which `../install.sh` builds;
4. `.stage/boost/luminosity-boost`, which `scripts/boost.mjs` compiles from `../boost/luminosity-boost.swift`.

The program keeps the name `luminosity-boost` everywhere, so the app and the shell function find and stop each
other's. `SUNNY_STATE_FILE` points the app at another state file, for a trial run; the app hands its state file
to the boost it starts (`LUMINOSITY_STATE_FILE`).

The Mac App Store build is sandboxed, and differs there: it runs only the boost it carries, keeps its state
file in its container (`~/Library/Containers/com.abernier.sunny/Data/Library/Application Support/Sunny/luminosity-percent`),
and cannot see a boost it did not start, so it starts its own as a child process, tracks it instead of
`pgrep`/`pkill`, and ends it when it quits (the boost also ends by itself if the app goes away,
`LUMINOSITY_EXIT_WITH_PARENT`). The shell function and the Mac App Store app do not share a level.

## Layout

```
electron/main.ts      main process: tray, popover window, IPC handlers, open at login
electron/boost.ts     the state file, which program to run, and the luminosity-boost process
electron/preload.ts   the typed bridge the page gets (window.sunny)
src/level.ts          the level's pure logic: clamp, x1.1 steps, log slider scale, throttle
src/App.tsx           the popover (React, ui-sdk components, Tailwind)
src/bridge.ts         window.sunny, or an in-memory stand-in in a plain browser
scripts/              build, dev, pack, boost (swiftc), and the tray and app icon generators
assets/               trayTemplate.png and @2x (scripts/icon.mjs); icon.svg, the app icon, and its
                      renders icon.png and icon.icns (scripts/app-icon.mjs)
test/                 unit tests (node --test)
```

The page runs sandboxed with `contextIsolation` on and `nodeIntegration` off; it reaches the main process only
through the bridge's named calls.

## Develop

Node 24 or newer (`.nvmrc`), pnpm, and the Xcode command line tools (`swiftc`).

```sh
pnpm install
pnpm dev          # main process built once, page served by Vite with hot reload, Electron started
pnpm dev:page     # only the page, in a browser, with a stand-in bridge (for work on the look)
pnpm start        # full build, then Electron
pnpm check        # type check
pnpm test         # unit tests
pnpm icon         # redraw the tray icon
pnpm app-icon     # render assets/icon.svg to icon.png and icon.icns (commit all three)
```

The app icon's renders are committed. `pnpm app-icon` renders the SVG with `rsvg-convert` if it is installed,
otherwise with a headless Chrome (`SUNNY_CHROME`, or the newest Chrome for Testing that Playwright or Puppeteer
downloaded), then `sips` and `iconutil` make the `.icns`. `pnpm run pack` renders them again when `icon.svg` is newer.

If Electron says it "failed to install correctly", its binary was not fetched: `node node_modules/electron/install.js`.

## Package

Apple silicon (arm64) only, macOS 13 or later.

```sh
pnpm run pack     # release/mac-arm64/Sunny.app ("pnpm pack" is pnpm's own tarball command)
pnpm dist         # also release/Sunny-arm64.dmg and release/Sunny-arm64.zip
pnpm mas          # the Mac App Store build: release/mas-arm64/Sunny.app and Sunny-<version>-arm64.pkg
```

Both compile `luminosity-boost` (`swiftc -O -target arm64-apple-macos13`) into the app's `Contents/Resources`, so
the DMG works on a Mac where nothing else is installed. `SUNNY_VERSION` sets the app's version (the release
workflow sets it from the tag). The file names carry no version: the site links to
`https://github.com/abernier/sunny/releases/latest/download/Sunny-arm64.dmg`.

**Signing.** The app, the boost program inside it included, is signed ad hoc and **not notarised**: there is no
Apple Developer ID. On another Mac, Gatekeeper refuses the first opening of a downloaded copy; right-click
Sunny.app and choose Open (or System Settings > Privacy & Security > Open Anyway, or
`xattr -dr com.apple.quarantine /Applications/Sunny.app`). With a Developer ID, set `CSC_NAME` (an identity in
the keychain) or `CSC_LINK` and `CSC_KEY_PASSWORD`, and the app is signed with the hardened runtime instead;
notarising would still have to be added.

**Mac App Store.** `pnpm mas` signs a sandboxed app (`assets/entitlements.mas.plist` for the app,
`assets/entitlements.mas.inherit.plist` for Electron's helpers and `luminosity-boost`) with the "Apple
Distribution" identity, embeds the provisioning profile `SUNNY_MAS_PROFILE` (by default
`../.signing/sunny-mas.provisionprofile`, not committed) and signs the installer with the "3rd Party Mac
Developer Installer" identity, both from the keychain. Each upload needs a higher build number:

```sh
SUNNY_VERSION=0.2.0 SUNNY_BUILD=1 pnpm mas
```

A distribution-signed app does not open outside the store; `pnpm mas:dev` signs it with "Apple Development"
instead (it needs a development profile, `SUNNY_MAS_DEV_PROFILE`, to run with its application group).

**Releases.** Pushing a tag `v*` runs `../.github/workflows/release.yml`, which builds on `macos-latest` and
attaches `Sunny-arm64.dmg` and `Sunny-arm64.zip` to the GitHub Release of that tag.
