// Offscreen pictures of everything 0.4.0 shows, to review it without opening the app: the popover, each tab of
// Settings and the icon's right-click menu (drawn from the real NSMenu's items: a menu cannot be drawn offscreen).
//
//   swift run boost-check review <dir> [--lang fr]   <dir>/popover-<lang>-off.png, popover-<lang>-on.png,
//                                                    settings-<tab>-<lang>.png, menu-<lang>.png
import AppKit
import SunnyCore
import SunnyKit
import SwiftUI

/// `--lang fr` anywhere on the command line: runs this tool again with `-AppleLanguages (fr)`, which is how a process
/// gets the strings of a language other than the Mac's (the languages are read once, at launch). Returns when there
/// is no `--lang`.
func relaunchForLanguage() {
  var argv = CommandLine.arguments
  guard let i = argv.firstIndex(of: "--lang"), i + 1 < argv.count, let path = Bundle.main.executablePath else { return }
  let code = argv[i + 1]
  argv.removeSubrange(i...(i + 1))
  argv += ["-AppleLanguages", "(\(code))"]
  var cArgs = argv.map { strdup($0) }
  cArgs.append(nil)
  execv(path, cArgs)
  print("cannot run \(path) again: \(String(cString: strerror(errno)))")
  exit(1)
}

/// The language the strings are drawn in: the one asked for with `--lang` (`-AppleLanguages`), English otherwise.
@MainActor var language = "en"

@MainActor
func captureReview(to dir: String) -> Int32 {
  do {
    try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
  } catch {
    print("cannot make \(dir): \(error.localizedDescription)")
    return 1
  }
  let locale = Locale(identifier: language)
  let model = SunnyModel(preview: Level.min, openAtLogin: false)

  func draw<V: View>(_ view: V, _ name: String, dark: Bool, scale: CGFloat = 2) {
    render(view.environment(\.locale, locale), to: "\(dir)/\(name)", dark: dark, scale: scale)
  }

  draw(PopoverView(model: model), "popover-\(language)-off.png", dark: true)
  model.set(150)
  RunLoop.main.run(until: Date().addingTimeInterval(0.6)) // the switch's animation
  draw(PopoverView(model: model), "popover-\(language)-on.png", dark: true)
  draw(PopoverView(model: model), "popover-\(language)-on-light.png", dark: false)

  for tab in SettingsTab.allCases {
    draw(SettingsTabView(tab: tab, model: model), "settings-\(tab.rawValue)-\(language).png", dark: false)
  }

  let menu = AppCommands.menu(
    target: nil,
    settings: #selector(NSResponder.noResponder(for:)),
    about: #selector(NSResponder.noResponder(for:)),
    rate: #selector(NSResponder.noResponder(for:)),
    quit: #selector(NSResponder.noResponder(for:))
  )
  for item in menu.items {
    print(item.isSeparatorItem ? "  ---" : "  \(item.title)\(item.keyEquivalent.isEmpty ? "" : "  [cmd-\(item.keyEquivalent)]")")
  }
  draw(MenuPicture(menu: menu), "menu-\(language).png", dark: true)
  draw(IconsPicture(level: 150), "menubar-icons.png", dark: true)
  return 0
}

/// A menu's items as the system draws them: titles on the left, shortcuts on the right, separators.
struct MenuPicture: View {
  let menu: NSMenu

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      ForEach(Array(menu.items.enumerated()), id: \.offset) { _, item in
        if item.isSeparatorItem {
          Divider().padding(.vertical, 5).padding(.horizontal, 10)
        } else {
          HStack {
            Text(verbatim: item.title)
            Spacer(minLength: 24)
            if !item.keyEquivalent.isEmpty {
              Text(verbatim: "⌘" + item.keyEquivalent.uppercased()).foregroundStyle(.secondary)
            }
          }
          .font(.system(size: 13))
          .padding(.horizontal, 14)
          .frame(height: 22)
        }
      }
    }
    .padding(.vertical, 5)
    .frame(width: 240)
    .background(RoundedRectangle(cornerRadius: 8).fill(Color(white: 0.2)))
    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.white.opacity(0.15)))
    .padding(10)
  }
}

/// The menu bar item with each icon of Settings, at a level, as the menu bar shows them.
struct IconsPicture: View {
  let level: Int

  var body: some View {
    HStack(spacing: 18) {
      ForEach(MenuBarIcon.allCases) { icon in
        HStack(spacing: 4) {
          Image(nsImage: icon.image)
          Text(verbatim: "\(level)%").font(.system(size: NSFont.menuBarFont(ofSize: 0).pointSize).monospacedDigit())
        }
      }
    }
    .foregroundStyle(.white)
    .padding(.horizontal, 12)
    .frame(height: 24)
  }
}
