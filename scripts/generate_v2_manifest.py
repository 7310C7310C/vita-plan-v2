#!/usr/bin/env python3
"""Build the downloadable score bundle and its manifest.

The browser prefetches one file (data/scores/bundle.json) instead of every
score JSON.  Source scores remain in data/scores/<code>/<num>.json in the
readable runtime schema; this script packs them with scripts/score_pack.py.

Usage:
  python3 scripts/generate_v2_manifest.py          # write generated files
  python3 scripts/generate_v2_manifest.py --check  # fail if they are stale
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score_pack  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SCORES = DATA / "scores"
BUNDLE = SCORES / "bundle.json"
MANIFEST = DATA / "v2-manifest.json"
MAPPING = DATA / "v2-scores.json"
BUNDLE_FORMAT = "vp2-pack/1"


def score_files() -> list[Path]:
    return [p for p in sorted(SCORES.rglob("*.json")) if p != BUNDLE]


def build_bundle() -> dict:
    scores = {}
    for path in score_files():
        rel = path.relative_to(ROOT).as_posix()
        score = json.loads(path.read_text(encoding="utf-8"))
        packed = score_pack.encode(score)
        if packed.get("credits") and "credit" in packed:
            packed.pop("credit")
        scores[rel] = packed
    return {"format": BUNDLE_FORMAT, "scores": scores}


def render_bundle(bundle: dict) -> bytes:
    return (json.dumps(bundle, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


def render_manifest(bundle_bytes: bytes) -> bytes:
    digest = hashlib.sha256(bundle_bytes).hexdigest()
    manifest = {
        "version": digest[:16],
        "files": [{
            "path": "data/scores/bundle.json",
            "hash": digest,
            "size": len(bundle_bytes),
        }],
    }
    return (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def render_scores_js() -> bytes:
    data = json.loads(MAPPING.read_text(encoding="utf-8"))
    return (
        "/* AUTO-GENERATED from data/v2-scores.json by scripts/generate_v2_manifest.py. Do not edit. */\n"
        + "window.VP2_DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"
    ).encode("utf-8")


def main() -> int:
    check = "--check" in sys.argv[1:]
    unknown = [a for a in sys.argv[1:] if a != "--check"]
    if unknown:
        print(f"usage: {Path(sys.argv[0]).name} [--check]", file=sys.stderr)
        return 2

    bundle = build_bundle()
    bundle_bytes = render_bundle(bundle)
    manifest_bytes = render_manifest(bundle_bytes)
    scores_js_bytes = render_scores_js()

    outputs = (
        (BUNDLE, bundle_bytes),
        (MANIFEST, manifest_bytes),
        (DATA / "v2-scores.js", scores_js_bytes),
    )
    if check:
        stale = []
        for path, expected in outputs:
            if not path.exists() or path.read_bytes() != expected:
                stale.append(path.relative_to(ROOT).as_posix())
        if stale:
            print("FAIL: generated score files are stale: " + ", ".join(stale), file=sys.stderr)
            print("run python3 scripts/generate_v2_manifest.py", file=sys.stderr)
            return 1
        print(f"OK: bundle {len(bundle_bytes)} B, version {hashlib.sha256(bundle_bytes).hexdigest()[:16]}")
        return 0

    for path, content in outputs:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    digest = hashlib.sha256(bundle_bytes).hexdigest()
    print(
        f"wrote {BUNDLE.relative_to(ROOT)} {len(bundle_bytes)} B, "
        f"version {digest[:16]}, {len(bundle['scores'])} scores"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
