// The boost itself, in-process: what boost/luminosity-boost.swift does as a separate program.
//
// 1. A 1x1 point window shows EDR (HDR) content, which makes macOS raise the panel's backlight and expose
//    "headroom" (values above 1.0).
// 2. The display's gamma table is scaled by that headroom, so every pixel on screen uses the extra
//    brightness, not just HDR content.
// Stopping closes the window and restores the ColorSync gamma. The system also drops the gamma table when
// the process that set it ends, crash included.
import AppKit
import CoreGraphics
import MetalKit
import SunnyCore

@MainActor
final class BoostEngine {
  private static let tableSize: UInt32 = 256

  private let display = CGMainDisplayID()
  private var window: NSWindow?
  private var renderer: EDRRenderer?
  private var timer: Timer?
  private var original: GammaTable?
  private var applied: Float = 0
  private var observers: [NSObjectProtocol] = []

  /// The requested level. The applied factor follows it, capped by the headroom of the moment.
  var level = Level.min {
    didSet { update() }
  }

  var isRunning: Bool { window != nil }

  /// Starts the boost. False when there is no Metal device or no screen to show EDR content on.
  @discardableResult
  func start() -> Bool {
    if isRunning { return true }
    guard let screen = mainScreen(), let device = MTLCreateSystemDefaultDevice(), let renderer = EDRRenderer(device: device) else {
      log("no screen or Metal device: cannot boost")
      return false
    }
    original = readGamma()

    let frame = NSRect(x: screen.frame.minX, y: screen.frame.minY, width: 1, height: 1)
    let window = NSWindow(contentRect: frame, styleMask: .borderless, backing: .buffered, defer: false)
    window.level = .screenSaver
    window.isOpaque = false
    window.backgroundColor = .clear
    window.ignoresMouseEvents = true
    window.hasShadow = false
    window.isReleasedWhenClosed = false
    window.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]

    let view = MTKView(frame: NSRect(x: 0, y: 0, width: 1, height: 1), device: device)
    view.colorPixelFormat = .rgba16Float
    view.colorspace = CGColorSpace(name: CGColorSpace.extendedLinearDisplayP3)
    (view.layer as? CAMetalLayer)?.wantsExtendedDynamicRangeContent = true
    view.clearColor = MTLClearColor(red: 16, green: 16, blue: 16, alpha: 1)
    view.preferredFramesPerSecond = 5
    view.delegate = renderer
    window.contentView = view
    window.orderFrontRegardless()

    self.window = window
    self.renderer = renderer
    applied = 0

    // The headroom ramps up after EDR kicks in and drops when the panel gets hot: follow it.
    let timer = Timer(timeInterval: 0.1, repeats: true) { _ in
      MainActor.assumeIsolated { self.update() }
    }
    RunLoop.main.add(timer, forMode: .common)
    self.timer = timer

    // The system may reset the gamma table when displays change or wake: write it again then.
    let reapply: @Sendable (Notification) -> Void = { _ in
      MainActor.assumeIsolated {
        self.applied = 0
        self.update()
      }
    }
    observers = [
      NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main, using: reapply),
      NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.screensDidWakeNotification, object: nil, queue: .main, using: reapply),
    ]
    update()
    log("started")
    return true
  }

  /// Stops the boost and restores the normal gamma. Safe to call when it is not running.
  func stop() {
    timer?.invalidate()
    timer = nil
    for observer in observers {
      NotificationCenter.default.removeObserver(observer)
      NSWorkspace.shared.notificationCenter.removeObserver(observer)
    }
    observers = []
    window?.orderOut(nil)
    window?.close()
    window = nil
    renderer = nil
    original = nil
    applied = 0
    CGDisplayRestoreColorSyncSettings()
    log("stopped, gamma restored")
  }

  private func update() {
    guard isRunning, let original, let screen = mainScreen() else { return }
    let headroom = Double(screen.maximumExtendedDynamicRangeColorComponentValue)
    let factor = Boost.factor(level: level, headroom: headroom)
    guard Boost.needsUpdate(applied: applied, next: factor) else { return }
    writeGamma(original.scaled(by: factor))
    applied = factor
    log("headroom \(headroom), factor \(factor)")
  }

  /// The screen of the main display, whose gamma table is the one scaled.
  private func mainScreen() -> NSScreen? {
    NSScreen.screens.first { ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value == display } ?? NSScreen.main
  }

  private func readGamma() -> GammaTable {
    var red = [CGGammaValue](repeating: 0, count: Int(Self.tableSize))
    var green = red
    var blue = red
    var count: UInt32 = 0
    guard CGGetDisplayTransferByTable(display, Self.tableSize, &red, &green, &blue, &count) == .success, count > 0 else {
      return .identity(count: Int(Self.tableSize))
    }
    let n = Int(count)
    return GammaTable(red: Array(red[..<n]), green: Array(green[..<n]), blue: Array(blue[..<n]))
  }

  private func writeGamma(_ table: GammaTable) {
    CGSetDisplayTransferByTable(display, UInt32(table.red.count), table.red, table.green, table.blue)
  }

  private func log(_ message: String) {
    FileHandle.standardError.write(Data("[sunny] boost: \(message)\n".utf8))
  }
}

/// Clears the 1x1 view with an EDR value (16, far above 1.0) a few times a second: that is all it takes.
private final class EDRRenderer: NSObject, MTKViewDelegate {
  private let queue: MTLCommandQueue

  init?(device: MTLDevice) {
    guard let queue = device.makeCommandQueue() else { return nil }
    self.queue = queue
  }

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
