// When to ask for an App Store rating: once per app version, the 5th time the boost is turned on in it.

public struct ReviewPrompt: Equatable, Sendable {
  /// The number of times the boost is turned on in a version before the system is asked to show its prompt.
  public static let boostsBeforeAsking = 5

  /// How many times the boost was turned on in `version`.
  public var count: Int
  /// The version `count` counts for.
  public var version: String?
  /// The last version the prompt was asked for.
  public var askedVersion: String?

  public init(count: Int = 0, version: String? = nil, askedVersion: String? = nil) {
    self.count = count
    self.version = version
    self.askedVersion = askedVersion
  }

  /// Counts one more time the boost was turned on in `current`; true when the prompt has to be asked for now.
  public mutating func boostTurnedOn(in current: String) -> Bool {
    if version != current {
      version = current
      count = 0
    }
    guard askedVersion != current else { return false }
    count += 1
    guard count >= Self.boostsBeforeAsking else { return false }
    askedVersion = current
    return true
  }
}
