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
  /// Where the slider's fill ends, on the track's middle: the point the pointer drags (the slider has no knob).
  var knob: Point
}

/// popover.json: the popover's size, the slider's travel and every picture.
struct Manifest: Encodable {
  /// [width, height] in points.
  var size: [Double]
  /// The fill's travel: x is where it ends at the slider's start, width the distance to where it ends at the end;
  /// y and height are those of the slider.
  var track: Box
  /// The slider's end, in x1.1 steps (SliderScale.end).
  var end: Double
  /// The y of the track's middle, where the pointer grabs it.
  var thumb: Thumb
  /// The centre of the Boost switch.
  var `switch`: Point
  var frames: [Frame]

  struct Thumb: Encodable {
    var y: Double
  }
}

/// A window that draws its controls as the key window does (tinted), as the open popover's does, while it is
/// never shown.
final class KeyLookingWindow: NSWindow {
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
  /// Where the popover's parts are, as the view reports them (PopoverPart).
  private let parts = Parts()

  private final class Parts {
    var frames: [PopoverPart: CGRect] = [:]
  }

  init() {
    let parts = parts
    host = NSHostingView(rootView: AnyView(
      PopoverView(model: model)
        .onPreferenceChange(PopoverPart.Frames.self) { frames in MainActor.assumeIsolated { parts.frames = frames } }
        .environment(\.colorScheme, .dark)
        .environment(\.controlActiveState, .key)
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

  /// What is shown, at `scale` pixels per point, transparent behind the controls.
  func bitmap() -> NSBitmapImageRep? {
    let width = Int(host.bounds.width) * Self.scale
    let height = Int(host.bounds.height) * Self.scale
    guard let bitmap = NSBitmapImageRep(
      bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8, samplesPerPixel: 4,
      hasAlpha: true, isPlanar: false, colorSpaceName: .calibratedRGB, bytesPerRow: 0, bitsPerPixel: 0
    ) else { return nil }
    bitmap.size = host.bounds.size
    host.display()
    host.cacheDisplay(in: host.bounds, to: bitmap)
    return bitmap.retagging(with: .sRGB)
  }

  /// The slider's frame, as the view reports it.
  func slider() -> CGRect? {
    parts.frames[.slider]
  }

  /// Where the slider's fill ends in a picture, in points: its last bright pixel along the slider's middle, from
  /// the slider's start. Measured, because the fill does not run over the slider's whole frame. Nil without fill.
  func fillEnd(in bitmap: NSBitmapImageRep) -> Double? {
    guard let frame = slider() else { return nil }
    let scale = Double(Self.scale)
    let y = Int(frame.midY * scale)
    var x = Int(frame.minX * scale)
    var last: Int?
    while x < Int(frame.maxX * scale), let pixel = bitmap.colorAt(x: x, y: y), pixel.alphaComponent > 0.5, pixel.brightnessComponent > 0.8 {
      last = x
      x += 1
    }
    return last.map { Double($0 + 1) / scale }
  }

  /// The Boost switch.
  func boostSwitch() -> CGRect? {
    parts.frames[.boostSwitch]
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

  // The slider's travel: where its fill ends one and nine x1.1 steps in, measured, then extended to both ends
  // (the fill grows in a straight line with the position, except right at the ends, where it is held in).
  func measure(at position: Double) -> (position: Double, x: Double)? {
    canvas.show(SliderScale.level(at: position))
    guard let bitmap = canvas.bitmap(), let x = canvas.fillEnd(in: bitmap) else { return nil }
    return (SliderScale.position(of: canvas.model.shownLevel), x)
  }
  guard let near = measure(at: 1), let far = measure(at: 9), let slider = canvas.slider(),
        let toggle = canvas.boostSwitch() else {
    print("no slider or switch found in the popover")
    return 1
  }
  let perStep = (far.x - near.x) / (far.position - near.position)
  let start = near.x - perStep * near.position

  /// Writes the picture shown, and says where the slider's fill ends in it (the start when there is none).
  func write(_ name: String) -> Point? {
    guard let bitmap = canvas.bitmap(), let data = bitmap.representation(using: .png, properties: [:]),
          (try? data.write(to: folder.appendingPathComponent(name))) != nil else { return nil }
    return Point(x: canvas.fillEnd(in: bitmap) ?? start, y: slider.midY)
  }

  canvas.show(Level.min)
  var frames: [Frame] = []
  if let levels {
    for level in levels {
      canvas.show(level)
      let name = "level-\(level).png"
      guard let at = write(name) else { print("cannot draw \(name)"); return 1 }
      frames.append(Frame(pos: SliderScale.position(of: level), level: canvas.model.shownLevel, file: "popover/\(name)", knob: at))
    }
  } else {
    // Off, then the same picture for the pointer over the slider: the native slider has no hover look.
    guard write("off.png") != nil, write("hover.png") != nil else { print("cannot draw the popover"); return 1 }
    for i in 0...94 {
      let pos = Double(i) / 10
      canvas.show(SliderScale.level(at: pos))
      let name = String(format: "%03d.png", i)
      guard let at = write(name) else { print("cannot draw \(name)"); return 1 }
      frames.append(Frame(pos: pos, level: canvas.model.shownLevel, file: "popover/\(name)", knob: at))
    }
  }
  canvas.show(Level.min)

  let manifest = Manifest(
    size: [canvas.size.width, canvas.size.height],
    track: Box(CGRect(x: start, y: slider.minY, width: perStep * SliderScale.end, height: slider.height)),
    end: SliderScale.end,
    thumb: .init(y: slider.midY),
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
