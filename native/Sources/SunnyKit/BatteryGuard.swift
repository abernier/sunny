// "Turn off boost on battery": IOKit's power source notifications (which the sandbox allows) drive BatteryPolicy.
import Foundation
import IOKit.ps
import SunnyCore

/// Follows the power source and the battery settings, and stops or brings back the boost as BatteryPolicy says.
@MainActor
public final class BatteryGuard {
  private let model: SunnyModel
  private var policy = BatteryPolicy()
  private var source: CFRunLoopSource?
  private var defaultsObserver: NSObjectProtocol?

  public init(model: SunnyModel) {
    self.model = model
  }

  public func start() {
    let context = Unmanaged.passUnretained(self).toOpaque()
    // Called on the main run loop, where the source is added, on every change of power source or charge.
    let callback: IOPowerSourceCallbackType = { context in
      guard let context else { return }
      let guard_ = Unmanaged<BatteryGuard>.fromOpaque(context).takeUnretainedValue()
      MainActor.assumeIsolated { guard_.evaluate() }
    }
    if let source = IOPSNotificationCreateRunLoopSource(callback, context)?.takeRetainedValue() {
      CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
      self.source = source
    }
    // The setting or its threshold changed in Settings.
    defaultsObserver = NotificationCenter.default.addObserver(forName: UserDefaults.didChangeNotification, object: nil, queue: .main) { [weak self] _ in
      MainActor.assumeIsolated { self?.evaluate() }
    }
    evaluate()
  }

  private func evaluate() {
    let defaults = UserDefaults.standard
    let action = policy.update(
      enabled: defaults.bool(forKey: Preferences.turnOffOnBattery),
      threshold: defaults.integer(forKey: Preferences.batteryThreshold),
      power: Self.power(),
      level: model.shownLevel
    )
    if action != .none {
      FileHandle.standardError.write(Data("[sunny] battery: \(action)\n".utf8))
      model.applyBatteryAction(action)
    }
  }

  /// The power source of the moment: whether the Mac draws on its battery, and the charge of its internal battery.
  public static func power() -> PowerState {
    guard let info = IOPSCopyPowerSourcesInfo()?.takeRetainedValue() else { return .plugged }
    let providing = IOPSGetProvidingPowerSourceType(info)?.takeUnretainedValue() as String?
    let onBattery = providing == kIOPSBatteryPowerValue
    var charge: Int?
    let list = IOPSCopyPowerSourcesList(info)?.takeRetainedValue() as? [CFTypeRef] ?? []
    for source in list {
      guard let description = IOPSGetPowerSourceDescription(info, source)?.takeUnretainedValue() as? [String: Any],
            description[kIOPSTypeKey] as? String == kIOPSInternalBatteryType,
            let current = description[kIOPSCurrentCapacityKey] as? Int,
            let max = description[kIOPSMaxCapacityKey] as? Int, max > 0 else { continue }
      charge = Int((Double(current) / Double(max) * 100).rounded())
    }
    return PowerState(onBattery: onBattery, charge: charge)
  }
}
