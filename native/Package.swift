// swift-tools-version: 6.0
// Sunny, the native menu bar app. `swift build` makes the executable; scripts/build.sh wraps it into
// Sunny.app (and the Mac App Store installer). SunnyCore holds the pure logic, tested with `swift test`.
import PackageDescription

let package = Package(
  name: "Sunny",
  platforms: [.macOS(.v13)],
  products: [
    .executable(name: "Sunny", targets: ["Sunny"]),
  ],
  targets: [
    .target(name: "SunnyCore"),
    .executableTarget(name: "Sunny", dependencies: ["SunnyCore"]),
    .testTarget(name: "SunnyCoreTests", dependencies: ["SunnyCore"]),
  ]
)
