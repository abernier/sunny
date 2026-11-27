// What the menu bar and the popover show and do: the level, whether the boost runs, open at login, quit.
import AppKit
import ServiceManagement
import SunnyCore

@MainActor
final class SunnyModel: ObservableObject {
  private static let lastBoostKey = "lastBoost"

  private let engine = BoostEngine()
  private let defaults = UserDefaults.standard

  /// The requested level, 100...300.
  @Published private(set) var level = Level.min
  /// Whether the boost runs.
  @Published private(set) var running = false
  /// Whether the app opens at login; nil where that is not offered (not run from an app bundle).
  @Published private(set) var openAtLogin: Bool?

  /// The level the switch turns back on to, kept across launches.
  private(set) var lastBoost: Int

  init() {
    let saved = defaults.integer(forKey: Self.lastBoostKey)
    lastBoost = Level.isBoost(saved) ? Level.clamp(Double(saved)) : Level.defaultBoost
    openAtLogin = Self.readOpenAtLogin()
  }

  /// Whether the boost is on, as the switch shows it.
  var isOn: Bool { running && Level.isBoost(level) }
  /// The level shown: the requested one while boosted, 100 otherwise.
  var shownLevel: Int { isOn ? level : Level.min }

  /// Sets the level (clamped to 100...300); 100 stops the boost, more starts it if it is not running.
  func set(_ value: Int) {
    let next = Level.clamp(Double(value))
    level = next
    engine.level = next
    if Level.isBoost(next) {
      if lastBoost != next {
        lastBoost = next
        defaults.set(next, forKey: Self.lastBoostKey)
      }
      running = engine.start()
    } else {
      if engine.isRunning { engine.stop() }
      running = false
    }
  }

  /// Moves the level by x1.1 steps: 1 is "+", -1 is "-". From off, it counts from 100.
  func step(_ steps: Int) {
    set(Level.step(shownLevel, by: steps))
  }

  /// Turns the boost on (back to the last boosted level) or off.
  func toggle(_ on: Bool) {
    set(on ? lastBoost : Level.min)
  }

  func setOpenAtLogin(_ on: Bool) {
    do {
      if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
    } catch {
      FileHandle.standardError.write(Data("[sunny] open at login: \(error.localizedDescription)\n".utf8))
    }
    openAtLogin = Self.readOpenAtLogin()
  }

  /// Back to normal brightness, before the app ends however it ends.
  func restore() {
    if engine.isRunning { engine.stop() }
    running = false
  }

  func quit() {
    restore()
    NSApp.terminate(nil)
  }

  private static func readOpenAtLogin() -> Bool? {
    // `swift run` runs a bare executable: registering it would register nothing useful.
    guard Bundle.main.bundlePath.hasSuffix(".app") else { return nil }
    return SMAppService.mainApp.status == .enabled
  }
}
