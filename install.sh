#!/bin/sh
# Build the boost binary into ~/.local/bin and print the line to add to ~/.bashrc.
set -eu
repo=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$HOME/.local/bin" "$HOME/.local/state"
swiftc -O "$repo/boost/luminosity-boost.swift" -o "$HOME/.local/bin/luminosity-boost"
echo "Built $HOME/.local/bin/luminosity-boost"
echo "Add to ~/.bashrc:  . \"$repo/shell/luminosity.bash\""
