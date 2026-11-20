#!/usr/bin/env python3
"""Encode a v2 score JSON into the compact form used by the download bundle.

The source files in data/scores/ stay in the readable runtime schema.  This
module only runs at build time (scripts/generate_v2_manifest.py); the browser
decodes the result with assets/js/score-format.js.

Compact rules (see docs/omr-checklist.md):
  bar  := ["@meter 3/4", "@beats 3", "@endbar thinThick", "@hum 呜",
           "Eb@0 Bb7@2", "^3.3@2", "S 2:67 1:65 1:63", ...]
  note := DUR:MIDI[:SYL] with optional suffix * (triplet) and ! (nodot)
          SYL: omitted = next syllable, _ = repeat, - = none, :N = explicit
  slurs/ties keep the runtime [bar, voice, event, ...] arrays (machine-only bundle).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

VOICES = ("S", "A", "T", "B")


def fmt_num(x: float) -> str:
    if float(x).is_integer():
        return str(int(x))
    return ("%.6f" % x).rstrip("0").rstrip(".")


def is_compound(meter: str) -> bool:
    num, den = (int(x) for x in meter.split("/"))
    return den == 8 and num > 3 and num % 3 == 0


def bar_beats(meter: str, compound: bool) -> float:
    num, den = (int(x) for x in meter.split("/"))
    # Internal beats are quarter notes for simple meters, eighth notes for
    # compound 6/8, 9/8, 12/8 (matching bar.beats in the runtime scores).
    return num * (8 if compound else 4) / den


def encode(score: dict) -> dict:
    meter0 = str(score["meter"])
    compound = bool(score.get("compound", is_compound(meter0)))

    out: dict = {}
    for key in ("id", "title", "original", "credits", "key", "keyBase", "meter", "tempo"):
        if key in score:
            out[key] = score[key]
    if score.get("credit") and not score.get("credits"):
        out["credit"] = score["credit"]
    if score.get("voices"):
        out["voices"] = score["voices"]
    if compound != is_compound(meter0):
        out["compound"] = compound
    tempo_label = ("♪=" if compound else "♩=") + str(score.get("tempo", ""))
    if score.get("tempoLabel") and score["tempoLabel"] != tempo_label:
        out["tempoLabel"] = score["tempoLabel"]
    if score.get("clickStep") not in (None, 1):
        out["clickStep"] = score["clickStep"]
    for key in ("voiceOct", "markMode", "lyricCollapse", "versionCode", "versionLabel"):
        if score.get(key):
            out[key] = score[key]
    if "capo" in score:
        out["capo"] = score["capo"]

    lyric_voices = [
        v for v in VOICES
        if any(ev[3] is not None for bar in score["bars"] for ev in bar.get("V", {}).get(v, []))
    ]
    if lyric_voices and lyric_voices != ["S"]:
        out["lyricVoices"] = "".join(lyric_voices)

    phrases = score.get("phrases") or []
    if phrases and all(g == list(range(g[0], g[0] + len(g))) for g in phrases):
        out["lines"] = [len(g) for g in phrases]
    elif phrases:
        out["phrases"] = phrases

    out["lyrics"] = [" ".join(t if t else "·" for t in row) for row in score["lyrics"]]

    bars_out = []
    last_syl = {v: -1 for v in VOICES}
    prev_meter = None
    for bi, bar in enumerate(score["bars"]):
        bm = str(bar.get("meter", prev_meter or meter0))
        lines: list[str] = []
        if "meter" in bar:
            lines.append(f"@{bm}")
        beats = float(bar["beats"])
        if abs(beats - bar_beats(bm, compound)) > 1e-9:
            lines.append(f"@beats {fmt_num(beats)}")
        if bar.get("endbar"):
            lines.append(f"@endbar {bar['endbar']}")
        if "hum" in bar:
            lines.append(f"@hum {bar['hum']}")
        if bar.get("tag"):
            lines.append(f"@tag {bar['tag']}")
        if bar.get("chords"):
            lines.append(" ".join(f"{name}@{fmt_num(beat)}" for beat, name in bar["chords"]))
        if bar.get("marks"):
            lines.append(" ".join(f"^{name}@{fmt_num(beat)}" for beat, name in bar["marks"]))

        for voice in VOICES:
            events = bar.get("V", {}).get(voice) or []
            if not events:
                continue
            tokens: list[str] = []
            cur = 0.0
            for ev in events:
                beat, dur, midi, syl = ev[:4]
                rest = beat - cur
                if rest > 1e-4:
                    tokens.append("r" + fmt_num(round(rest, 6)))
                elif rest < -1e-4:
                    raise ValueError(f"bar {bi + 1}/{voice}: overlapping event at beat {beat}")
                token = f"{fmt_num(dur)}:{int(midi)}"
                if voice in lyric_voices:
                    if syl is None:
                        token += "-"
                    elif syl == last_syl[voice]:
                        token += "_"
                    elif syl == last_syl[voice] + 1:
                        pass
                    else:
                        token += f":{syl}"
                    if syl is not None:
                        last_syl[voice] = int(syl)
                elif syl is not None:
                    token += f":{syl}"
                    last_syl[voice] = int(syl)
                if len(ev) > 4 and ev[4] == 3:
                    token += "*"
                if len(ev) > 5 and ev[5] == "nodot":
                    token += "!"
                tokens.append(token)
                cur = beat + dur
            lines.append(f"{voice} " + " ".join(tokens))
        bars_out.append(lines)
        prev_meter = bm
    out["bars"] = bars_out

    if score.get("slurs"):
        out["slurs"] = score["slurs"]
    if score.get("ties"):
        out["ties"] = score["ties"]

    if score.get("repeat"):
        out["repeat"] = [score["repeat"]["from"], score["repeat"]["to"]]
    if score.get("dc"):
        out["dc"] = [score["dc"]["from"], score["dc"]["to"]]
    return out


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: score_pack.py <score.json>", file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    score = json.loads(path.read_text(encoding="utf-8"))
    print(json.dumps(encode(score), ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
