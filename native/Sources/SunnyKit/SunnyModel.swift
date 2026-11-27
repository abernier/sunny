// What the menu bar and the popover show and do: the level, whether the boost runs, open at login, quit.
import AppKit
import ServiceManagement
import SunnyCore

@MainActor
public final class SunnyModel: ObservableObject {
  private static let lastBoostKey = "lastBoost"

  /// The boost; nil for a preview, which only shows a level.
  private let engine: BoostEngine?
  private let defaults = UserDefaults.standard

  /// The requested level, 100...300.
  @Published public private(set) var level = Level.min
  /// Whether the boost runs.
  @Published public private(set) var running = false
  /// The level the menu bar shows beside the icon, nil while off. While the popover is open it never appears or
  /// disappears: the menu bar item would change width, and the system closes the popover of an item that does. It
  /// catches up when the popover closes.
  @Published public private(set) var menuBarLevel: Int?
  /// Whether the popover is open, as PopoverView reports it.
  public var isPopoverOpen = false {
    didSet { updateMenuBarLevel() }
  }
  /// Whether the app opens at login; nil where that is not offered (not run from an app bundle).
  @Published public private(set) var openAtLogin: Bool?

  /// The level the switch turns back on to, kept across launches.
  public private(set) var lastBoost: Int

  public init() {
    engine = BoostEngine()
    let saved = defaults.integer(forKey: Self.lastBoostKey)
    lastBoost = Level.isBoost(saved) ? Level.clamp(Double(saved)) : Level.defaultBoost
    openAtLogin = Self.readOpenAtLogin()
  }

  /// A model that only shows: `set` changes the level and the switch, never the display, and nothing is saved.
  /// For drawing the popover (boost-check's captures) without touching the screen's brightness.
  public init(preview level: Int, openAtLogin: Bool? = false) {
    engine = nil
    lastBoost = Level.defaultBoost
    self.openAtLogin = openAtLogin
    set(level)
  }

  /// Whether the boost is on, as the switch shows it.
  public var isOn: Bool { running && Level.isBoost(level) }
  /// The level shown: the requested one while boosted, 100 otherwise.
  public var shownLevel: Int { isOn ? level : Level.min }

  /// Sets the level (clamped to 100...300); 100 stops the boost, more starts it if it is not running.
  public func set(_ value: Int) {
    let next = Level.clamp(Double(value))
    level = next
    defer { updateMenuBarLevel() }
    guard let engine else {
      running = Level.isBoost(next)
      if running { lastBoost = next }
      return
    }
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
  public func step(_ steps: Int) {
    set(Level.step(shownLevel, by: steps))
  }

  /// Turns the boost on (back to the last boosted level) or off.
  public func toggle(_ on: Bool) {
    set(on ? lastBoost : Level.min)
  }

  public func setOpenAtLogin(_ on: Bool) {
    guard engine != nil else { openAtLogin = on; return }
    do {
      if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
    } catch {
      FileHandle.standardError.write(Data("[sunny] open at login: \(error.localizedDescription)\n".utf8))
    }
    openAtLogin = Self.readOpenAtLogin()
  }

  /// Back to normal brightness, before the app ends however it ends.
  public func restore() {
    if let engine, engine.isRunning { engine.stop() }
    running = false
    updateMenuBarLevel()
  }

  public func quit() {
    restore()
    NSApp.terminate(nil)
  }

  private func updateMenuBarLevel() {
    let next = isOn ? level : nil
    // With the popover open, only a level that replaces another: same width, the digits are monospaced.
    if isPopoverOpen && (next == nil) != (menuBarLevel == nil) { return }
    if menuBarLevel != next { menuBarLevel = next }
  }

  private static func readOpenAtLogin() -> Bool? {
    // `swift run` runs a bare executable: registering it would register nothing useful.
    guard Bundle.main.bundlePath.hasSuffix(".app") else { return nil }
    return SMAppService.mainApp.status == .enabled
  }
}
