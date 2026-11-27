// The gamma side of the boost: the display's transfer table, scaled by the factor the level asks for,
// capped by the EDR headroom the display offers right now.

/// A display's gamma transfer table, one ramp per channel.
public struct GammaTable: Equatable, Sendable {
  public var red: [Float]
  public var green: [Float]
  public var blue: [Float]

  public init(red: [Float], green: [Float], blue: [Float]) {
    self.red = red
    self.green = green
    self.blue = blue
  }

  /// The identity ramp of `count` samples, 0...1: what a display shows with no gamma correction.
  public static func identity(count: Int) -> GammaTable {
    let ramp = (0..<count).map { Float($0) / Float(Swift.max(1, count - 1)) }
    return GammaTable(red: ramp, green: ramp, blue: ramp)
  }

  /// Every sample multiplied by `factor`: values above 1 use the EDR headroom.
  public func scaled(by factor: Float) -> GammaTable {
    GammaTable(red: red.map { $0 * factor }, green: green.map { $0 * factor }, blue: blue.map { $0 * factor })
  }
}

public enum Boost {
  /// The factor actually applied: what the level asks for, capped by the headroom, never below 1.
  public static func factor(level: Int, headroom: Double) -> Float {
    Float(Swift.max(1, Swift.min(Level.factor(level), headroom)))
  }

  /// Whether a new factor differs enough from the applied one to rewrite the gamma table.
  public static func needsUpdate(applied: Float, next: Float) -> Bool {
    abs(next - applied) > 0.005
  }
}
