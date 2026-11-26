# The reel

Thirty seconds about Sunny, 1920x1080 at 60 frames a second: the app installed from its DMG, a web
page in a browser, Sunny opened from the menu bar and its slider pushed to 240% while the screen gets
brighter, then the logo.

The film is composited in code, but what it shows of the app and of the windows is captured, not mocked:

| In the film | Where it comes from |
| --- | --- |
| The popover | the real renderer (`../tray/src`, React), served by Vite and dragged with the mouse in headless Chrome for Testing, one picture per tenth of a x1.1 step (100% to 245%), at 3 pixels per point |
| The menu bar item | the real glyph, `../tray/assets/trayTemplate@2x.png`, and the percent title the app sets |
| The DMG window | a capture of the Finder window of the released `Sunny-arm64.dmg` (v0.1.1); its own background image is laid over the hidden files the capturing Finder showed |
| The drag image, the logo | `../tray/assets/icon.png` and `icon.svg` |
| The browser | a capture of a Chrome for Testing window's toolbar, over a headless capture of the page (1440x800 at 2x, cookies refused) |
| Drawn here | the wallpaper (an original gradient), a plain menu bar without logo or names, the popover's vibrancy, the cursor, the camera, and the brightness |

A screen recording never shows a boost: the change happens after capture. So the film draws it: an SVG
filter over the whole screen raises the exposure in linear light with the level, rolls the highlights off
and adds a bloom of what is near white (`reel.js`, `exposure`).

| File | What it is |
| --- | --- |
| `capture.mjs` | captures the popover and the page into `captures/` |
| `reel.html`, `reel.js` | the page the film is drawn on, and its timeline: `renderAt(t)` |
| `render.mjs` | draws the film frame by frame in headless Chrome for Testing and pipes it to ffmpeg |
| `sound.mjs` | the few clicks under the film, synthesised (no music) |
| `browser.mjs` | the one browser everything uses: Chrome for Testing, headless, throwaway profile, mock keychain |

## Rendering

Node 24, pnpm, ffmpeg, and Chrome for Testing (found in Playwright's or Puppeteer's cache, or
`SUNNY_REEL_CHROME`). `../tray` and `../site` need their `node_modules` (`pnpm install` in each).

```sh
pnpm --dir reel install
node reel/capture.mjs            # popover and page -> reel/captures/
node reel/render.mjs --sheet     # -> reel/sunny-reel.mp4, reel/sunny-reel-poster.png, reel/frames/contact-sheet.png
```

Single frames, a part, or a lighter render:

```sh
node reel/render.mjs --at 3.5,16,27      # -> reel/frames/
node reel/render.mjs --from 12 --to 20   # -> reel/sunny-reel-part.mp4
node reel/render.mjs --fps 30
node reel/render.mjs --sheet-only        # the contact sheet of the film already rendered
```

## The two window captures

They need the screen, so they are taken once and kept in `captures/`, with nothing brought to the front:

- `dmg-window.png`, `dmg-background@2x.png`: mount the DMG without opening it
  (`hdiutil attach -nobrowse -readonly Sunny-arm64.dmg`), open its window behind the others
  (`open -g /Volumes/Sunny`), capture that window at 2x (the cua-driver `get_window_state` screenshot of
  the window, or `screencapture -o -l <window id>` from a process allowed to record the screen), and
  extract the 2x background (`tiffutil -extract 1 /Volumes/Sunny/.background.tiff`). Then `hdiutil detach`.
- `chrome-toolbar.png`: start Chrome for Testing hidden
  (`open -g -j -n -a "Google Chrome for Testing.app" --args --use-mock-keychain --password-store=basic
  --user-data-dir=<tmp> --window-size=1440,980 https://www.rockstargames.com/VI`), capture its window the
  same way, and keep the top 174 pixel rows (tab strip and toolbar).

Everything the captures and the render write (`captures/`, `frames/`, `*.mp4`, the poster) stays out of
the repository.
