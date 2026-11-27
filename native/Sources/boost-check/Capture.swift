// Offscreen pictures of the real popover, for the reel (../reel/capture.mjs) and the App Store screenshots
// (../appstore/screenshots.mjs). They come from a preview model: the display's brightness is never touched.
//
//   swift run boost-check popover <dir>                    the reel's set: <dir>/popover/off.png, hover.png and
//                                                          000.png...094.png (slider positions 0 to 9.4 in x1.1
//                                                          steps, 100% to 245%), and <dir>/popover.json
//   swift run boost-check popover <dir> --levels 100,200   <dir>/popover/level-100.png, level-200.png, ...
//
// Pictures are dark (the menu bar's appearance over the reel's and the screenshots' skies), transparent where
// the popover's material would be (the scripts draw their own), at three pixels per point.
import AppKit
import SunnyCore
import SunnyKit
import SwiftUI

/// A point or a box, in points from the popover's top-left corner, as the JSON gives it.
struct Box: Encodable {
  var x: Double
  var y: Double
  var width: Double
  var height: Double

  init(_ rect: CGRect) {
    x = rect.minX
    y = rect.minY
    width = rect.width
    height = rect.height
  }

  var center: Point { Point(x: x + width / 2, y: y + height / 2) }
}

struct Point: Encodable {
  var x: Double
  var y: Double
}

/// What one picture shows, and where its parts are.
struct Frame: Encodable {
  var pos: Double
  var level: Int
  var file: String
  /// The centre of the slider's knob.
  var knob: Point
}

/// popover.json: the popover's size, the slider's travel and every picture.
struct Manifest: Encodable {
  /// [width, height] in points.
  var size: [Double]
  /// The knob's travel: x is its centre at the slider's start, width the distance to its centre at the end;
  /// y and height are those of the slider's bar.
  var track: Box
  /// The slider's end, in x1.1 steps (SliderScale.end).
  var end: Double
  /// The knob: the y of its centre and its width.
  var thumb: Thumb
  /// The centre of the Boost switch.
  var `switch`: Point
  var frames: [Frame]

  struct Thumb: Encodable {
    var y: Double
    var size: Double
  }
}

/// A window that draws its controls as the key window does (tinted), as the open popover's does, while it is
/// never shown.
private final class KeyLookingWindow: NSWindow {
  override var isKeyWindow: Bool { true }
  override var isMainWindow: Bool { true }
  // AppKit asks this (not public API: this tool is not part of the app) before it tints a control; without it,
  // the controls of an app that is never active, as this one, are drawn grey.
  @objc var hasKeyAppearance: Bool { true }
}

/// The popover drawn offscreen, AppKit controls included (ImageRenderer leaves them out).
@MainActor
final class PopoverCanvas {
  static let scale = 3

  let model = SunnyModel(preview: Level.min)
  private let host: NSHostingView<AnyView>
  private let window: NSWindow

  init() {
    host = NSHostingView(rootView: AnyView(
      PopoverView(model: model).environment(\.colorScheme, .dark).environment(\.controlActiveState, .key)
    ))
    host.appearance = NSAppearance(named: .darkAqua)
    window = KeyLookingWindow(contentRect: .zero, styleMask: .borderless, backing: .buffered, defer: false)
    window.appearance = host.appearance
    window.backgroundColor = .clear
    window.isOpaque = false
    window.contentView = host
    layout()
  }

  var size: CGSize { host.frame.size }

  /// Shows a level and lays the view out for it.
  func show(_ level: Int) {
    model.set(level)
    layout()
  }

  private func layout() {
    // Twice: the first pass lets SwiftUI publish the model's change, the second sizes what it shows.
    for _ in 0..<2 {
      RunLoop.main.run(until: Date().addingTimeInterval(0.02))
      host.frame = NSRect(origin: .zero, size: host.fittingSize)
      window.setContentSize(host.frame.size)
      host.layoutSubtreeIfNeeded()
    }
  }

  /// The PNG of what is shown, at `scale` pixels per point, transparent behind the controls.
  func png() -> Data? {
    let width = Int(host.bounds.width) * Self.scale
    let height = Int(host.bounds.height) * Self.scale
    guard let bitmap = NSBitmapImageRep(
      bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8, samplesPerPixel: 4,
      hasAlpha: true, isPlanar: false, colorSpaceName: .calibratedRGB, bytesPerRow: 0, bitsPerPixel: 0
    ) else { return nil }
    bitmap.size = host.bounds.size
    host.display()
    host.cacheDisplay(in: host.bounds, to: bitmap)
    return bitmap.retagging(with: .sRGB)?.representation(using: .png, properties: [:])
  }

