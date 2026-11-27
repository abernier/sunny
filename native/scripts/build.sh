#!/bin/sh
# Builds Sunny.app from the Swift package, and the Mac App Store installer.
#
#   scripts/build.sh dev    build/dev/Sunny.app: Apple silicon, signed ad hoc, sandboxed; runs on this Mac
#   scripts/build.sh mas    build/mas/Sunny.app and build/mas/Sunny-<version>.pkg: universal, signed for the store
#
# Environment:
#   SUNNY_VERSION       CFBundleShortVersionString (default 0.3.0)
#   SUNNY_BUILD         CFBundleVersion, which has to grow with each upload (default 1)
#   SUNNY_MAS_PROFILE   the provisioning profile to embed (default ../.signing/sunny-mas.provisionprofile)
#   SUNNY_MAS_IDENTITY  the app's signing identity (default: the "Apple Distribution" one in the keychain)
#   SUNNY_PKG_IDENTITY  the installer's (default: the "3rd Party Mac Developer Installer" one)
#   DEVELOPER_DIR       the Xcode to build with (default /Applications/Xcode.app: the store refuses beta SDKs)
set -eu

mode=${1:-dev}
case "$mode" in
  dev | mas) ;;
  *) echo "usage: $0 dev|mas" >&2; exit 2 ;;
esac

here=$(cd "$(dirname "$0")/.." && pwd)
repo=$(cd "$here/.." && pwd)
version=${SUNNY_VERSION:-0.3.0}
build=${SUNNY_BUILD:-1}
out="$here/build/$mode"
app="$out/Sunny.app"

if [ -z "${DEVELOPER_DIR:-}" ] && [ -d /Applications/Xcode.app/Contents/Developer ]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi

# The store build is universal; the development one is for this Mac only, which is quicker.
if [ "$mode" = mas ]; then
  set -- -c release --arch arm64 --arch x86_64
else
  set -- -c release --arch arm64
fi
swift build --package-path "$here" "$@"
bin=$(swift build --package-path "$here" "$@" --show-bin-path)

rm -rf "$out"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$bin/Sunny" "$app/Contents/MacOS/Sunny"
cp "$here/Resources/AppIcon.icns" "$here/Resources/MenuBarIconTemplate.png" "$here/Resources/MenuBarIconTemplate@2x.png" "$app/Contents/Resources/"
printf 'APPL????' > "$app/Contents/PkgInfo"

# What Xcode would record of the toolchain: App Store Connect reads these to check the SDK.
xcode_version=$(defaults read "$DEVELOPER_DIR/../version.plist" CFBundleShortVersionString)
xcode_build=$(defaults read "$DEVELOPER_DIR/../version.plist" ProductBuildVersion)
dt_xcode=$(echo "$xcode_version" | awk -F. '{ printf "%d%d%d0", $1 / 10, $1 % 10, $2 }')
sdk_version=$(xcrun --sdk macosx --show-sdk-version)
sdk_build=$(xcrun --sdk macosx --show-sdk-build-version)
os_build=$(sw_vers -buildVersion)

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

profile=${SUNNY_MAS_PROFILE:-$repo/.signing/sunny-mas.provisionprofile}
[ -f "$profile" ] || { echo "no provisioning profile at $profile (set SUNNY_MAS_PROFILE)" >&2; exit 1; }
cp "$profile" "$app/Contents/embedded.provisionprofile"
codesign --force --sign "${SUNNY_MAS_IDENTITY:-Apple Distribution}" --entitlements "$here/entitlements/mas.plist" "$app"
codesign --verify --strict "$app"

pkg="$out/Sunny-$version.pkg"
productbuild --component "$app" /Applications --sign "${SUNNY_PKG_IDENTITY:-3rd Party Mac Developer Installer}" "$pkg"
pkgutil --check-signature "$pkg" >/dev/null
echo "made ${app#"$here"/} and ${pkg#"$here"/} ($(du -h "$pkg" | cut -f1 | tr -d ' '))"
