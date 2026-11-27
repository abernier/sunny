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
    .executableTarget(name: "boost-check", dependencies: ["SunnyCore", "SunnyKit"]),
    .testTarget(name: "SunnyCoreTests", dependencies: ["SunnyCore"]),
  ]
)
