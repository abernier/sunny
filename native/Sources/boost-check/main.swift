// A check of the boost on this Mac's own display, through the same model the popover drives: it reads the
// gamma table back after each step. Each boost lasts about a second, and the gamma is always restored.
//   swift run boost-check          the sequence below; ends with 0 when every step holds
//   swift run boost-check hold 200 the level 200 until killed (to check what a crash leaves behind)
import AppKit
import CoreGraphics
import SunnyCore
import SunnyKit
import SwiftUI

func topSample() -> Float {
  var red = [CGGammaValue](repeating: 0, count: 256)
  var green = red
  var blue = red
  var count: UInt32 = 0
  CGGetDisplayTransferByTable(CGMainDisplayID(), 256, &red, &green, &blue, &count)
  return red[Int(count) - 1]
}

func headroom() -> Double {
  Double(NSScreen.main?.maximumExtendedDynamicRangeColorComponentValue ?? 1)
}

@MainActor
func settle(_ seconds: Double = 1.2) async {
  try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
}

/// Draws a view offscreen into a PNG, AppKit controls included (ImageRenderer leaves them out).
@MainActor
func render<V: View>(_ view: V, to path: String, dark: Bool) {
  let host = NSHostingView(rootView: view)
  host.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
  host.frame = NSRect(origin: .zero, size: host.fittingSize)
  host.wantsLayer = true
  host.layer?.backgroundColor = (dark ? NSColor(white: 0.17, alpha: 1) : NSColor(white: 0.93, alpha: 1)).cgColor
  let window = NSWindow(contentRect: host.frame, styleMask: .borderless, backing: .buffered, defer: false)
  window.contentView = host
  host.layoutSubtreeIfNeeded()
  host.display()
  guard let bitmap = host.bitmapImageRepForCachingDisplay(in: host.bounds) else { return }
  host.cacheDisplay(in: host.bounds, to: bitmap)
  try? bitmap.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: path))
  print("drew \(path) (\(Int(host.frame.width))x\(Int(host.frame.height)) pt)")
}

@MainActor
func run() async -> Int32 {
  let arguments = CommandLine.arguments.dropFirst()
  let model = SunnyModel()

  if arguments.first == "render" {
    // The popover off, then on at 150% (a boost of about a second), in light and dark.
    let dir = arguments.dropFirst().first ?? "."
    await settle(1)
    render(PopoverView(model: model), to: "\(dir)/popover-off.png", dark: false)
    model.set(150)
    await settle(0.5)
    render(PopoverView(model: model), to: "\(dir)/popover-on.png", dark: false)
    render(PopoverView(model: model), to: "\(dir)/popover-on-dark.png", dark: true)
    render(MenuBarLabel(model: model).padding(4), to: "\(dir)/menubar-on.png", dark: true)
    model.restore()
    return 0
  }

  if arguments.first == "hold" {
    model.set(Int(arguments.dropFirst().first ?? "") ?? 200)
    await settle()
    print("holding \(model.level)%: top sample \(topSample())")
    while true { await settle(3600) }
  }

  var failures = 0
  func check(_ name: String, _ ok: Bool, _ detail: String) {
    print("\(ok ? "ok  " : "FAIL") \(name): \(detail)")
    if !ok { failures += 1 }
  }
  // The headroom ramps up over a second or more after EDR starts: wait for the expected factor, up to 4 s.
  func boosted(_ level: Int) async -> (Bool, String) {
    for _ in 0..<40 {
      let expected = Boost.factor(level: level, headroom: headroom()) * baseline
      if abs(topSample() - expected) < 0.02 && Level.factor(level) <= headroom() { break }
      await settle(0.1)
    }
    let top = topSample()
    let expected = Boost.factor(level: level, headroom: headroom()) * baseline
    return (abs(top - expected) < 0.02 && top > baseline * 1.01, "top sample \(top), expected \(expected) (headroom \(headroom()))")
  }

  // A window shown before the app has finished launching gets no EDR: let it finish first.
  await settle(1)
  let baseline = topSample()
  check("starts normal", abs(baseline - 1) < 0.002, "top sample \(baseline)")

  model.set(150)
  var result = await boosted(150)
  check("150% raises the gamma", model.isOn && result.0, result.1)

  model.set(100)
  await settle(0.3)
  check("back to normal restores it", !model.isOn && abs(topSample() - baseline) < 0.002, "top sample \(topSample())")

  model.toggle(true)
  result = await boosted(150)
  check("the switch turns back on to the last boost", model.level == 150 && result.0, "level \(model.level), \(result.1)")

  model.step(1)
  result = await boosted(165)
  check("+ steps by x1.1", model.level == 165 && result.0, "level \(model.level), \(result.1)")

  model.set(SliderScale.level(at: SliderScale.end))
  result = await boosted(300)
  check("the slider's end asks for 300%", model.level == 300 && result.0, "level \(model.level), \(result.1)")

  model.restore()
  await settle(0.3)
  check("quitting restores it", !model.isOn && abs(topSample() - baseline) < 0.002, "top sample \(topSample())")

  return failures == 0 ? 0 : 1
}

setvbuf(stdout, nil, _IONBF, 0)
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
Task { @MainActor in
  exit(await run())
}
app.run()
