// "Turn off boost on battery": the boost stops on battery power below a charge threshold, and comes back on
// when the Mac is plugged in again, if it was on when it stopped.

/// The power source of the moment, as IOKit reports it.
public struct PowerState: Equatable, Sendable {
  /// Whether the Mac runs on its battery (false on AC power, and on a Mac without a battery).
  public var onBattery: Bool
  /// The battery's charge in percent, nil without a battery.
  public var charge: Int?

  public init(onBattery: Bool, charge: Int?) {
    self.onBattery = onBattery
    self.charge = charge
  }

  /// On AC power, or no battery at all.
  public static let plugged = PowerState(onBattery: false, charge: nil)
}

/// The battery setting and the level it stopped, if it stopped one.
public struct BatteryPolicy: Equatable, Sendable {
  /// The charge the threshold defaults to, in percent.
  public static let defaultThreshold = 20
  /// The thresholds offered, in percent.
  public static let thresholds = 5...95
  public static let thresholdStep = 5

  public enum Action: Equatable, Sendable {
    /// Leave the boost as it is.
    case none
    /// Stop the boost.
    case stop
    /// Turn the boost back on to this level.
    case resume(Int)
  }

  /// The level that was boosted when the battery stopped it, to turn back on to on AC power.
  public private(set) var stoppedLevel: Int?

  public init() {}

  /// Whether the boost has to be off: the setting is on, the Mac is on battery and the charge is below the threshold.
  public static func mustStop(enabled: Bool, threshold: Int, power: PowerState) -> Bool {
    guard enabled, power.onBattery else { return false }
    guard let charge = power.charge else { return true }
    return charge < threshold
  }

  /// What to do after a change of power source, charge or setting, with the level shown now (100 when off).
  public mutating func update(enabled: Bool, threshold: Int, power: PowerState, level: Int) -> Action {
    guard enabled else {
      stoppedLevel = nil
      return .none
    }
    if Self.mustStop(enabled: enabled, threshold: threshold, power: power) {
      guard Level.isBoost(level) else { return .none }
      stoppedLevel = level
      return .stop
    }
    if !power.onBattery, let stoppedLevel {
      self.stoppedLevel = nil
      // Turned on again by hand meanwhile: nothing to bring back.
      return Level.isBoost(level) ? .none : .resume(stoppedLevel)
    }
    return .none
  }
}
