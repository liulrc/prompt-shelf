#!/usr/bin/env python3
"""Build the public update.json asset from the two final release installers."""
import argparse
import hashlib
import json
import re
from pathlib import Path


def from_files(version, directory, notes):
    tag = f"v{version}"
    assets = []
    for name in (f"PromptShelf-{version}-macOS-universal.dmg", f"CiXia-{version}-Windows-x64-Setup.exe"):
        path = directory / name
        digest = hashlib.sha256()
        with path.open("rb") as data:
            for block in iter(lambda: data.read(1024 * 1024), b""):
                digest.update(block)
        assets.append({
            "name": name,
            "browser_download_url": f"https://github.com/liulrc/prompt-shelf/releases/download/{tag}/{name}",
            "size": path.stat().st_size,
            "digest": f"sha256:{digest.hexdigest()}",
        })
    return {"tag_name": tag, "draft": False, "prerelease": False, "body": notes, "assets": assets}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="为词匣正式发布生成更新目录，写入标准输出。")
    parser.add_argument("version")
    parser.add_argument("installer_directory", type=Path)
    parser.add_argument("release_notes", type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", args.version):
        parser.error("仅支持正式版的三段数字版本号")
    print(json.dumps(from_files(args.version, args.installer_directory,
                                args.release_notes.read_text(encoding="utf-8").strip()),
                     ensure_ascii=False, indent=2))
