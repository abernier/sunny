# Sunny (native)

The menu bar app of [Sunny](../README.md) in SwiftUI: one process, no helper program, no state file. It does
what `../boost/luminosity-boost.swift` does, in-process: a 1x1 EDR window to unlock the display's headroom, and
the gamma table scaled by the level, capped by that headroom.

- A sun in the menu bar (or one of four SF Symbols), with the level beside it while boosted; its tooltip says the
  state. No Dock icon. English and French.
- Click it: the popover. A Boost switch (back on to the last boosted level, kept across launches), the level,
  "-" and "+" (x1.1 steps), a 100-300% slider (logarithmic: one unit is one x1.1 step; drawn as Control Center
  draws its sliders on macOS 26: a track that fills between a small sun and a big one, no knob). Keys in the
  popover: arrows move about 1%, Page Up/Down one x1.1 step, Home/End go to 100% and 300%.
- Scroll over it: the level moves along the slider's scale (about 2% a wheel notch).
- Right-click it: Settings (Cmd-,), About Sunny, Rate on the App Store, Quit Sunny (Cmd-Q).
- Settings: General (show the percentage, the icon, open at login), Shortcut (a global shortcut that turns the
  boost on or off; none by default), Battery (turn the boost off on battery below a charge, back on when plugged in).
- The boost never outlives the app: Quit, logout, SIGTERM/SIGINT/SIGHUP restore the gamma, and the system drops
  the table by itself if the app crashes.

## Layout

```
Package.swift
Sources/SunnyCore/    pure logic: level scale, slider mapping, gamma factor and table, scroll, battery and rating rules (tested)
Sources/SunnyKit/     BoostEngine (EDR window + gamma), SunnyModel, the popover, the status item and its menu, Settings,
                      the battery guard; Resources/Localizable.xcstrings (English, French)
Sources/Sunny/        the app: the Settings scene, the status item, the global shortcut, signals
Sources/boost-check/  checks the boost on this Mac's display, and draws the popover, Settings and the menu offscreen
Tests/SunnyCoreTests/ swift test
Resources/            AppIcon.svg and its renders AppIcon.png and AppIcon.icns; the menu bar template images
entitlements/         dev.plist (sandbox) and mas.plist (sandbox + app and team identifiers)
scripts/build.sh      assembles Sunny.app; signs it; makes the release downloads and the store installer
scripts/gamma.swift   prints the display's gamma table in short
scripts/app-icon.mjs  renders Resources/AppIcon.svg to AppIcon.png and AppIcon.icns (Node, no dependency)
scripts/menubar-icon.mjs  draws Resources/MenuBarIconTemplate.png and @2x (Node, no dependency)
```

## Build

Xcode command line tools; the store build wants a released Xcode (`/Applications/Xcode.app` is used when
`DEVELOPER_DIR` is not set).

```sh
swift test                      # unit tests
swift run boost-check           # boosts for a few seconds, reads the gamma back, restores it
swift run boost-check render .  # popover-*.png and menubar-on.png, drawn offscreen (no boost)
swift run boost-check popover d # the popover's pictures and popover.json for ../reel and ../appstore (no boost)
swift run boost-check review build/review            # popover, Settings tabs and menu PNGs, in English
swift run boost-check --lang fr review build/review  # the same in French
scripts/build.sh dev            # build/dev/Sunny.app: arm64, ad hoc, sandboxed
scripts/build.sh dist           # build/dist/Sunny-arm64.dmg and .zip: arm64, ad hoc, not sandboxed (the releases)
scripts/build.sh mas            # build/mas/Sunny.app and Sunny-<version>.pkg: universal, for the Mac App Store
```

Run the development app with `build/dev/Sunny.app/Contents/MacOS/Sunny` to see its log on the terminal.

`scripts/build.sh dist` is what `.github/workflows/release.yml` runs for a `v*` tag, with `SUNNY_VERSION` from the
tag. The downloads keep their names across versions (the site links to the latest `Sunny-arm64.dmg`), and are
signed ad hoc, not notarised: there is no Developer ID. They are not sandboxed either, because an ad hoc
signature changes with every build, and a sandboxed app whose signature changed has to ask for its container
again after each update.

`scripts/build.sh mas` signs with the "Apple Distribution" identity and the installer with "3rd Party Mac
Developer Installer" (`SUNNY_MAS_IDENTITY` and `SUNNY_PKG_IDENTITY` to choose), and embeds `SUNNY_MAS_PROFILE`,
by default `.signing/sunny-mas.provisionprofile` of the main checkout. Each upload needs a higher build number:

```sh
SUNNY_VERSION=0.4.0 SUNNY_BUILD=1 scripts/build.sh mas
```

The script also records the SDK the app was built with, in the executable (SwiftPM writes the deployment target
there) and in Info.plist (`DT*` keys), which App Store Connect checks.
