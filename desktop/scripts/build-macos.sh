#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
build=${PS_BUILD_ROOT:-/tmp/ci-shelf-native-build}/mac
dist=${PS_DIST_DIR:-"$root/dist"}
mkdir -p "$build" "$dist"
stage=$(mktemp -d "$build.stage.XXXXXX")
trap 'rm -rf "$stage"' EXIT
app="$stage/词匣.app"
exe="$app/Contents/MacOS/PromptShelf"
web="$app/Contents/Resources/Web"
mkdir -p "$web/desktop" "$app/Contents/MacOS"
cp "$root/index.html" "$web/"
cp -R "$root/prototype" "$web/"
cp -R "$root/desktop/ui" "$web/desktop/"
cp "$root/desktop/mac/Info.plist" "$app/Contents/Info.plist"
cp "$root/desktop/mac/AppIcon.icns" "$app/Contents/Resources/"
version=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$app/Contents/Info.plist")
for cpu in arm64 x86_64; do
    case "$cpu" in arm64) rust_target=macos-arm64 ;; *) rust_target=macos-x64 ;; esac
    object=$("$root/desktop/scripts/build-core.sh" "$rust_target")
    xcrun swiftc -module-name PromptShelf -swift-version 5 -O -whole-module-optimization -target "$cpu-apple-macos14.0" "$root"/desktop/mac/*.swift "$object" -lsqlite3 -o "$build/PromptShelf-$cpu"
    strip -x "$build/PromptShelf-$cpu"
done
lipo -create "$build/PromptShelf-arm64" "$build/PromptShelf-x86_64" -output "$exe"
codesign --force --sign "${MAC_SIGN_IDENTITY:--}" "$app"
codesign --verify --strict --deep "$app"
ln -s /Applications "$stage/Applications"
hdiutil create -quiet -ov -fs HFS+ -format UDZO -volname "词匣" -srcfolder "$stage" "$dist/PromptShelf-${version}-macOS-universal.dmg"
hdiutil verify "$dist/PromptShelf-${version}-macOS-universal.dmg" >/dev/null
echo "$dist/PromptShelf-${version}-macOS-universal.dmg"
