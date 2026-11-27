// Sunny: a menu bar icon and a small popover that set the luminosity boost. No Dock icon, no other window.
import AppKit
import Combine
import SunnyCore
import SunnyKit
import SwiftUI

@main
struct SunnyApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate

  var body: some Scene {
    MenuBarExtra {
      PopoverView(model: delegate.model)
    } label: {
      MenuBarLabel(model: delegate.model)
    }
    .menuBarExtraStyle(.window)
  }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
  let model = SunnyModel()
  private var monitors: [Any] = []
  private var signalSources: [DispatchSourceSignal] = []
  private var subscriptions: Set<AnyCancellable> = []

  func applicationDidFinishLaunching(_ notification: Notification) {
    restoreOnSignals()
    monitors = [keyMonitor(), rightClickMonitor()].compactMap { $0 }
    // The tooltip of the icon follows the state. SwiftUI creates the status item after launch.
    model.objectWillChange
      .receive(on: RunLoop.main)
      .merge(with: Just(()).delay(for: .milliseconds(500), scheduler: RunLoop.main))
      .sink { [weak self] _ in self?.updateToolTip() }
      .store(in: &subscriptions)
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

  /// The slider's keys, wherever the focus is in the popover: arrows move about 1%, page keys one x1.1 step,
  /// Home and End go to 100% and 300%.
  private func keyMonitor() -> Any? {
    NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
      guard let self, event.modifierFlags.intersection([.command, .control, .option]).isEmpty else { return event }
      let level = model.shownLevel
      let next: Int
      switch Int(event.keyCode) {
      case 123, 125: next = SliderScale.move(level, by: -SliderScale.fineStep) // left, down
      case 124, 126: next = SliderScale.move(level, by: SliderScale.fineStep) // right, up
      case 121: next = SliderScale.move(level, by: -SliderScale.coarseStep) // page down
      case 116: next = SliderScale.move(level, by: SliderScale.coarseStep) // page up
      case 115: next = Level.min // home
      case 119: next = Level.max // end
      default: return event
      }
      model.set(next)
      return nil
    }
  }

  /// Right-click on the icon: a menu with Quit.
  private func rightClickMonitor() -> Any? {
    NSEvent.addLocalMonitorForEvents(matching: .rightMouseDown) { [weak self] event in
      guard let self, let window = event.window, Self.isStatusBarWindow(window), let view = window.contentView else { return event }
      let menu = NSMenu()
      let quit = NSMenuItem(title: "Quit Sunny", action: #selector(quitFromMenu), keyEquivalent: "")
      quit.target = self
      menu.addItem(quit)
      NSMenu.popUpContextMenu(menu, with: event, for: view)
      return nil
    }
  }

  @objc private func quitFromMenu() {
    model.quit()
  }

  private func updateToolTip() {
    let text = model.isOn ? "Sunny: \(model.level)%" : "Sunny: off"
    for window in NSApp.windows where Self.isStatusBarWindow(window) {
      if let button = Self.findButton(in: window.contentView) { button.toolTip = text }
    }
  }

  private static func isStatusBarWindow(_ window: NSWindow) -> Bool {
    String(describing: type(of: window)).contains("StatusBarWindow")
  }

  private static func findButton(in view: NSView?) -> NSButton? {
    guard let view else { return nil }
    if let button = view as? NSButton { return button }
    for subview in view.subviews {
      if let button = findButton(in: subview) { return button }
    }
    return nil
  }
}
