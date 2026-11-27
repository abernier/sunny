# Sunny (native)

The menu bar app of [Sunny](../README.md) in SwiftUI: one process, no helper program, no state file. It does
what `../boost/luminosity-boost.swift` does, in-process: a 1x1 EDR window to unlock the display's headroom, and
the gamma table scaled by the level, capped by that headroom.

- A sun in the menu bar, with the level beside it while boosted; its tooltip says the state. No Dock icon.
- Click it: the popover. A Boost switch (back on to the last boosted level, kept across launches), the level,
  "-" and "+" (x1.1 steps), a 100-300% slider (logarithmic: one unit is one x1.1 step), "Open at login" and
  Quit. Keys in the popover: arrows move about 1%, Page Up/Down one x1.1 step, Home/End go to 100% and 300%.
- Right-click it: a menu with Quit.
- The boost never outlives the app: Quit, logout, SIGTERM/SIGINT/SIGHUP restore the gamma, and the system drops
  the table by itself if the app crashes.

## Layout

```
Package.swift
Sources/SunnyCore/    pure logic: level scale, slider mapping, gamma factor and table (tested)
Sources/SunnyKit/     BoostEngine (EDR window + gamma), SunnyModel, the popover and menu bar views
Sources/Sunny/        the app: MenuBarExtra, signals, keys, right-click menu, tooltip
Sources/boost-check/  checks the boost on this Mac's display, and draws the popover offscreen
Tests/SunnyCoreTests/ swift test
Resources/            AppIcon.icns and the menu bar template images (copies of ../tray/assets)
entitlements/         dev.plist (sandbox) and mas.plist (sandbox + app and team identifiers)
scripts/build.sh      assembles Sunny.app; signs it; makes the store installer
scripts/gamma.swift   prints the display's gamma table in short
```

## Build

Xcode command line tools; the store build wants a released Xcode (`/Applications/Xcode.app` is used when
`DEVELOPER_DIR` is not set).

```sh
swift test                      # unit tests
swift run boost-check           # boosts for a few seconds, reads the gamma back, restores it
swift run boost-check render .  # popover-*.png and menubar-on.png, drawn offscreen
scripts/build.sh dev            # build/dev/Sunny.app: arm64, ad hoc, sandboxed
scripts/build.sh mas            # build/mas/Sunny.app and Sunny-<version>.pkg: universal, for the Mac App Store
```

Run the development app with `build/dev/Sunny.app/Contents/MacOS/Sunny` to see its log on the terminal.

`scripts/build.sh mas` signs with the "Apple Distribution" identity and the installer with "3rd Party Mac
Developer Installer" (`SUNNY_MAS_IDENTITY` and `SUNNY_PKG_IDENTITY` to choose), and embeds `SUNNY_MAS_PROFILE`,
by default `.signing/sunny-mas.provisionprofile` of the main checkout. Each upload needs a higher build number:

```sh
SUNNY_VERSION=0.3.0 SUNNY_BUILD=1 scripts/build.sh mas
```

The script also records the SDK the app was built with, in the executable (SwiftPM writes the deployment target
there) and in Info.plist (`DT*` keys), which App Store Connect checks.
