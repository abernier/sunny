# Sunny

Turn the sun up on your MacBook Pro. Sunny pushes the built-in XDR display past its normal (SDR) brightness
cap, up to 3x, using the headroom macOS keeps for HDR content.

## The menu bar app

With [Homebrew](https://brew.sh) (Apple silicon, macOS 13 or later):

```bash
brew install --cask abernier/tap/sunny
```

This taps [abernier/homebrew-tap](https://github.com/abernier/homebrew-tap) and trusts the cask in one go
(Homebrew refuses a cask from an untrusted tap by its short name). The cask also clears the quarantine flag,
so Gatekeeper lets the app open; `brew upgrade` follows new releases, and `brew uninstall --cask sunny` quits
the app and stops the boost.

Or download `Sunny-arm64.dmg` from the [latest release](https://github.com/abernier/sunny/releases/latest),
open it and drag Sunny to Applications.

A sun appears in the menu bar. Click it for the popover: a Boost switch, the level, "-" and "+" (each
divides or multiplies by 1.1), a 100-300% slider, "Open at login" and Quit. Right-click it for Quit. While
boosted, the level shows beside the icon. The app is native (SwiftUI) and does the boost in its own process:
see [native/README.md](native/README.md).

The app is signed ad hoc and not notarised (there is no Apple Developer ID behind it), so when installed from
the DMG the first opening is refused by Gatekeeper. Either right-click Sunny.app in Applications and choose Open, then Open again, or
allow it in System Settings > Privacy & Security ("Open Anyway"). From a terminal,
`xattr -dr com.apple.quarantine /Applications/Sunny.app` does the same.

## The `luminosity` shell command

For the terminal, `install.sh` compiles the boost program into `~/.local/bin/luminosity-boost` (it needs the
Xcode command line tools for `swiftc`) and prints the line to add to `~/.bashrc`, which sources
`shell/luminosity.bash`:

```sh
./install.sh
luminosity            # show the current level
luminosity 150        # 150% (also 150% or 1.5)
luminosity + | -      # x1.1 or /1.1 per sign; ++ is two steps
luminosity +10 | -10  # add or remove percent points
luminosity off        # back to normal
```

The command and the app are independent: the app boosts in its own process and keeps no state file. Use one
at a time; both set the display's gamma table.

## How it works

`boost/luminosity-boost.swift` is a small program (the app does the same in-process, `native/Sources/SunnyKit/BoostEngine.swift`) that, while it runs:

1. shows a tiny window of EDR (HDR) content, which makes macOS raise the panel's backlight and expose headroom
   (values above 1.0);
2. scales the display's gamma table by that headroom, so every pixel uses the extra brightness, not just HDR content.

Quitting it (SIGTERM) restores the original gamma. The level is a percent in `~/.local/state/luminosity-percent`
(100 is normal, 300 the panel limit), re-read every 100 ms, so changing the level is rewriting that file. The
program runs only while the level is above 100: setting 100 stops it (`pkill -x luminosity-boost`). Steps are
multiplicative because perceived brightness is not linear.

## Caveats

- Built-in XDR displays only (MacBook Pro 14" and 16", M1 Pro and later). Other displays have no EDR headroom
  to use.
- A boost draws more power and heats the panel; macOS may lower the headroom (and so the boost) when it is hot
  or on battery.
- The boost works through the gamma table: another app that sets gamma (a color calibrator, a night-shift tool)
  can fight with it.
- Screenshots and screen recordings do not show the boost.
- Quitting Sunny (or logging out) turns the boost off; the system drops the boost if the app crashes. The shell
  command's boost runs until `luminosity off`.

## Repository

```
boost/    luminosity-boost, the Swift program
shell/    luminosity, the bash function
native/   the menu bar app (SwiftUI, boost in-process): see native/README.md
site/     the landing page
reel/     the product film, composited from captures of the real UI: see reel/README.md
appstore/ the Mac App Store screenshots and app preview
tap_migrations.json  sends the old abernier/sunny tap to abernier/tap
install.sh
```

Releases are built by `.github/workflows/release.yml` when a `v*` tag is pushed (`native/scripts/build.sh dist`:
Sunny-arm64.dmg and Sunny-arm64.zip); it also bumps the cask in
[abernier/homebrew-tap](https://github.com/abernier/homebrew-tap) through a write deploy key of that repository
(secret `HOMEBREW_TAP_DEPLOY_KEY`). Never rebuild a published release in place: the cask pins its sha256.

## License

[MIT](LICENSE)
