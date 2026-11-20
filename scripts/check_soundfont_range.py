#!/usr/bin/env python3
"""Fail if any playable score uses MIDI pitches outside the trimmed range.

The soundfonts in /soundfonts are trimmed to MIDI 36-84 (C2-C6) to cut the
download size.  smplr can still play a note outside that range by using the
nearest kept sample, but then the timbre is pitch-shifted; if a score really
needs exact samples at the extremes, widen the trimming range and regenerate
the files (and bump the ?v= query).
"""
import glob
import json
import sys

LO, HI = 36, 84
lo, hi = 999, -1
bad = []

for path in sorted(glob.glob("data/scores/**/*.json", recursive=True)):
    if path.endswith("/bundle.json"):
        continue
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    for bar in data.get("bars", []):
        for events in bar.get("V", {}).values():
            for ev in events:
                if len(ev) < 3:
                    continue
                pitch = ev[2]
                lo = min(lo, pitch)
                hi = max(hi, pitch)
                if pitch < LO or pitch > HI:
                    bad.append((path, pitch))

if bad:
    print(f"FAIL: soundfonts are trimmed to MIDI {LO}-{HI}, but found:")
    for path, pitch in bad[:20]:
        print(f"  {path}: MIDI {pitch}")
    print("Widen the trim range in the soundfont build and regenerate the files.")
    sys.exit(1)

print(f"OK: score pitch range {lo}-{hi} is inside trimmed soundfont range {LO}-{HI}")
