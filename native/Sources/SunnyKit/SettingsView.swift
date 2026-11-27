// The Settings window (the app's SwiftUI Settings scene): General, Shortcut and Battery.
import KeyboardShortcuts
import SunnyCore
import SwiftUI

public struct SettingsView: View {
  @ObservedObject var model: SunnyModel

  public init(model: SunnyModel) { self.model = model }

  public var body: some View {
    TabView {
      ForEach(SettingsTab.allCases) { tab in
        SettingsTabView(tab: tab, model: model)
          .tabItem { tab.label }
          .tag(tab)
      }
    }
    .frame(width: SettingsTab.width)
  }
}

/// The tabs of Settings, in order.
public enum SettingsTab: String, CaseIterable, Identifiable, Sendable {
  case general
  case shortcut
  case battery

  public static let width: CGFloat = 460

  public var id: String { rawValue }

  var label: some View {
    switch self {
    case .general: Label { Text("General", bundle: .module, comment: "Settings tab") } icon: { Image(systemName: "gearshape") }
    case .shortcut: Label { Text("Shortcut", bundle: .module, comment: "Settings tab") } icon: { Image(systemName: "keyboard") }
    case .battery: Label { Text("Battery", bundle: .module, comment: "Settings tab") } icon: { Image(systemName: "battery.75") }
    }
  }
}

/// One tab's content, on its own (boost-check draws each).
public struct SettingsTabView: View {
  let tab: SettingsTab
  @ObservedObject var model: SunnyModel

  public init(tab: SettingsTab, model: SunnyModel) {
    self.tab = tab
    self.model = model
  }

  public var body: some View {
    Group {
      switch tab {
      case .general: GeneralSettings(model: model)
      case .shortcut: ShortcutSettings()
      case .battery: BatterySettings()
      }
    }
    .formStyle(.grouped)
    .scrollDisabled(true)
    .frame(width: SettingsTab.width)
    .fixedSize(horizontal: false, vertical: true)
  }
}

private struct GeneralSettings: View {
  @ObservedObject var model: SunnyModel
  @AppStorage(Preferences.showPercentage) private var showPercentage = true
  @AppStorage(Preferences.icon) private var icon = MenuBarIcon.sunny.rawValue

  var body: some View {
    Form {
      Section {
        Toggle(isOn: $showPercentage) {
          Text("Show percentage", bundle: .module, comment: "Settings: show the level beside the menu bar icon")
          Text("Beside the icon, while the boost is on.", bundle: .module, comment: "Settings: under Show percentage")
        }
        Picker(selection: $icon) {
          ForEach(MenuBarIcon.allCases) { choice in
            Image(nsImage: choice.image)
              .accessibilityLabel(Text(verbatim: choice.name))
              .help(choice.name)
              .tag(choice.rawValue)
          }
        } label: {
          Text("Icon", bundle: .module, comment: "Settings: the menu bar icon picker")
        }
        .pickerStyle(.segmented)
      }
      Section {
        Toggle(isOn: Binding(get: { model.openAtLogin ?? false }, set: { model.setOpenAtLogin($0) })) {
          Text("Open at login", bundle: .module, comment: "Settings: start Sunny when the user logs in")
        }
        .disabled(model.openAtLogin == nil)
      }
    }
  }
}

private struct ShortcutSettings: View {
  var body: some View {
    Form {
      Section {
        LabeledContent {
          KeyboardShortcuts.Recorder(for: .toggleBoost)
        } label: {
          Text("Turn boost on or off", bundle: .module, comment: "Settings: the global shortcut's recorder")
        }
      } footer: {
        Text("Works from any app.", bundle: .module, comment: "Settings: under the shortcut recorder")
          .font(.callout)
          .foregroundStyle(.secondary)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
  }
}

private struct BatterySettings: View {
  @AppStorage(Preferences.turnOffOnBattery) private var enabled = false
  @AppStorage(Preferences.batteryThreshold) private var threshold = BatteryPolicy.defaultThreshold

  var body: some View {
    Form {
      Section {
        Toggle(isOn: $enabled) {
          Text("Turn off boost on battery", bundle: .module, comment: "Settings: the battery setting")
          Text("It turns back on when the Mac is plugged in again.", bundle: .module, comment: "Settings: under Turn off boost on battery")
        }
        Stepper(value: $threshold, in: BatteryPolicy.thresholds, step: BatteryPolicy.thresholdStep) {
          Text("When the charge is below \(threshold)%", bundle: .module, comment: "Settings: the battery threshold")
        }
        .disabled(!enabled)
      }
    }
  }
}
