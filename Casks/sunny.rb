# Sunny for Homebrew, from this repository as a tap:
#   brew tap abernier/sunny https://github.com/abernier/sunny
#   brew install --cask abernier/sunny/sunny
# The full name (tap/cask) is needed: Homebrew refuses to load a cask from an untrusted tap
# by its short name. The release workflow bumps version and sha256 here after each tag,
# and never replaces the assets of a published release, so the pinned sha256 stays valid.
cask "sunny" do
  version "0.1.0"
  sha256 "07ee8cc1933ca33fc77571423fb67113af7837a7fbcfdd9defbf12f93fbe7e9a"

  url "https://github.com/abernier/sunny/releases/download/v#{version}/Sunny-arm64.dmg"
  name "Sunny"
  desc "Menu bar app that pushes an XDR display past its SDR brightness cap"
  homepage "https://abernier.github.io/sunny/"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on arch: :arm64
  depends_on macos: :ventura

  app "Sunny.app"

  # The app is signed ad hoc, not notarised: without this, Gatekeeper refuses to open
  # the copy Homebrew downloaded (it carries the quarantine attribute).
  postflight_steps do
    run "/usr/bin/xattr",
        args:         ["-dr", "com.apple.quarantine", "{{appdir}}/Sunny.app"],
        must_succeed: false
  end

  # The boost helper runs detached from the app; stop it so the display goes back to normal.
  uninstall quit:   "com.abernier.sunny",
            script: {
              executable:   "/usr/bin/pkill",
              args:         ["-x", "luminosity-boost"],
              must_succeed: false,
            }

  # ~/.local/state/luminosity-percent is shared with the `luminosity` shell command: kept.
  zap trash: [
    "~/Library/Application Support/Sunny",
    "~/Library/Caches/com.abernier.sunny",
    "~/Library/HTTPStorages/com.abernier.sunny",
    "~/Library/Preferences/com.abernier.sunny.plist",
    "~/Library/Saved Application State/com.abernier.sunny.savedState",
  ]
end
