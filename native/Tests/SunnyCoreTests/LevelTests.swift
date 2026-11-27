// Ported from tray/test/level.test.ts, plus the gamma side the Electron app left to the helper program.
import SunnyCore
import XCTest

final class LevelTests: XCTestCase {
  func testClampRoundsToAnIntegerWithin100To300() {
    XCTAssertEqual(Level.clamp(150.4), 150)
    XCTAssertEqual(Level.clamp(150.5), 151)
    XCTAssertEqual(Level.clamp(42), 100)
    XCTAssertEqual(Level.clamp(1000), 300)
    XCTAssertEqual(Level.clamp(.nan), 100)
    XCTAssertEqual(Level.clamp(.infinity), 100)
  }

  func testStepMultipliesOrDividesBy1_1PerStepRoundedAndClamped() {
    XCTAssertEqual(Level.step(100, by: 1), 110)
    XCTAssertEqual(Level.step(110, by: 1), 121)
    XCTAssertEqual(Level.step(150, by: 1), 165)
    XCTAssertEqual(Level.step(165, by: -1), 150)
    XCTAssertEqual(Level.step(100, by: 2), 121)
    XCTAssertEqual(Level.step(105, by: -1), 100)
    XCTAssertEqual(Level.step(290, by: 1), 300)
    XCTAssertEqual(Level.step(300, by: 1), 300)
    XCTAssertEqual(Level.step(100, by: -1), 100)
  }

  func testIsBoostIsTrueAbove100Only() {
    XCTAssertFalse(Level.isBoost(100))
    XCTAssertTrue(Level.isBoost(101))
    XCTAssertFalse(Level.isBoost(50))
  }

  func testTheSliderMapsLogarithmicallyOneUnitIsOneStep() {
    XCTAssertEqual(SliderScale.level(at: 0), 100)
    XCTAssertEqual(SliderScale.level(at: 1), 110)
    XCTAssertEqual(SliderScale.level(at: 2), 121)
    XCTAssertEqual(SliderScale.level(at: SliderScale.max), 300)
    XCTAssertEqual(SliderScale.max, log(3) / log(1.1), accuracy: 1e-12)
    XCTAssertEqual(SliderScale.position(of: 100), 0)
    XCTAssertEqual(SliderScale.position(of: 300), SliderScale.max, accuracy: 1e-12)
    // Equal distances are equal ratios: the middle of the scale is the geometric mean of 100 and 300.
    XCTAssertEqual(SliderScale.level(at: SliderScale.max / 2), Int((100.0 * 300).squareRoot().rounded()))
    for level in [100, 123, 150, 200, 250, 300] {
      XCTAssertEqual(SliderScale.level(at: SliderScale.position(of: level)), level)
    }
  }

  func testTheSliderEndReaches300() {
    XCTAssertGreaterThanOrEqual(SliderScale.end, SliderScale.max)
    XCTAssertLessThan(SliderScale.end - SliderScale.max, SliderScale.fineStep)
    XCTAssertEqual(SliderScale.level(at: SliderScale.end), 300)
  }

  func testArrowKeysMoveByAboutOnePercentAndStopAtTheEnds() {
    // A tenth of an x1.1 step is x1.0096: 1 point near 100%, 3 near 300%, never 0.
    for level in 100..<300 {
      let up = SliderScale.move(level, by: SliderScale.fineStep)
      XCTAssertTrue((level + 1)...(level + 3) ~= up, "up from \(level): \(up)")
    }
    for level in 101...300 {
      let down = SliderScale.move(level, by: -SliderScale.fineStep)
      XCTAssertTrue((level - 3)...(level - 1) ~= down, "down from \(level): \(down)")
    }
    XCTAssertEqual(SliderScale.move(100, by: SliderScale.fineStep), 101)
    XCTAssertEqual(SliderScale.move(300, by: SliderScale.fineStep), 300)
    XCTAssertEqual(SliderScale.move(100, by: -SliderScale.fineStep), 100)
    XCTAssertEqual(SliderScale.move(150, by: SliderScale.coarseStep), 165)
  }
}

final class GammaTests: XCTestCase {
  func testTheFactorIsTheLevelCappedByTheHeadroomNeverBelow1() {
    XCTAssertEqual(Boost.factor(level: 150, headroom: 3), 1.5)
    XCTAssertEqual(Boost.factor(level: 300, headroom: 2.2), 2.2, accuracy: 1e-6)
    XCTAssertEqual(Boost.factor(level: 200, headroom: 1), 1)
    XCTAssertEqual(Boost.factor(level: 200, headroom: 0.5), 1)
    XCTAssertEqual(Boost.factor(level: 100, headroom: 3), 1)
  }

  func testSmallFactorChangesDoNotRewriteTheTable() {
    XCTAssertFalse(Boost.needsUpdate(applied: 1.5, next: 1.504))
    XCTAssertTrue(Boost.needsUpdate(applied: 1.5, next: 1.51))
    XCTAssertTrue(Boost.needsUpdate(applied: 0, next: 1))
  }

  func testScalingMultipliesEveryChannelAndKeepsTheOriginal() {
    let identity = GammaTable.identity(count: 256)
    XCTAssertEqual(identity.red.first, 0)
    XCTAssertEqual(identity.red.last, 1)
    XCTAssertEqual(identity.red.count, 256)
    let boosted = identity.scaled(by: 2)
    XCTAssertEqual(boosted.red.last, 2)
    XCTAssertEqual(boosted.green[128], identity.green[128] * 2)
    XCTAssertEqual(boosted.blue[255], 2)
    XCTAssertEqual(identity.red.last, 1)
    XCTAssertEqual(identity.scaled(by: 1), identity)
  }
}
