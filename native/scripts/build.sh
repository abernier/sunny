#!/bin/sh
# Builds Sunny.app from the Swift package, the downloads of a GitHub release, and the Mac App Store installer.
#
#   scripts/build.sh dev    build/dev/Sunny.app: Apple silicon, signed ad hoc, sandboxed; runs on this Mac
#   scripts/build.sh dist   build/dist/Sunny.app, Sunny-arm64.dmg and Sunny-arm64.zip: Apple silicon, signed ad hoc,
#                           not sandboxed, not notarised; what a release hands out (and the Homebrew cask installs)
#   scripts/build.sh mas    build/mas/Sunny.app and build/mas/Sunny-<version>.pkg: universal, signed for the store
#
# Environment:
#   SUNNY_VERSION       CFBundleShortVersionString (default 0.4.0)
#   SUNNY_BUILD         CFBundleVersion, which has to grow with each store upload (default 1; dist: the version)
#   SUNNY_MAS_PROFILE   the provisioning profile to embed (default .signing/sunny-mas.provisionprofile of the main checkout)
#   SUNNY_MAS_IDENTITY  the app's signing identity (default: the "Apple Distribution" one in the keychain)
#   SUNNY_PKG_IDENTITY  the installer's (default: the "3rd Party Mac Developer Installer" one)
#   DEVELOPER_DIR       the Xcode to build with (default /Applications/Xcode.app: the store refuses beta SDKs)
set -eu

mode=${1:-dev}
case "$mode" in
  dev | dist | mas) ;;
  *) echo "usage: $0 dev|dist|mas" >&2; exit 2 ;;
esac

here=$(cd "$(dirname "$0")/.." && pwd)
# The main checkout, also from a git worktree: .signing/ (not committed) lives there.
repo=$(cd "$(git -C "$here" rev-parse --path-format=absolute --git-common-dir)/.." && pwd)
version=${SUNNY_VERSION:-0.4.0}
if [ "$mode" = dist ]; then build=${SUNNY_BUILD:-$version}; else build=${SUNNY_BUILD:-1}; fi
out="$here/build/$mode"
app="$out/Sunny.app"

if [ -z "${DEVELOPER_DIR:-}" ] && [ -d /Applications/Xcode.app/Contents/Developer ]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi

# The store build is universal; the others are for Apple silicon only, like the Homebrew cask.
if [ "$mode" = mas ]; then
  set -- -c release --arch arm64 --arch x86_64
else
  set -- -c release --arch arm64
fi
swift build --package-path "$here" "$@"
bin=$(swift build --package-path "$here" "$@" --show-bin-path)

# What Xcode would record of the toolchain: App Store Connect reads these to check the SDK.
xcode_version=$(defaults read "$DEVELOPER_DIR/../version.plist" CFBundleShortVersionString)
xcode_build=$(defaults read "$DEVELOPER_DIR/../version.plist" ProductBuildVersion)
dt_xcode=$(echo "$xcode_version" | awk -F. '{ printf "%d%d%d0", $1 / 10, $1 % 10, $2 }')
sdk_version=$(xcrun --sdk macosx --show-sdk-version)
sdk_build=$(xcrun --sdk macosx --show-sdk-build-version)
os_build=$(sw_vers -buildVersion)

rm -rf "$out"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
# SwiftPM links with the deployment target as the SDK version (13.0); the store checks that version, so the
# executable gets the SDK it was really built with.
xcrun vtool -set-build-version macos 13.0 "$sdk_version" -replace -output "$app/Contents/MacOS/Sunny" "$bin/Sunny" 2>/dev/null
cp "$here/Resources/AppIcon.icns" "$here/Resources/MenuBarIconTemplate.png" "$here/Resources/MenuBarIconTemplate@2x.png" "$app/Contents/Resources/"
# The strings (English and French) of SunnyKit and of KeyboardShortcuts: SwiftPM resource bundles, which their code
# looks for in Contents/Resources. Without their own signatures, which the app's seals over.
for bundle in Sunny_SunnyKit KeyboardShortcuts_KeyboardShortcuts; do
  [ -d "$bin/$bundle.bundle" ] || { echo "no $bundle.bundle in $bin" >&2; exit 1; }
  ditto "$bin/$bundle.bundle" "$app/Contents/Resources/$bundle.bundle"
  rm -rf "$app/Contents/Resources/$bundle.bundle/Contents/_CodeSignature"
done
printf 'APPL????' > "$app/Contents/PkgInfo"

