// The menu bar item: the icon (and the level while boosted), the popover on a click, the menu on a right-click,
// and the level on the scroll wheel.
import AppKit
import Combine
import SunnyCore
import SwiftUI

@MainActor
public final class StatusItemController: NSObject, NSPopoverDelegate {
  private let model: SunnyModel
  private let item: NSStatusItem
  private let popover = NSPopover()
  private var monitors: [Any] = []
  private var subscriptions: Set<AnyCancellable> = []
  private var scroll = ScrollScale()
  private var shownIcon: MenuBarIcon?

  public init(model: SunnyModel) {
    self.model = model
    item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    super.init()

    popover.behavior = .transient
    popover.animates = true
    popover.delegate = self
    let host = NSHostingController(rootView: PopoverView(model: model))
    host.sizingOptions = .preferredContentSize
    popover.contentViewController = host

    if let button = item.button {
      button.target = self
      button.action = #selector(clicked(_:))
      button.sendAction(on: [.leftMouseUp, .rightMouseUp])
      button.imagePosition = .imageLeading
    }

    monitors = [keyMonitor(), scrollMonitor()].compactMap { $0 }
    model.objectWillChange
      .receive(on: RunLoop.main)
      .sink { [weak self] _ in self?.update() }
      .store(in: &subscriptions)
    // Show percentage and Icon, from Settings.
    NotificationCenter.default.publisher(for: UserDefaults.didChangeNotification)
      .receive(on: RunLoop.main)
      .sink { [weak self] _ in self?.update() }
      .store(in: &subscriptions)
    update()
  }

  /// A click opens or closes the popover; a right-click (or a Control-click) shows the menu.
  @objc private func clicked(_ sender: NSStatusBarButton) {
    let event = NSApp.currentEvent
    if event?.type == .rightMouseUp || event?.modifierFlags.contains(.control) == true {
      showMenu()
    } else if popover.isShown {
      popover.performClose(sender)
    } else {
      showPopover()
    }
  }

  private func showPopover() {
    guard let button = item.button else { return }
    // The popover takes the keyboard (the slider's keys) and closes on a click elsewhere: the app has to be active.
    NSApp.activate(ignoringOtherApps: true)
    popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
    popover.contentViewController?.view.window?.makeKey()
  }

  private func showMenu() {
    popover.performClose(nil)
    item.menu = makeMenu()
    item.button?.performClick(nil)
    // Only for this click: a menu set on the item would take the left click too.
    item.menu = nil
  }

  /// The right-click menu.
  public func makeMenu() -> NSMenu {
    AppCommands.menu(
      target: self,
      settings: #selector(openSettings),
      about: #selector(showAbout),
      rate: #selector(rate),
      quit: #selector(quit)
    )
  }

  @objc private func openSettings() { AppCommands.openSettings() }
  @objc private func showAbout() { AppCommands.showAbout() }
  @objc private func rate() { AppCommands.rate() }
  @objc private func quit() { model.quit() }

  // MARK: The popover's state

  public func popoverWillShow(_ notification: Notification) {
    model.isPopoverOpen = true
  }

  public func popoverDidClose(_ notification: Notification) {
    model.isPopoverOpen = false
  }

  // MARK: The icon

  private func update() {
    guard let button = item.button else { return }
    let defaults = UserDefaults.standard
    let icon = MenuBarIcon.current
    if icon != shownIcon {
      button.image = icon.image
      shownIcon = icon
    }
    let level = defaults.bool(forKey: Preferences.showPercentage) ? model.menuBarLevel : nil
    let title = level.map { " \($0)%" } ?? ""
    if button.attributedTitle.string != title {
      let size = NSFont.menuBarFont(ofSize: 0).pointSize
      button.attributedTitle = NSAttributedString(string: title, attributes: [.font: NSFont.monospacedDigitSystemFont(ofSize: size, weight: .regular)])
    }
    button.toolTip = model.isOn
      ? String(localized: "Sunny: \(model.level)%", bundle: .module, comment: "The icon's tooltip while boosted")
      : String(localized: "Sunny: off", bundle: .module, comment: "The icon's tooltip while not boosted")
    button.setAccessibilityLabel(button.toolTip)
  }

  // MARK: Events

  /// The slider's keys, wherever the focus is in the popover: arrows move about 1%, page keys one x1.1 step,
  /// Home and End go to 100% and 300%. Only in the popover: Settings has fields of its own.
  private func keyMonitor() -> Any? {
    NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
      guard let self, popover.isShown, event.window === popover.contentViewController?.view.window,
            event.modifierFlags.intersection([.command, .control, .option]).isEmpty else { return event }
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

  /// The scroll wheel or two fingers over the icon move the level along the slider's scale (ScrollScale).
  private func scrollMonitor() -> Any? {
    NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { [weak self] event in
      guard let self, let window = item.button?.window, event.window === window else { return event }
      let deltaY = Double(event.scrollingDeltaY)
      guard deltaY != 0, abs(deltaY) >= abs(Double(event.scrollingDeltaX)) else { return nil }
      let next = scroll.level(
        from: model.shownLevel,
        deltaY: deltaY,
        precise: event.hasPreciseScrollingDeltas,
        inverted: event.isDirectionInvertedFromDevice
      )
      if next != model.shownLevel { model.set(next) }
      return nil
    }
  }
}
