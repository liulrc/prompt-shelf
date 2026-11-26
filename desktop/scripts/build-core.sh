#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
out=${PS_BUILD_ROOT:-/tmp/ci-shelf-native-build}/core
case "${1:-}" in
  macos-arm64) target=aarch64-apple-darwin ;;
  macos-x64) target=x86_64-apple-darwin ;;
  windows-x64) target=x86_64-pc-windows-gnu ;;
  *) echo 'expected macos-arm64, macos-x64, or windows-x64' >&2; exit 2 ;;
esac
mkdir -p "$out/$1"
compiler=${RUSTC:-rustc}
if ! command -v "$compiler" >/dev/null 2>&1; then
    echo "Install Rust or set RUSTC to the compiler path (required target: $target)." >&2
    exit 1
fi
"$compiler" --crate-name prompt_scroll --crate-type lib --target "$target" --edition 2021 --emit=obj -C opt-level=2 -C panic=abort "$root/desktop/core/scroll.rs" -o "$out/$1/scroll.o"
echo "$out/$1/scroll.o"
