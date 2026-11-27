// The settings, kept in UserDefaults (Settings binds to them with @AppStorage), and the strings' bundle.
import AppKit
import KeyboardShortcuts
import SunnyCore

public enum Preferences {
  /// Whether the menu bar shows the level beside the icon while the boost is on.
  public static let showPercentage = "showPercentage"
  /// The menu bar icon: a MenuBarIcon's raw value.
  public static let icon = "menuBarIcon"
  /// Whether the boost turns off on battery power below `batteryThreshold`.
  public static let turnOffOnBattery = "turnOffOnBattery"
  /// The charge, in percent, below which the boost turns off on battery power.
  public static let batteryThreshold = "batteryThreshold"

  /// The defaults of the settings above, for `UserDefaults.register(defaults:)`; @AppStorage repeats them.
  public static var defaults: [String: Any] {
    [
      showPercentage: true,
      icon: MenuBarIcon.sunny.rawValue,
      turnOffOnBattery: false,
      batteryThreshold: BatteryPolicy.defaultThreshold,
    ]
  }

  public static func register() {
    UserDefaults.standard.register(defaults: defaults)
  }
}

extension KeyboardShortcuts.Name {
  /// Turns the boost on or off from anywhere. No default: the user records one in Settings. (A Name only holds
  /// immutable values, though it is not marked Sendable.)
  nonisolated(unsafe) public static let toggleBoost = Self("toggleBoost")
}

/// The icons the menu bar can show: the app's own sun, or one of four SF Symbols. All are template images,
/// drawn in the menu bar's color.
public enum MenuBarIcon: String, CaseIterable, Identifiable, Sendable {
  case sunny
  case sunMax = "sun.max"
  case sunMin = "sun.min"
  case sunHorizon = "sun.horizon"
  case lightMax = "light.max"

  public var id: String { rawValue }

  /// The saved icon, the app's own sun when nothing (or something unknown) is saved.
  public static var current: MenuBarIcon {
    UserDefaults.standard.string(forKey: Preferences.icon).flatMap(MenuBarIcon.init(rawValue:)) ?? .sunny
  }

  /// The icon at the menu bar's size.
  @MainActor public var image: NSImage {
    let image: NSImage
    switch self {
    case .sunny:
      image = Self.appIcon
    default:
      image = NSImage(systemSymbolName: rawValue, accessibilityDescription: "Sunny")?
        .withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: 15, weight: .regular))
        ?? Self.appIcon
    }
    image.isTemplate = true
    return image
  }

  /// The sun the app carries (MenuBarIconTemplate.png), or a system one without a bundle (`swift run`).
  @MainActor private static let appIcon: NSImage = {
    let image = Bundle.main.image(forResource: "MenuBarIconTemplate")
      ?? NSImage(systemSymbolName: "sun.max", accessibilityDescription: "Sunny")
      ?? NSImage()
    image.isTemplate = true
    return image
  }()

  /// What VoiceOver says for the icon in Settings.
  public var name: String {
    switch self {
    case .sunny: String(localized: "Sunny", bundle: .module, comment: "The app's own sun icon, in the Icon picker")
    case .sunMax: String(localized: "Sun", bundle: .module, comment: "The sun.max icon, in the Icon picker")
    case .sunMin: String(localized: "Small sun", bundle: .module, comment: "The sun.min icon, in the Icon picker")
    case .sunHorizon: String(localized: "Sunrise", bundle: .module, comment: "The sun.horizon icon, in the Icon picker")
    case .lightMax: String(localized: "Light", bundle: .module, comment: "The light.max icon, in the Icon picker")
    }
  }
}
