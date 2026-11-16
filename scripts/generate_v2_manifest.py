#!/usr/bin/env python3
"""Generate data/v2-manifest.json for the v2 JSON-score background cache.

Scans data/scores/**/*.json, hashes each file, and writes a small manifest.
The client compares `version`; if it changed it prefetches the listed files
into the `v2-json-v1` Cache API bucket.  It never blocks the UI.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCORES = ROOT / "data" / "scores"
OUT = ROOT / "data" / "v2-manifest.json"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    files = []
    for path in sorted(SCORES.rglob("*.json")):
        rel = path.relative_to(ROOT).as_posix()
        files.append({
            "path": rel,
            "hash": sha256(path),
            "size": path.stat().st_size,
        })
    version = hashlib.sha256(
        "".join(f"{f['path']}\t{f['hash']}\t{f['size']}\n" for f in files).encode("utf-8")
    ).hexdigest()[:16]
    out = {"version": version, "files": files}
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # Runtime mapping as a tiny JS file so the app never needs a sync XHR.
    scores_path = ROOT / "data" / "v2-scores.json"
    if scores_path.exists():
        data = json.loads(scores_path.read_text(encoding="utf-8"))
        (ROOT / "data" / "v2-scores.js").write_text(
            "window.VP2_DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n",
            encoding="utf-8",
        )
    print(f"wrote {OUT.relative_to(ROOT)} version={version} files={len(files)}")


if __name__ == "__main__":
    main()
