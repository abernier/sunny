// The brightness level and its scale. A level is an integer percent of the display's normal maximum:
// 100 is normal (off), 300 the panel limit. Same rules as the `luminosity` shell function.
import Foundation

public enum Level {
  /// The normal brightness: no boost.
  public static let min = 100
  /// The highest boost the panel allows.
  public static let max = 300
  /// One "+" or "-" step multiplies or divides the level by this, because perceived brightness is not linear.
  public static let stepRatio = 1.1
  /// The level the switch turns on to when there is no earlier boost to return to.
  public static let defaultBoost = 150

  /// A level as an integer within 100...300. Anything that is not a finite number is normal.
  public static func clamp(_ value: Double) -> Int {
    guard value.isFinite else { return min }
    return Swift.min(max, Swift.max(min, Int(value.rounded())))
  }

  /// The level after `steps` x1.1 steps (negative steps divide), like `luminosity +` and `luminosity -`.
  public static func step(_ level: Int, by steps: Int) -> Int {
    clamp(Double(level) * pow(stepRatio, Double(steps)))
  }

  /// Whether a level is a boost, that is, whether the boost should run for it.
  public static func isBoost(_ level: Int) -> Bool {
    clamp(Double(level)) > min
  }

  /// The gamma factor a level asks for: 150 is x1.5.
  public static func factor(_ level: Int) -> Double {
    Double(clamp(Double(level))) / 100
  }
}

/// The slider's scale is counted in x1.1 steps from 100%, so that equal distances on it are equal ratios.
public enum SliderScale {
  /// The number of x1.1 steps from 100% to 300% (about 11.53).
  public static let max = log(Double(Level.max) / Double(Level.min)) / log(Level.stepRatio)
  /// A fine step (arrow keys): a tenth of an x1.1 step, about 1%.
  public static let fineStep = 0.1
  /// A coarse step (page keys): one x1.1 step.
  public static let coarseStep = 1.0
  /// The slider's end, rounded up to a fine step so that 300% is reachable.
  public static let end = (max / fineStep).rounded(.up) * fineStep

  /// The level at a slider position (in x1.1 steps from 100%).
  public static func level(at position: Double) -> Int {
    Level.clamp(Double(Level.min) * pow(Level.stepRatio, position))
  }

  /// The slider position (in x1.1 steps from 100%) of a level.
  public static func position(of level: Int) -> Double {
    log(Double(Level.clamp(Double(level))) / Double(Level.min)) / log(Level.stepRatio)
  }

  /// The level `steps` slider units away from `level` (fractions allowed), the way the slider's keys move it.
  public static func move(_ level: Int, by steps: Double) -> Int {
    self.level(at: Swift.min(end, Swift.max(0, position(of: level) + steps)))
  }
}
