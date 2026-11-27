// swift-tools-version: 6.0
// Sunny, the native menu bar app. `swift build` makes the executable; scripts/build.sh wraps it into
// Sunny.app (and the Mac App Store installer).
//   SunnyCore    the pure logic (level scale, gamma math), tested with `swift test`
//   SunnyKit     the boost (EDR overlay and gamma table) and the model the popover drives
//   Sunny        the SwiftUI menu bar app
//   boost-check  a check of the boost on this Mac's display (`swift run boost-check`)
import PackageDescription

let package = Package(
  name: "Sunny",
  platforms: [.macOS(.v13)],
  products: [
    .executable(name: "Sunny", targets: ["Sunny"]),
  ],
  targets: [
    .target(name: "SunnyCore"),
    .target(name: "SunnyKit", dependencies: ["SunnyCore"]),
    .executableTarget(name: "Sunny", dependencies: ["SunnyCore", "SunnyKit"]),
    .executableTarget(
      name: "boost-check",
      dependencies: ["SunnyCore", "SunnyKit"],
      // SwiftPM records the deployment target as the SDK version, and SwiftUI then draws its pre-26 controls (a
      // knob on the slider). The app gets its real SDK from scripts/build.sh; the pictures drawn here must match it.
      linkerSettings: [.unsafeFlags(["-Xlinker", "-platform_version", "-Xlinker", "macos", "-Xlinker", "13.0", "-Xlinker", "26.0"])]
    ),
    .testTarget(name: "SunnyCoreTests", dependencies: ["SunnyCore"]),
  ]
)
