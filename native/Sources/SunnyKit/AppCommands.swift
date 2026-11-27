// What the icon's right-click menu does: Settings, About, the App Store rating, Quit.
import AppKit
import StoreKit
import SunnyCore

@MainActor
public enum AppCommands {
  /// Sunny on the Mac App Store.
  public static let appStoreID = "6840042334"
  public static let appStoreURL = URL(string: "https://apps.apple.com/app/id\(appStoreID)")!
  /// The App Store app, on Sunny's "Write a Review" sheet.
  public static let writeReviewURL = URL(string: "macappstore://apps.apple.com/app/id\(appStoreID)?action=write-review")!
  /// The site the About panel links to.
  public static let siteURL = URL(string: "https://github.com/abernier/sunny")!

  /// The app's version, from Info.plist; nil without a bundle (`swift run`).
  public static var version: String? {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
  }

  /// Opens the Settings window (the SwiftUI Settings scene). The app has no Dock icon and is not active: it is
  /// activated first, or the window would open behind the one in front.
  public static func openSettings() {
    NSApp.activate(ignoringOtherApps: true)
    // SwiftUI puts "Settings…" (Cmd-,) in the app menu, wired to its Settings scene; macOS 14 and later ignore
    // the showSettingsWindow: action sent from anywhere else.
    if let appMenu = NSApp.mainMenu?.items.first?.submenu,
       let index = appMenu.items.firstIndex(where: { $0.keyEquivalent == "," && $0.keyEquivalentModifierMask == .command }) {
      appMenu.performActionForItem(at: index)
    } else {
      NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
    }
  }

  /// The standard About panel, with the version, the copyright and links to the site and the App Store.
  public static func showAbout() {
    NSApp.activate(ignoringOtherApps: true)
    NSApp.orderFrontStandardAboutPanel(options: [
      .credits: credits(version: version),
      // The copyright is in the credits.
      NSApplication.AboutPanelOptionKey(rawValue: "Copyright"): "",
    ])
  }

  /// The About panel's credits: centred lines of small text, the links in the accent color.
  public static func credits(version: String?) -> NSAttributedString {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    paragraph.paragraphSpacing = 4
    let base: [NSAttributedString.Key: Any] = [
      .font: NSFont.systemFont(ofSize: NSFont.smallSystemFontSize),
      .foregroundColor: NSColor.labelColor,
      .paragraphStyle: paragraph,
    ]
    let text = NSMutableAttributedString()
    func line(_ string: String, link: URL? = nil) {
      var attributes = base
      if let link { attributes[.link] = link }
      if text.length > 0 { text.append(NSAttributedString(string: "\n", attributes: base)) }
      text.append(NSAttributedString(string: string, attributes: attributes))
    }
    if let version {
      line(String(localized: "Version \(version)", bundle: .module, comment: "In the About panel"))
    }
    line("© 2026 Antoine Bernier")
    line(siteURL.host.map { $0 + siteURL.path } ?? siteURL.absoluteString, link: siteURL)
    line(String(localized: "Sunny on the App Store", bundle: .module, comment: "A link in the About panel"), link: appStoreURL)
    return text
  }

  /// The App Store app, on the sheet to write a review.
  public static func rate() {
    NSWorkspace.shared.open(writeReviewURL)
  }

  /// The right-click menu of the icon. Its items call `target`'s actions (StatusItemController).
  public static func menu(target: AnyObject?, settings: Selector, about: Selector, rate: Selector, quit: Selector) -> NSMenu {
    let menu = NSMenu()
    func item(_ title: String, _ action: Selector, _ key: String = "") {
      let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
      item.target = target
      menu.addItem(item)
    }
    item(String(localized: "Settings…", bundle: .module, comment: "Menu item: opens the Settings window"), settings, ",")
    item(String(localized: "About Sunny", bundle: .module, comment: "Menu item: opens the About panel"), about)
    item(String(localized: "Rate on the App Store…", bundle: .module, comment: "Menu item: opens the App Store to write a review"), rate)
    menu.addItem(.separator())
    item(String(localized: "Quit Sunny", bundle: .module, comment: "Menu item: quits the app"), quit, "q")
    return menu
  }
}

/// Asks the system for its rating prompt once per app version, the 5th time the user turns the boost on in it
/// (ReviewPrompt). The system decides whether it shows; development builds never show it.
@MainActor
public enum ReviewRequest {
  private static let countKey = "reviewPromptCount"
  private static let versionKey = "reviewPromptVersion"
  private static let askedKey = "reviewPromptAskedVersion"

  public static func boostTurnedOn() {
    guard let version = AppCommands.version else { return }
    let defaults = UserDefaults.standard
    var prompt = ReviewPrompt(
      count: defaults.integer(forKey: countKey),
      version: defaults.string(forKey: versionKey),
      askedVersion: defaults.string(forKey: askedKey)
    )
    let ask = prompt.boostTurnedOn(in: version)
    defaults.set(prompt.count, forKey: countKey)
    defaults.set(prompt.version, forKey: versionKey)
    defaults.set(prompt.askedVersion, forKey: askedKey)
    if ask { SKStoreReviewController.requestReview() }
  }
}
