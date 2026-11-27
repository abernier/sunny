// The rules behind 0.4.0's settings: scrolling over the icon, the battery setting, the rating prompt.
import SunnyCore
import XCTest

final class ScrollScaleTests: XCTestCase {
  func testAWheelNotchUpMovesAboutTwoPercent() {
    var scroll = ScrollScale()
    XCTAssertEqual(scroll.level(from: 150, deltaY: 1, precise: false, inverted: false), SliderScale.move(150, by: 0.2))
    XCTAssertEqual(SliderScale.move(150, by: 0.2), 153)
  }

  func testPushingUpBrightensWhateverTheScrollDirectionSetting() {
    var plain = ScrollScale()
    var natural = ScrollScale()
    // "Natural" scrolling reports the opposite delta, and says so.
    XCTAssertGreaterThan(plain.level(from: 150, deltaY: 1, precise: false, inverted: false), 150)
    XCTAssertGreaterThan(natural.level(from: 150, deltaY: -1, precise: false, inverted: true), 150)
    var down = ScrollScale()
    XCTAssertLessThan(down.level(from: 150, deltaY: -1, precise: false, inverted: false), 150)
  }

  func testSmallTrackpadDeltasAddUpInsteadOfBeingRoundedAway() {
    var scroll = ScrollScale()
    var level = 200
    // Half a point at a time: each alone moves less than a whole level.
    for _ in 0..<100 {
      level = scroll.level(from: level, deltaY: 0.5, precise: true, inverted: false)
    }
    XCTAssertEqual(level, SliderScale.move(200, by: 100 * 0.5 * ScrollScale.stepsPerPoint))
    XCTAssertGreaterThan(level, 200)
  }

  func testItStopsAtBothEnds() {
    var scroll = ScrollScale()
    XCTAssertEqual(scroll.level(from: 290, deltaY: 1000, precise: true, inverted: false), 300)
    XCTAssertEqual(scroll.level(from: 300, deltaY: 5, precise: false, inverted: false), 300)
    // Back from the end at once: the position was held at the end, not beyond it.
    XCTAssertLessThan(scroll.level(from: 300, deltaY: -1, precise: false, inverted: false), 300)
    var down = ScrollScale()
    XCTAssertEqual(down.level(from: 110, deltaY: -1000, precise: true, inverted: false), 100)
    XCTAssertEqual(down.level(from: 100, deltaY: .nan, precise: true, inverted: false), 100)
  }

  func testItStartsAgainFromALevelSetElsewhere() {
    var scroll = ScrollScale()
    _ = scroll.level(from: 150, deltaY: 0.4, precise: true, inverted: false)
    // The slider moved to 250 meanwhile: the next scroll counts from there.
    XCTAssertEqual(scroll.level(from: 250, deltaY: 1, precise: false, inverted: false), SliderScale.move(250, by: 0.2))
  }
}

final class BatteryPolicyTests: XCTestCase {
  let low = PowerState(onBattery: true, charge: 15)
  let high = PowerState(onBattery: true, charge: 60)

  func testItStopsOnlyWhenEnabledOnBatteryAndBelowTheThreshold() {
    XCTAssertTrue(BatteryPolicy.mustStop(enabled: true, threshold: 20, power: low))
    XCTAssertFalse(BatteryPolicy.mustStop(enabled: false, threshold: 20, power: low))
    XCTAssertFalse(BatteryPolicy.mustStop(enabled: true, threshold: 20, power: high))
    XCTAssertFalse(BatteryPolicy.mustStop(enabled: true, threshold: 20, power: PowerState(onBattery: true, charge: 20)))
    XCTAssertFalse(BatteryPolicy.mustStop(enabled: true, threshold: 20, power: .plugged))
    XCTAssertFalse(BatteryPolicy.mustStop(enabled: true, threshold: 20, power: PowerState(onBattery: false, charge: 5)))
    // On battery with no charge to read: off, to be safe.
    XCTAssertTrue(BatteryPolicy.mustStop(enabled: true, threshold: 20, power: PowerState(onBattery: true, charge: nil)))
  }

  func testItStopsABoostAndTurnsItBackOnOnACPower() {
    var policy = BatteryPolicy()
    XCTAssertEqual(policy.update(enabled: true, threshold: 20, power: high, level: 180), .none)
    XCTAssertEqual(policy.update(enabled: true, threshold: 20, power: low, level: 180), .stop)
    XCTAssertEqual(policy.stoppedLevel, 180)
    // Still on battery, and charged above the threshold again: it waits for AC power.
    XCTAssertEqual(policy.update(enabled: true, threshold: 20, power: high, level: 100), .none)
    XCTAssertEqual(policy.update(enabled: true, threshold: 20, power: .plugged, level: 100), .resume(180))
    XCTAssertNil(policy.stoppedLevel)
    XCTAssertEqual(policy.update(enabled: true, threshold: 20, power: .plugged, level: 180), .none)
  }

  func testABoostThatWasOffStaysOff() {
    var policy = BatteryPolicy()
    XCTAssertEqual(policy.update(enabled: true, threshold: 20, power: low, level: 100), .none)
    XCTAssertEqual(policy.update(enabled: true, threshold: 20, power: .plugged, level: 100), .none)
  }

  func testABoostTurnedOnByHandMeanwhileIsLeftAlone() {
    var policy = BatteryPolicy()
    XCTAssertEqual(policy.update(enabled: true, threshold: 20, power: low, level: 200), .stop)
    XCTAssertEqual(policy.update(enabled: true, threshold: 20, power: .plugged, level: 150), .none)
    XCTAssertNil(policy.stoppedLevel)
  }

  func testTurningTheSettingOffForgetsTheStoppedBoost() {
    var policy = BatteryPolicy()
    XCTAssertEqual(policy.update(enabled: true, threshold: 20, power: low, level: 200), .stop)
    XCTAssertEqual(policy.update(enabled: false, threshold: 20, power: low, level: 100), .none)
    XCTAssertEqual(policy.update(enabled: true, threshold: 20, power: .plugged, level: 100), .none)
  }

  func testTheDefaultThresholdIsOffered() {
    XCTAssertTrue(BatteryPolicy.thresholds.contains(BatteryPolicy.defaultThreshold))
    XCTAssertEqual(BatteryPolicy.defaultThreshold % BatteryPolicy.thresholdStep, 0)
  }
}

final class ReviewPromptTests: XCTestCase {
  func testItAsksOnTheFifthBoostOncePerVersion() {
    var prompt = ReviewPrompt()
    let asked = (1...12).map { _ in prompt.boostTurnedOn(in: "0.4.0") }
    XCTAssertEqual(asked, [false, false, false, false, true] + Array(repeating: false, count: 7))
    XCTAssertEqual(prompt.askedVersion, "0.4.0")
  }

  func testANewVersionCountsAgainFromZero() {
    var prompt = ReviewPrompt(count: 9, version: "0.4.0", askedVersion: "0.4.0")
    XCTAssertEqual((1...4).map { _ in prompt.boostTurnedOn(in: "0.5.0") }, [false, false, false, false])
    XCTAssertEqual(prompt.count, 4)
    XCTAssertTrue(prompt.boostTurnedOn(in: "0.5.0"))
    XCTAssertFalse(prompt.boostTurnedOn(in: "0.5.0"))
  }

  func testItPicksUpASavedCount() {
    var prompt = ReviewPrompt(count: 4, version: "0.4.0", askedVersion: "0.3.0")
    XCTAssertTrue(prompt.boostTurnedOn(in: "0.4.0"))
  }
}