  /// A control of the popover, by its AppKit class.
  private func control<T: NSView>(_ type: T.Type, in view: NSView? = nil) -> T? {
    for sub in (view ?? host).subviews {
      if let found = sub as? T { return found }
      if let found = control(type, in: sub) { return found }
    }
    return nil
  }

  /// A rectangle of a subview, in points from the popover's top-left corner.
  private func topLeft(_ rect: NSRect, of view: NSView) -> CGRect {
    let r = view.convert(rect, to: host)
    return host.isFlipped ? r : CGRect(x: r.minX, y: host.bounds.height - r.maxY, width: r.width, height: r.height)
  }

  /// The slider's knob and bar.
  func slider() -> (knob: CGRect, bar: CGRect)? {
    guard let slider = control(NSSlider.self), let cell = slider.cell as? NSSliderCell else { return nil }
    let flipped = slider.isFlipped
    return (topLeft(cell.knobRect(flipped: flipped), of: slider), topLeft(cell.barRect(flipped: flipped), of: slider))
  }

  /// The Boost switch.
  func boostSwitch() -> CGRect? {
    guard let toggle = control(NSSwitch.self) else { return nil }
    return topLeft(toggle.bounds, of: toggle)
  }
}

@MainActor
func capturePopover(to dir: String, levels: [Int]?) -> Int32 {
  let canvas = PopoverCanvas()
  let folder = URL(fileURLWithPath: dir).appendingPathComponent("popover")
  try? FileManager.default.removeItem(at: folder)
  do {
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
  } catch {
    print("cannot make \(folder.path): \(error.localizedDescription)")
    return 1
  }

  func write(_ name: String) -> Bool {
    guard let data = canvas.png() else { return false }
    return (try? data.write(to: folder.appendingPathComponent(name))) != nil
  }
  func knob() -> Point? { canvas.slider().map { Box($0.knob).center } }

  // The slider's travel: where the knob's centre is at either end.
  canvas.show(SliderScale.level(at: SliderScale.end))
  guard let atEnd = knob() else { print("no slider found in the popover"); return 1 }
  canvas.show(Level.min)
  guard let atStart = knob(), let (knobRect, bar) = canvas.slider(), let toggle = canvas.boostSwitch() else {
    print("no slider or switch found in the popover")
    return 1
  }

  var frames: [Frame] = []
  if let levels {
    for level in levels {
      canvas.show(level)
      let name = "level-\(level).png"
      guard write(name), let at = knob() else { print("cannot draw \(name)"); return 1 }
      frames.append(Frame(pos: SliderScale.position(of: level), level: canvas.model.shownLevel, file: "popover/\(name)", knob: at))
    }
  } else {
    // Off, then the same picture for the pointer over the knob: the native slider has no hover look.
    guard write("off.png"), write("hover.png") else { print("cannot draw the popover"); return 1 }
    for i in 0...94 {
      let pos = Double(i) / 10
      canvas.show(SliderScale.level(at: pos))
      let name = String(format: "%03d.png", i)
      guard write(name), let at = knob() else { print("cannot draw \(name)"); return 1 }
      frames.append(Frame(pos: pos, level: canvas.model.shownLevel, file: "popover/\(name)", knob: at))
    }
  }
  canvas.show(Level.min)

  let manifest = Manifest(
    size: [canvas.size.width, canvas.size.height],
    track: Box(CGRect(x: atStart.x, y: bar.minY, width: atEnd.x - atStart.x, height: bar.height)),
    end: SliderScale.end,
    thumb: .init(y: Box(knobRect).center.y, size: knobRect.width),
    switch: Box(toggle).center,
    frames: frames
  )
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
  do {
    try encoder.encode(manifest).write(to: URL(fileURLWithPath: dir).appendingPathComponent("popover.json"))
  } catch {
    print("cannot write popover.json: \(error.localizedDescription)")
    return 1
  }
  let size = "\(Int(canvas.size.width))x\(Int(canvas.size.height)) pt"
  print("popover: \(frames.count) pictures, \(frames.first?.level ?? 0)% to \(frames.last?.level ?? 0)%, \(size), in \(folder.path)")
  return 0
}