cat > "$app/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>
	<string>en</string>
	<key>CFBundleDisplayName</key>
	<string>Sunny</string>
	<key>CFBundleExecutable</key>
	<string>Sunny</string>
	<key>CFBundleIconFile</key>
	<string>AppIcon</string>
	<key>CFBundleIdentifier</key>
	<string>com.abernier.sunny</string>
	<key>CFBundleLocalizations</key>
	<array>
		<string>en</string>
		<string>fr</string>
	</array>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>Sunny</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>$version</string>
	<key>CFBundleSupportedPlatforms</key>
	<array>
		<string>MacOSX</string>
	</array>
	<key>CFBundleVersion</key>
	<string>$build</string>
	<key>BuildMachineOSBuild</key>
	<string>$os_build</string>
	<key>DTCompiler</key>
	<string>com.apple.compilers.llvm.clang.1_0</string>
	<key>DTPlatformBuild</key>
	<string>$sdk_build</string>
	<key>DTPlatformName</key>
	<string>macosx</string>
	<key>DTPlatformVersion</key>
	<string>$sdk_version</string>
	<key>DTSDKBuild</key>
	<string>$sdk_build</string>
	<key>DTSDKName</key>
	<string>macosx$sdk_version</string>
	<key>DTXcode</key>
	<string>$dt_xcode</string>
	<key>DTXcodeBuild</key>
	<string>$xcode_build</string>
	<key>ITSAppUsesNonExemptEncryption</key>
	<false/>
	<key>LSApplicationCategoryType</key>
	<string>public.app-category.utilities</string>
	<key>LSMinimumSystemVersion</key>
	<string>13.0</string>
	<key>LSUIElement</key>
	<true/>
	<key>NSHighResolutionCapable</key>
	<true/>
	<key>NSHumanReadableCopyright</key>
	<string>Copyright 2026 Antoine Bernier</string>
	<key>NSPrincipalClass</key>
	<string>NSApplication</string>
</dict>
</plist>
EOF
plutil -lint "$app/Contents/Info.plist" >/dev/null

if [ "$mode" = dev ]; then
  codesign --force --sign - --entitlements "$here/entitlements/dev.plist" "$app"
  codesign --verify --strict "$app"
  echo "made ${app#"$here"/} (signed ad hoc): open it, or run $app/Contents/MacOS/Sunny to see its log"
  exit 0
fi

if [ "$mode" = dist ]; then
  # Signed ad hoc and not sandboxed, as the downloads always were: an ad hoc signature changes with every
  # build, and a sandboxed app whose signature changed has to ask for its own container after each update.
  # Without an Apple Developer ID there is no notarisation: the README and the cask deal with Gatekeeper.
  xattr -cr "$app"
  codesign --force --sign - "$app"
  codesign --verify --strict "$app"
  # The names stay the same from one version to the next: the site links to .../releases/latest/download/Sunny-arm64.dmg.
  dmg="$out/Sunny-arm64.dmg"
  zip="$out/Sunny-arm64.zip"
  stage="$out/dmg"
  mkdir -p "$stage"
  ditto "$app" "$stage/Sunny.app"
  ln -s /Applications "$stage/Applications"
  hdiutil create -quiet -volname Sunny -srcfolder "$stage" -fs HFS+ -format UDZO -ov "$dmg"
  rm -rf "$stage"
  hdiutil verify -quiet "$dmg"
  ditto -c -k --sequesterRsrc --keepParent "$app" "$zip"
  echo "made ${app#"$here"/}, ${dmg#"$here"/} ($(du -h "$dmg" | cut -f1 | tr -d ' ')) and ${zip#"$here"/} ($(du -h "$zip" | cut -f1 | tr -d ' ')), signed ad hoc"
  exit 0
fi

profile=${SUNNY_MAS_PROFILE:-$repo/.signing/sunny-mas.provisionprofile}
[ -f "$profile" ] || { echo "no provisioning profile at $profile (set SUNNY_MAS_PROFILE)" >&2; exit 1; }
cp -X "$profile" "$app/Contents/embedded.provisionprofile"
# As few extended attributes as possible: the installer carries them as AppleDouble ._ files. Only
# com.apple.provenance, which the system sets again, stays.
xattr -cr "$app"
codesign --force --sign "${SUNNY_MAS_IDENTITY:-Apple Distribution}" --entitlements "$here/entitlements/mas.plist" "$app"
codesign --verify --strict "$app"

pkg="$out/Sunny-$version.pkg"
productbuild --component "$app" /Applications --sign "${SUNNY_PKG_IDENTITY:-3rd Party Mac Developer Installer}" "$pkg"
pkgutil --check-signature "$pkg" >/dev/null
echo "made ${app#"$here"/} and ${pkg#"$here"/} ($(du -h "$pkg" | cut -f1 | tr -d ' '))"
