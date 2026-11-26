# Sunny

Turn the sun up on your MacBook Pro. Sunny pushes the built-in XDR display past its normal (SDR) brightness
cap, up to 3x, using the headroom macOS keeps for HDR content.

## The menu bar app

With [Homebrew](https://brew.sh), from this repository as a tap (Apple silicon, macOS 13 or later):

```bash
brew tap abernier/sunny https://github.com/abernier/sunny
```

```bash
brew install --cask abernier/sunny/sunny
```

Use the full name `abernier/sunny/sunny`: Homebrew refuses to load a cask from an untrusted tap by its short
name. The cask also clears the quarantine flag, so Gatekeeper lets the app open; `brew upgrade` follows new
releases, and `brew uninstall --cask sunny` quits the app and stops the boost.

Or download `Sunny-arm64.dmg` from the [latest release](https://github.com/abernier/sunny/releases/latest),
open it and drag Sunny to Applications.

A sun appears in the menu bar. Click it for the popover: an on/off switch, the level, "-" and "+" (each
divides or multiplies by 1.1), a 100-300% slider, "Open at login" and Quit. Right-click it for Quit. While
boosted, the level shows beside the icon.

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

The command and the app share their state: a change made in one shows up in the other.

## How it works

`boost/luminosity-boost.swift` is a small program that, while it runs:

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
- Quitting Sunny leaves the boost as it is, like the shell command does; turn it off first if you want normal
  brightness back.

## Repository

```
boost/    luminosity-boost, the Swift program
shell/    luminosity, the bash function
tray/     the menu bar app (Electron, React): see tray/README.md
site/     the landing page
Casks/    sunny.rb, the Homebrew cask (this repository is its tap)
install.sh
```

Releases are built by `.github/workflows/release.yml` when a `v*` tag is pushed; it also bumps
`Casks/sunny.rb` on main. Never rebuild a published release in place: the cask pins its sha256.

## License

[MIT](LICENSE)
