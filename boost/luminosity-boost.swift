// luminosity-boost: push the built-in XDR display past its SDR brightness cap.
//
// How it works:
// 1. A tiny window shows EDR (HDR) content, which makes macOS raise the
//    panel's backlight and expose "headroom" (values above 1.0).
// 2. The display gamma table is scaled by that headroom, so every pixel
//    on screen uses the extra brightness, not just HDR content.
// Quitting (SIGINT/SIGTERM) restores the original ColorSync gamma.
//
// The level is read live from a state file (e.g. "150"), so the shell function
// changes it without a restart. The file is $LUMINOSITY_STATE_FILE when set,
// ~/.local/state/luminosity-percent otherwise. (The menu bar app, native/, does
// the same in its own process and does not use this program.)
//
// Usage: [LUMINOSITY_STATE_FILE=path] [LUMINOSITY_EXIT_WITH_PARENT=1] luminosity-boost [factor]
//   (fallback when the state file is missing;
//                                     default 2.0, clamped to available headroom)

import Cocoa
import MetalKit

let fallbackFactor = CommandLine.arguments.count > 1
  ? Float(CommandLine.arguments[1]) ?? 2.0
  : 2.0

let stateFile: URL = {
  if let path = ProcessInfo.processInfo.environment["LUMINOSITY_STATE_FILE"], !path.isEmpty {
    return URL(fileURLWithPath: path)
  }
  return FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent(".local/state/luminosity-percent")
}()

func requestedFactor() -> Float {
  guard let text = try? String(contentsOf: stateFile, encoding: .utf8),
        let percent = Float(text.trimmingCharacters(in: .whitespacesAndNewlines)) else {
    return fallbackFactor
  }
  return percent / 100
}

let display = CGMainDisplayID()
let tableSize: UInt32 = 256
var originalRed = [CGGammaValue](repeating: 0, count: Int(tableSize))
var originalGreen = [CGGammaValue](repeating: 0, count: Int(tableSize))
var originalBlue = [CGGammaValue](repeating: 0, count: Int(tableSize))
var sampleCount: UInt32 = 0
CGGetDisplayTransferByTable(display, tableSize, &originalRed, &originalGreen, &originalBlue, &sampleCount)

func applyGamma(factor: Float) {
  let red = originalRed.map { $0 * factor }
  let green = originalGreen.map { $0 * factor }
  let blue = originalBlue.map { $0 * factor }
  CGSetDisplayTransferByTable(display, sampleCount, red, green, blue)
}

func restoreAndExit() -> Never {
  CGDisplayRestoreColorSyncSettings()
  exit(0)
}

for sig in [SIGINT, SIGTERM, SIGHUP] {
  signal(sig) { _ in restoreAndExit() }
}

final class EDRTrigger: NSObject, MTKViewDelegate {
  let queue: MTLCommandQueue
  init(device: MTLDevice) { queue = device.makeCommandQueue()! }
  func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}
  func draw(in view: MTKView) {
    guard let pass = view.currentRenderPassDescriptor,
          let drawable = view.currentDrawable,
          let buffer = queue.makeCommandBuffer(),
          let encoder = buffer.makeRenderCommandEncoder(descriptor: pass) else { return }
    encoder.endEncoding()
    buffer.present(drawable)
    buffer.commit()
  }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

guard let screen = NSScreen.main, let device = MTLCreateSystemDefaultDevice() else {
  fatalError("No screen or Metal device")
}

// 1x1 point window in the bottom-left corner, ignoring the mouse.
let frame = NSRect(x: screen.frame.minX, y: screen.frame.minY, width: 1, height: 1)
let window = NSWindow(contentRect: frame, styleMask: .borderless, backing: .buffered, defer: false)
window.level = .screenSaver
window.isOpaque = false
window.backgroundColor = .clear
window.ignoresMouseEvents = true
window.hasShadow = false
window.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]

let view = MTKView(frame: NSRect(x: 0, y: 0, width: 1, height: 1), device: device)
view.colorPixelFormat = .rgba16Float
view.colorspace = CGColorSpace(name: CGColorSpace.extendedLinearDisplayP3)
(view.layer as? CAMetalLayer)?.wantsExtendedDynamicRangeContent = true
view.clearColor = MTLClearColor(red: 16, green: 16, blue: 16, alpha: 1)
view.preferredFramesPerSecond = 5
let trigger = EDRTrigger(device: device)
view.delegate = trigger
window.contentView = view
window.orderFrontRegardless()

// Follow the requested level (state file) and the headroom, which ramps up
// after EDR kicks in and drops when the panel gets hot.
var lastFactor: Float = 0
// With LUMINOSITY_EXIT_WITH_PARENT=1 (for a program that runs it as a child and
// could not find a boost left behind), it stops as soon as the process that
// started it is gone, crash included: it is then re-parented, so its parent changes.
let parentAtStart = getppid()
let exitWithParent = ProcessInfo.processInfo.environment["LUMINOSITY_EXIT_WITH_PARENT"] == "1"
Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
  if exitWithParent && getppid() != parentAtStart { restoreAndExit() }
  let headroom = Float(screen.maximumExtendedDynamicRangeColorComponentValue)
  let factor = max(1, min(requestedFactor(), headroom))
  if abs(factor - lastFactor) > 0.005 {
    applyGamma(factor: factor)
    lastFactor = factor
    FileHandle.standardError.write("luminosity-boost: headroom \(headroom), factor \(factor)\n".data(using: .utf8)!)
  }
}

app.run()
