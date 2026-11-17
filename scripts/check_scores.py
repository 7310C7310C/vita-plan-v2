#!/usr/bin/env python3
"""Validate score JSON, mappings, manifest, and asset references.

Run before every commit/deploy. Exit code 1 on any error.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SCORES = DATA / "scores"
errors: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def load(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        err(f"{path.relative_to(ROOT)}: JSON parse error: {e}")
        return None


def is_num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def check_event(where: str, ev, beats: float, lyric_len: int) -> None:
    if not isinstance(ev, list) or len(ev) < 4:
        err(f"{where}: event must be [beat,dur,midi,syl] (got {ev!r})")
        return
    beat, dur, midi, syl = ev[:4]
    if not is_num(beat) or not is_num(dur) or not is_num(midi):
        err(f"{where}: beat/dur/midi must be numbers (got {ev!r})")
        return
    if beat < -1e-6 or dur <= 0 or beat + dur > beats + 1e-6:
        err(f"{where}: event out of bar: beat={beat} dur={dur} beats={beats}")
    if not (0 <= midi <= 127):
        err(f"{where}: midi out of range: {midi}")
    if syl is not None:
        if not isinstance(syl, int) or isinstance(syl, bool) or not (0 <= syl < lyric_len):
            err(f"{where}: bad syllable index {syl!r} (lyrics[0] len={lyric_len})")
    if len(ev) > 5 and ev[5] not in (None, "nodot"):
        err(f"{where}: event[5] must be null or 'nodot' (got {ev[5]!r})")


def check_score(path: Path, score: dict, ids: set[str]) -> None:
    rel = path.relative_to(ROOT)
    if not isinstance(score, dict):
        err(f"{rel}: root must be an object"); return
    for key in ("id", "title", "key", "keyBase", "meter", "tempo", "bars", "lyrics"):
        if key not in score:
            err(f"{rel}: missing {key}")
    sid = score.get("id")
    if not isinstance(sid, str) or not sid:
        err(f"{rel}: id must be non-empty string")
    elif sid in ids:
        err(f"{rel}: duplicate id {sid}")
    else:
        ids.add(sid)
    if not isinstance(score.get("title"), str) or not score.get("title"):
        err(f"{rel}: title empty")
    if not is_num(score.get("keyBase")) or not (0 <= score["keyBase"] <= 127):
        err(f"{rel}: keyBase invalid")
    if not is_num(score.get("tempo")) or not (20 <= score["tempo"] <= 400):
        err(f"{rel}: tempo invalid")
    meter = str(score.get("meter") or "")
    if not re.fullmatch(r"\d+/\d+", meter):
        err(f"{rel}: meter invalid: {meter!r}")

    lyrics = score.get("lyrics")
    if not isinstance(lyrics, list) or not lyrics or not all(isinstance(r, list) for r in lyrics):
        err(f"{rel}: lyrics must be non-empty list of lists"); lyrics = [[]]
    lyric_len = len(lyrics[0])
    for i, row in enumerate(lyrics):
        if len(row) != lyric_len:
            err(f"{rel}: lyrics[{i}] length {len(row)} != {lyric_len}")
        for j, t in enumerate(row):
            if not isinstance(t, str):
                err(f"{rel}: lyrics[{i}][{j}] not string")

    collapse = score.get("lyricCollapse", False)
    if "lyricCollapse" in score and not isinstance(collapse, bool):
        err(f"{rel}: lyricCollapse must be boolean")
        collapse = False
    if collapse:
        if len(lyrics) < 2:
            err(f"{rel}: lyricCollapse=true but only {len(lyrics)} lyric row")
        else:
            base = lyrics[0]
            if all(all((row[i] if i < len(row) else "") == (base[i] if i < len(base) else "")
                       for i in range(lyric_len)) for row in lyrics[1:]):
                err(f"{rel}: lyricCollapse=true but all verses are identical")

    voices = score.get("voices")
    if voices is None:
        voices = ["S", "A", "T", "B"]
    if not isinstance(voices, list) or not voices or any(v not in ("S", "A", "T", "B") for v in voices):
        err(f"{rel}: voices must be subset of S,A,T,B")
        voices = ["S", "A", "T", "B"]

    bars = score.get("bars")
    if not isinstance(bars, list) or not bars:
        err(f"{rel}: bars empty"); return
    for bi, bar in enumerate(bars):
        where = f"{rel} bar {bi+1}"
        if not isinstance(bar, dict):
            err(f"{where}: bar not object"); continue
        beats = bar.get("beats")
        if not is_num(beats) or beats <= 0:
            err(f"{where}: bad beats {beats!r}"); continue
        if "meter" in bar and not re.fullmatch(r"\d+/\d+", str(bar["meter"])):
            err(f"{where}: bad bar.meter {bar['meter']!r}")
        if "hum" in bar and not isinstance(bar["hum"], str):
            err(f"{where}: hum must be a string")
        chords = bar.get("chords", [])
        if not isinstance(chords, list):
            err(f"{where}: chords not list"); chords = []
        for c in chords:
            if not isinstance(c, list) or len(c) != 2 or not is_num(c[0]) or not isinstance(c[1], str) or not c[1]:
                err(f"{where}: bad chord {c!r}")
            elif not (-1e-6 <= c[0] < beats + 1e-6):
                err(f"{where}: chord beat out of bar: {c!r}")
        V = bar.get("V")
        if not isinstance(V, dict):
            err(f"{where}: V not object"); continue
        for v in V:
            if v not in ("S", "A", "T", "B"):
                err(f"{where}: unknown voice {v}")
            elif v not in voices:
                err(f"{where}: voice {v} has events but not in voices={voices}")
        for v in voices:
            evs = V.get(v, [])
            if not isinstance(evs, list):
                err(f"{where}/{v}: events not list"); continue
            last = -1.0
            for ei, ev in enumerate(evs):
                check_event(f"{where}/{v}[{ei}]", ev, beats, lyric_len)
                if isinstance(ev, list) and is_num(ev[0]):
                    if ev[0] < last - 1e-6:
                        err(f"{where}/{v}: events not sorted at {ei}")
                    last = ev[0]

    # slurs / ties
    slurs = score.get("slurs", [])
    if not isinstance(slurs, list):
        err(f"{rel}: slurs not list"); slurs = []
    for s in slurs:
        if not isinstance(s, list) or len(s) not in (4, 6):
            err(f"{rel}: bad slur {s!r}"); continue
        if len(s) == 4:
            b, v, a, z = s
            b2, v2 = b, v
        else:
            b, v, a, b2, v2, z = s
        if not (isinstance(b, int) and 0 <= b < len(bars) and v in voices and isinstance(a, int)):
            err(f"{rel}: slur start invalid {s!r}"); continue
        if not (isinstance(b2, int) and 0 <= b2 < len(bars) and v2 in voices and isinstance(z, int)):
            err(f"{rel}: slur end invalid {s!r}"); continue
        evs1 = bars[b].get("V", {}).get(v, [])
        evs2 = bars[b2].get("V", {}).get(v2, [])
        if not (0 <= a < len(evs1) and 0 <= z < len(evs2)):
            err(f"{rel}: slur indices out of range {s!r}")
    ties = score.get("ties", [])
    if not isinstance(ties, list):
        err(f"{rel}: ties not list"); ties = []
    for pair in ties:
        if not isinstance(pair, list) or len(pair) != 2 or any(not isinstance(x, list) or len(x) != 3 for x in pair):
            err(f"{rel}: bad tie {pair!r}"); continue
        notes = []
        for b, v, i in pair:
            if not (isinstance(b, int) and 0 <= b < len(bars) and v in voices and isinstance(i, int)):
                err(f"{rel}: tie target invalid {pair!r}"); notes = []; break
            evs = bars[b].get("V", {}).get(v, [])
            if not (0 <= i < len(evs)):
                err(f"{rel}: tie index out of range {pair!r}"); notes = []; break
            notes.append(evs[i][2])
        if len(notes) == 2 and notes[0] != notes[1]:
            err(f"{rel}: tie pitches differ {pair!r} ({notes})")

    repeat = score.get("repeat")
    if repeat is not None:
        if not isinstance(repeat, dict) or not isinstance(repeat.get("from"), int) or not isinstance(repeat.get("to"), int):
            err(f"{rel}: repeat must be null or {{from:int,to:int}} (got {repeat!r})")
        elif not (0 <= repeat["from"] <= repeat["to"] < len(bars)):
            err(f"{rel}: repeat from/to invalid: {repeat!r} (bars={len(bars)})")

    dc = score.get("dc")
    if dc is not None:
        if not isinstance(dc, dict) or not isinstance(dc.get("from"), int) or not isinstance(dc.get("to"), int):
            err(f"{rel}: dc must be {{from:int,to:int}} (got {dc!r})")
        elif not (0 <= dc["to"] < dc["from"] < len(bars)):
            err(f"{rel}: dc from/to invalid: {dc!r} (bars={len(bars)})")
        elif dc["from"] != len(bars) - 1:
            err(f"{rel}: D.C. al Fine must start from the last bar (dc.from={dc['from']}, last={len(bars)-1})")

    phrases = score.get("phrases", [])
    if not isinstance(phrases, list) or not phrases:
        err(f"{rel}: phrases empty")
    else:
        seen = []
        for g in phrases:
            if not isinstance(g, list) or not g:
                err(f"{rel}: bad phrase {g!r}"); continue
            for b in g:
                if not isinstance(b, int) or not (0 <= b < len(bars)):
                    err(f"{rel}: phrase bar out of range {g!r}")
                else:
                    seen.append(b)
        if sorted(seen) != list(range(len(bars))):
            err(f"{rel}: phrases do not cover every bar exactly once")


def main() -> int:
    mapping_path = DATA / "v2-scores.json"
    mapping = load(mapping_path)
    if not isinstance(mapping, dict):
        err("data/v2-scores.json: invalid"); mapping = {}
    codes = mapping.get("codes", {})
    entries = mapping.get("scores", {})
    if not isinstance(codes, dict) or not isinstance(entries, dict):
        err("data/v2-scores.json: codes/scores must be objects"); codes, entries = {}, {}
    if len(set(codes.values())) != len(codes):
        err("data/v2-scores.json: duplicate category code")
    ids: set[str] = set()
    for path in sorted(SCORES.rglob("*.json")):
        score = load(path)
        if score is not None:
            check_score(path, score, ids)
    for key, ent in entries.items():
        if not isinstance(ent, dict) or "file" not in ent:
            err(f"data/v2-scores.json: bad entry {key!r}"); continue
        code, _, num = key.partition("/")
        if code not in codes.values():
            err(f"data/v2-scores.json: unknown code in {key!r}")
        f = ROOT / ent["file"]
        if not f.exists():
            err(f"data/v2-scores.json: missing file {ent['file']} for {key}")
        else:
            s = load(f)
            if isinstance(s, dict) and s.get("id") and s["id"] not in ids:
                err(f"data/v2-scores.json: {key} points to score id {s['id']} not scanned")
    for path in sorted(SCORES.rglob("*.json")):
        rel = path.relative_to(ROOT).as_posix()
        if not any(ent.get("file") == rel for ent in entries.values() if isinstance(ent, dict)):
            err(f"{rel}: score file not referenced by data/v2-scores.json")

    # manifest hashes/version must match the generator
    manifest = load(DATA / "v2-manifest.json")
    files = []
    for path in sorted(SCORES.rglob("*.json")):
        rel = path.relative_to(ROOT).as_posix()
        h = hashlib.sha256(path.read_bytes()).hexdigest()
        files.append({"path": rel, "hash": h, "size": path.stat().st_size})
    expect_version = hashlib.sha256(
        "".join(f"{f['path']}\t{f['hash']}\t{f['size']}\n" for f in files).encode()
    ).hexdigest()[:16]
    if not isinstance(manifest, dict):
        err("data/v2-manifest.json: invalid")
    else:
        if manifest.get("files") != files:
            err("data/v2-manifest.json: hashes/sizes stale (run scripts/generate_v2_manifest.py)")
        if manifest.get("version") != expect_version:
            err(f"data/v2-manifest.json: version {manifest.get('version')} != {expect_version}")

    # agent/OMR instructions must stay in place
    for name in ("AGENTS.md", "CLAUDE.md", "docs/omr-checklist.md"):
        if not (ROOT / name).exists():
            err(f"missing required instructions: {name}")
    if (ROOT / "AGENTS.md").exists() and "lodebar2026/dolce" not in (ROOT / "AGENTS.md").read_text(encoding="utf-8"):
        err("AGENTS.md must name lodebar2026/dolce as the OMR tool")
    if (ROOT / "CLAUDE.md").exists() and "AGENTS.md" not in (ROOT / "CLAUDE.md").read_text(encoding="utf-8"):
        err("CLAUDE.md must point to AGENTS.md")

    # static shell invariants
    idx = ROOT / "index.html"
    copy = ROOT / "404.html"
    if idx.read_bytes() != copy.read_bytes():
        err("index.html and 404.html differ (copy index.html to 404.html)")
    idx_text = idx.read_text(encoding="utf-8")
    refs = re.findall(r'(?:href|src)="(assets/[^"]+|data/[^"]+)"', idx_text)
    for ref in refs:
        p = ref.split("?", 1)[0]
        if not (ROOT / p).exists():
            err(f"index.html: referenced file missing: {ref}")
    sw = (ROOT / "sw-v2.js").read_text(encoding="utf-8")
    if "staleWhileRevalidateJson(req, event)" not in sw or "/data/scores/" not in sw:
        err("sw-v2.js: score JSON must use staleWhileRevalidateJson (instant cached open + background update)")
    if "networkFirstShell(req)" not in sw:
        err("sw-v2.js: shell assets must use networkFirstShell (stale UI bug)")
    shell_block = re.search(r"const SHELL = \[(.*?)\];", sw, re.S)
    if not shell_block:
        err("sw-v2.js: SHELL array not found")
    else:
        for ref in re.findall(r"'([^']+)'", shell_block.group(1)):
            p = ref.split("?", 1)[0]
            if not (ROOT / p).exists():
                err(f"sw-v2.js: SHELL file missing: {ref}")
    # versioned assets referenced by index should match SW shell
    for ref in refs:
        if "?" not in ref:
            continue
        name, q = ref.split("?", 1)
        if not name.startswith("assets/") and not name.startswith("data/"):
            continue
        if name == "data/songs.json":
            continue
        if f"'{ref}'" not in sw:
            err(f"sw-v2.js: SHELL does not reference current {ref}")

    if errors:
        print("FAIL: score/asset validation")
        for e in errors:
            print(" -", e)
        return 1
    print(f"OK: {len(list(SCORES.rglob('*.json')))} scores, {len(entries)} mappings, manifest {expect_version}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
