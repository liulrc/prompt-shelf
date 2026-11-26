#!/bin/sh
# Build on macOS/Linux with mingw-w64, NSIS, Python 3, curl, unzip and Rust.
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
src="$repo/desktop/windows"
tools_dir=${PS_WINDOWS_TOOLS:-${TMPDIR:-/tmp}/cixia-windows-tools}
out=${PS_DIST:-"$repo/dist"}
mkdir -p "$tools_dir" "$out"
out=$(CDPATH= cd -- "$out" && pwd)
work=$(mktemp -d "${TMPDIR:-/tmp}/cixia-winbuild.XXXXXX")
trap 'rm -rf -- "$work"' EXIT HUP INT TERM
stage="$work/payload"
mkdir -p "$stage/www/desktop" "$stage/licenses"
if [ ! -s "$tools_dir/webview2.nupkg" ]; then
  curl -fLsS --retry 2 https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.2903.40/microsoft.web.webview2.1.0.2903.40.nupkg -o "$tools_dir/webview2.nupkg"
fi
if [ ! -s "$tools_dir/json.hpp" ]; then
  curl -fLsS --retry 2 https://raw.githubusercontent.com/nlohmann/json/v3.11.3/single_include/nlohmann/json.hpp -o "$tools_dir/json.hpp"
fi
if [ ! -s "$tools_dir/MicrosoftEdgeWebview2Setup.exe" ]; then
  curl -fLsS --retry 2 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -o "$tools_dir/MicrosoftEdgeWebview2Setup.exe"
fi
python3 - "$tools_dir" <<'PY'
import hashlib, pathlib, sys
base=pathlib.Path(sys.argv[1])
for name,expected in [('webview2.nupkg','ef128016dd1e51c59178c827ed5b8aa3322c57afa8675d930f8109505542ad74'),('json.hpp','9bea4c8066ef4a1c206b2be5a36302f8926f7fdc6087af5d20b417d0cf103ea6')]:
    if hashlib.sha256((base/name).read_bytes()).hexdigest()!=expected:
        raise SystemExit('Unexpected dependency digest: '+name)
if (base/'MicrosoftEdgeWebview2Setup.exe').read_bytes()[:2] != b'MZ':
    raise SystemExit('WebView2 bootstrapper must be a Windows executable')
PY
unzip -qo "$tools_dir/webview2.nupkg" -d "$work/webview2"
sdk="$work/webview2/build/native"
obj=${PS_SCROLL_OBJ:-}
if [ -z "$obj" ]; then obj=$("$repo/desktop/scripts/build-core.sh" windows-x64); fi
cd "$src"
x86_64-w64-mingw32-windres --codepage=65001 app.rc -O coff -o "$work/app.o"
x86_64-w64-mingw32-g++ -std=c++17 -Os -static -s -municode -mwindows -I"$tools_dir" -I"$sdk/include" \
  host.cpp "$obj" "$work/app.o" -o "$stage/CiXia.exe" -ldwmapi -lgdiplus -lgdi32 -lole32 -lshell32 -lcomdlg32 -lcomctl32 -lcrypt32 -luuid -luser32
cp "$sdk/x64/WebView2Loader.dll" "$stage/"
cp "$work/webview2/LICENSE.txt" "$stage/licenses/WebView2-LICENSE.txt"
cp "$work/webview2/NOTICE.txt" "$stage/licenses/WebView2-NOTICE.txt"
cp "$src/JSON-LICENSE.txt" "$stage/licenses/nlohmann-json-LICENSE.txt"
cp "$repo/index.html" "$stage/www/"
cp -R "$repo/prototype" "$stage/www/"
cp -R "$repo/desktop/ui" "$stage/www/desktop/"
find "$stage" -name .DS_Store -delete
makensis -V2 "-DOUTPUT=$out/CiXia-1.2.0-Windows-x64-Setup.exe" "-DICONFILE=$src/CiXia.ico" \
  "-DBOOTSTRAP=$tools_dir/MicrosoftEdgeWebview2Setup.exe" "-DSTAGE=$stage" "$src/installer.nsi"
if [ -n "${PS_WINDOWS_STAGE:-}" ]; then mkdir -p "$PS_WINDOWS_STAGE"; cp -R "$stage/." "$PS_WINDOWS_STAGE/"; fi
echo "$out/CiXia-1.2.0-Windows-x64-Setup.exe"
