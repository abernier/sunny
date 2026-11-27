// Sunny: a menu bar icon, a small popover that sets the luminosity boost, and a Settings window. No Dock icon.
import AppKit
import KeyboardShortcuts
import SunnyCore
import SunnyKit
import SwiftUI

@main
struct SunnyApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate

  var body: some Scene {
    // The menu bar item is AppKit's (StatusItemController): SwiftUI's MenuBarExtra has no right-click or scroll.
    Settings {
      SettingsView(model: delegate.model)
    }
  }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
  let model = SunnyModel()
  private var statusItem: StatusItemController?
  private var battery: BatteryGuard?
  private var signalSources: [DispatchSourceSignal] = []

  override init() {
    super.init()
    Preferences.register()
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    restoreOnSignals()
    model.onBoostTurnedOn = { ReviewRequest.boostTurnedOn() }
    statusItem = StatusItemController(model: model)
    KeyboardShortcuts.onKeyDown(for: .toggleBoost) { [weak self] in
      guard let self else { return }
      model.toggle(!model.isOn)
    }
    let battery = BatteryGuard(model: model)
    battery.start()
    self.battery = battery
  }

  func applicationWillTerminate(_ notification: Notification) {
    // From Quit, at logout, or when the system asks: the boost never outlives the app.
    model.restore()
  }

  /// SIGTERM, SIGINT and SIGHUP (`kill`, Ctrl-C in a terminal) restore the gamma before the app ends.
  private func restoreOnSignals() {
    for sig in [SIGTERM, SIGINT, SIGHUP] {
      signal(sig, SIG_IGN)
      let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
      source.setEventHandler {
        MainActor.assumeIsolated {
          self.model.restore()
          exit(0)
        }
      }
      source.resume()
      signalSources.append(source)
    }
  }
}
