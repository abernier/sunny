// Scrolling over the menu bar icon moves the level along the slider's scale (x1.1 steps from 100%).

/// Turns scroll wheel and trackpad deltas into levels. It keeps the position between events, so that the many
/// small deltas of a trackpad add up instead of each being rounded away.
public struct ScrollScale: Equatable, Sendable {
  /// A wheel notch (one line) moves the slider this many x1.1 steps: about 2%.
  public static let stepsPerLine = 0.2
  /// A trackpad point moves the slider this many x1.1 steps: the whole scale is about 580 points of swipe.
  public static let stepsPerPoint = 0.02

  /// The slider position the last event reached, and the level it gave.
  private var position: Double?
  private var lastLevel: Int?

  public init() {}

  /// The level after a vertical scroll of `deltaY` from `level`.
  /// - Parameters:
  ///   - deltaY: the event's vertical delta: lines for a wheel, points for a trackpad (`hasPreciseScrollingDeltas`).
  ///   - precise: whether the delta is in points (trackpad, Magic Mouse) rather than lines (wheel).
  ///   - inverted: whether the system inverts the delta ("natural" scrolling), so that pushing up always brightens.
  public mutating func level(from level: Int, deltaY: Double, precise: Bool, inverted: Bool) -> Int {
    guard deltaY.isFinite else { return level }
    // Start again from the level shown when something else (the slider, a key, the switch) moved it.
    if lastLevel != level || position == nil {
      position = SliderScale.position(of: level)
    }
    let up = inverted ? -deltaY : deltaY
    let steps = up * (precise ? Self.stepsPerPoint : Self.stepsPerLine)
    let next = Swift.min(SliderScale.end, Swift.max(0, (position ?? 0) + steps))
    position = next
    let result = SliderScale.level(at: next)
    lastLevel = result
    return result
  }
}
