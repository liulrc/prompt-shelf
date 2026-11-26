#!/bin/sh
# Visible macOS regression test. It selects only the browser window it launches.
# Requires screen recording and accessibility permission in the calling session.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
scratch=$(mktemp -d "${TMPDIR:-/tmp}/promptshelf-webcapture.XXXXXX")
fixture_pid=
cleanup() {
    if [ -n "$fixture_pid" ]; then
        touch "$scratch/page.done"
        wait "$fixture_pid" 2>/dev/null || true
    fi
    rm -rf "$scratch"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
case "$(uname -m)" in
    arm64) arch=macos-arm64; triple=arm64-apple-macos14.0 ;;
    x86_64) arch=macos-x64; triple=x86_64-apple-macos14.0 ;;
    *) echo "Run this test in a macOS desktop session." >&2; exit 2 ;;
esac
matcher=$(PS_BUILD_ROOT="$scratch/build" "$root/desktop/scripts/build-core.sh" "$arch")
xcrun swiftc -O -parse-as-library -swift-version 5 -target "$triple" \
    "$root/desktop/mac/CaptureNative.swift" "$root/desktop/mac/Native.swift" \
    "$root/tests/mac/WebCaptureRegression.swift" "$matcher" -o "$scratch/probe"
if [ -n "${PS_CAPTURE_TEST_OUTPUT:-}" ]; then
    mkdir -p "$PS_CAPTURE_TEST_OUTPUT"
    PS_CAPTURE_TEST_OUTPUT=$(mktemp -d "$PS_CAPTURE_TEST_OUTPUT/run.XXXXXX")
    export PS_CAPTURE_TEST_OUTPUT
    echo "Captured PNGs: $PS_CAPTURE_TEST_OUTPUT"
fi
case "${1:-wk}" in
    chrome) node "$root/tests/mac/chrome-fixture.mjs" "$scratch" "$root/tests/mac/capture-page.html"; exit ;;
    wk) ;;
    *) echo "Usage: $0 [wk|chrome]" >&2; exit 2 ;;
esac
xcrun swiftc -O -parse-as-library -swift-version 5 -target "$triple" "$root/tests/mac/WebCaptureFixture.swift" -o "$scratch/fixture"
"$scratch/fixture" "$scratch/page" "$root/tests/mac/capture-page.html" &
fixture_pid=$!
for _ in $(seq 1 100); do
    [ -s "$scratch/page" ] && break
    sleep 0.1
done
[ -s "$scratch/page" ] || { echo "Test webpage did not finish loading." >&2; exit 1; }
"$scratch/probe" "$scratch/page"
