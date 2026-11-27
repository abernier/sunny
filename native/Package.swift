// swift-tools-version: 6.0
// Sunny, the native menu bar app. `swift build` makes the executable; scripts/build.sh wraps it into
// Sunny.app (and the Mac App Store installer).
//   SunnyCore    the pure logic (level scale, gamma math, scroll, battery and review rules), tested with `swift test`
//   SunnyKit     the boost (EDR overlay and gamma table), the model, the popover, the status item and Settings,
//                and the strings in English and French (Resources/Localizable.xcstrings)
//   Sunny        the menu bar app
// The strings are looked up in SunnyKit's resource bundle (Bundle.module), which scripts/build.sh copies into
// Sunny.app/Contents/Resources with the one of KeyboardShortcuts.
//   boost-check  a check of the boost on this Mac's display (`swift run boost-check`)
import PackageDescription

let package = Package(
  name: "Sunny",
  defaultLocalization: "en",
  platforms: [.macOS(.v13)],
  products: [
    .executable(name: "Sunny", targets: ["Sunny"]),
  ],
  dependencies: [
    // The global shortcut and its recorder: Carbon hot keys, which the sandbox allows (MIT).
    .package(url: "https://github.com/sindresorhus/KeyboardShortcuts", from: "1.17.0"),
  ],
  targets: [
    .target(name: "SunnyCore"),
    .target(
      name: "SunnyKit",
      dependencies: ["SunnyCore", .product(name: "KeyboardShortcuts", package: "KeyboardShortcuts")],
      resources: [.process("Resources")]
    ),
    .executableTarget(
      name: "Sunny",
      dependencies: ["SunnyCore", "SunnyKit", .product(name: "KeyboardShortcuts", package: "KeyboardShortcuts")]
    ),
    .executableTarget(
      name: "boost-check",
      dependencies: ["SunnyCore", "SunnyKit"],
      exclude: ["Info.plist"],
      // SwiftPM records the deployment target as the SDK version, and SwiftUI then draws its pre-26 controls (a
      // knob on the slider). The app gets its real SDK from scripts/build.sh; the pictures drawn here must match it.
      // Info.plist, embedded, lists the app's languages: a tool without them gets every bundle's strings in English.
      linkerSettings: [.unsafeFlags([
        "-Xlinker", "-platform_version", "-Xlinker", "macos", "-Xlinker", "13.0", "-Xlinker", "26.0",
        "-Xlinker", "-sectcreate", "-Xlinker", "__TEXT", "-Xlinker", "__info_plist",
        "-Xlinker", "\(Context.packageDirectory)/Sources/boost-check/Info.plist",
      ])]
    ),
    .testTarget(name: "SunnyCoreTests", dependencies: ["SunnyCore"]),
  ]
)
