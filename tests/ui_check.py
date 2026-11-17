#!/usr/bin/env python3
"""Browser invariants that static JSON checks cannot catch.

Usage: python3 tests/ui_check.py http://127.0.0.1:8080/
Requires playwright (pip install playwright && playwright install chromium).
"""
from __future__ import annotations

import sys
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080/").rstrip("/") + "/"
errors: list[str] = []


def norm(s: str) -> str:
    return " ".join((s or "").split())


def fail(msg: str) -> None:
    errors.append(msg)


def open_score(browser, path: str):
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
    page = ctx.new_page()
    errs: list[str] = []
    page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    # Local SPA fallback may produce preload 404s for /cl/assets before <base> applies;
    # real JS errors still surface via pageerror. Ignore resource 404 noise here.
    page.on("console", lambda m: errs.append("console: " + m.text + " @ " + ((m.location or {}).get("url") or "?")) if (m.type == "error" and "Failed to load resource" not in m.text) else None)
    page.goto(BASE + path, wait_until="load", timeout=60000)
    page.wait_for_timeout(3200)
    frame = page.frame_locator("#v2Frame")
    return ctx, page, frame, errs


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])

        # single-voice cl001
        ctx, page, frame, errs = open_score(browser, "cl/001")
        if frame.locator("#score .g-voice").count() != 0:
            fail("cl001: single-voice score still shows S/A/T/B gutter label")
        if frame.locator(".slur-layer path").count() < 1:
            fail("cl001: slur layer missing (expected >=1)")
        b7 = norm(frame.locator('.bar[data-bar="6"] .lrow').first.inner_text())
        b8 = norm(frame.locator('.bar[data-bar="7"] .lrow').first.inner_text())
        if b7 != "你 垂":
            fail(f"cl001 bar7 lyrics: {b7!r} != '你 垂'")
        if b8 != "怜":
            fail(f"cl001 bar8 lyrics: {b8!r} != '怜'")
        chords = frame.locator("body").evaluate("""() => {
          const out = {};
          [6,7].forEach(i=>{
            const bar = document.querySelector('.bar[data-bar="'+i+'"]');
            const cs = [...bar.querySelectorAll('.chordrow span')].filter(s=>s.textContent.trim());
            const ts = [...bar.querySelectorAll('.tail')].map(t=>t.getBoundingClientRect().x + t.getBoundingClientRect().width/2);
            out[i] = cs.map(s=>{
              const r=document.createRange(); r.selectNodeContents(s);
              const tr=r.getBoundingClientRect();
              return {name:s.textContent, c:(tr.left+tr.right)/2, tails:ts};
            });
          });
          return out;
        }""")
        for i, name in ((6,'A'), (7,'D')):
            hit = next((x for x in chords[str(i)] if x['name']==name), None)
            if not hit:
                fail(f"cl001 bar{i+1}: {name} chord missing"); continue
            if not any(abs(hit['c']-t) <= 1.5 for t in hit['tails']):
                fail(f"cl001 bar{i+1}: {name} chord center {hit['c']} not aligned to tail {hit['tails']}")
        page.click("#v2MenuBtn")
        page.wait_for_timeout(250)
        display = page.evaluate("""() => {
          const el = document.querySelector('#v2Menu [data-part]');
          const row = el && el.closest('.v2-row');
          return row ? getComputedStyle(row).display : 'missing';
        }""")
        if display != "none":
            fail(f"cl001: single-voice menu 声部 row display={display!r}, expected none")
        page.click("#v2MenuClose")
        if errs:
            fail("cl001 page errors: " + " | ".join(errs[:4]))
        ctx.close()

        # single-voice cl002 + slurs
        ctx, page, frame, errs = open_score(browser, "cl/002")
        if frame.locator("#score .g-voice").count() != 0:
            fail("cl002: single-voice score still shows gutter label")
        n = frame.locator(".slur-layer path").count()
        if n < 20:
            fail(f"cl002: slur paths {n} < 20")
        lab = frame.locator(".line").first.locator(".gutter .g-lyr").inner_text().strip()
        if lab:
            fail(f"cl002 single verse must not carry a verse number, got {lab!r}")
        if errs:
            fail("cl002 page errors: " + " | ".join(errs[:4]))
        ctx.close()

        # accidental and sustain-dash alignment
        ctx, page, frame, errs = open_score(browser, "lz/020")
        acc = frame.locator("body").evaluate("""() => {
          const a = document.querySelector('.acc'); if (!a) return null;
          const n = a.closest('.num'); const ar = a.getBoundingClientRect(), nr = n.getBoundingClientRect();
          return {pos:getComputedStyle(a).position, right:ar.right, left:nr.left};
        }""")
        if not acc:
            fail("lz020: no accidental found for alignment check")
        elif acc["pos"] != "absolute" or acc["right"] > acc["left"] + 1.5:
            fail(f"lz020: accidental not absolute/left of digit: {acc}")
        if errs:
            fail("lz020 page errors: " + " | ".join(errs[:4]))
        ctx.close()

        # jt/017: verses share the opening text; print one row until they diverge (bar 17)
        ctx, page, frame, errs = open_score(browser, "jt/017")
        for i in range(0, 15):
            n = frame.locator(f'.bar[data-bar="{i}"] .lrow').count()
            if n != 1:
                fail(f"jt017 bar{i+1}: {n} lyric rows, expected 1 (shared opening)")
                break
        for i in range(16, 32):
            n = frame.locator(f'.bar[data-bar="{i}"] .lrow').count()
            if n != 3:
                fail(f"jt017 bar{i+1}: {n} lyric rows, expected 3 after divergence")
                break
        g = frame.locator(".line").first.locator(".gutter .g-lyr").count()
        if g != 1:
            fail(f"jt017 first line gutter lyric labels {g}, expected 1")
        first_label = frame.locator(".line").first.locator(".gutter .g-lyr").inner_text().strip()
        if first_label:
            fail(f"jt017 shared main verse must not carry a verse number, got {first_label!r}")
        split_labels = frame.locator("body").evaluate("""() => {
          const line = [...document.querySelectorAll('.line')].find(l=>l.querySelector('.bar[data-bar="16"]'));
          return line ? [...line.querySelectorAll('.gutter .g-lyr')].map(x=>x.textContent.trim()) : null;
        }""")
        if split_labels != ["1.", "2.", "3."]:
            fail(f"jt017 verse labels after divergence {split_labels!r}, expected ['1.','2.','3.']")
        dc = frame.locator('.bar[data-bar="31"] .dc-mark').inner_text()
        fine = frame.locator('.bar[data-bar="15"] .dc-mark').inner_text()
        if dc != "D.C. al Fine":
            fail(f"jt017 last bar mark {dc!r}, expected 'D.C. al Fine'")
        if fine != "Fine":
            fail(f"jt017 bar16 mark {fine!r}, expected 'Fine'")
        head_dc = frame.locator(".score-head .dc-tag").count()
        if head_dc != 0:
            fail(f"jt017: D.C. mark leaked into score head ({head_dc})")
        if errs:
            fail("jt017 page errors: " + " | ".join(errs[:4]))

        tail = frame.locator("body").evaluate("""() => {
          const bar = document.querySelector('.bar[data-bar="2"]');
          const t = bar.querySelector('.vrow[data-vrow="T"] .cell:last-child .num');
          const b = bar.querySelector('.vrow[data-vrow="B"] .tail');
          if (!t || !b) return null;
          const tr = t.getBoundingClientRect(), br = b.getBoundingClientRect();
          const cs = getComputedStyle(b, '::before');
          return {tc:tr.x+tr.width/2, bc:br.x+br.width/2, pos:cs.position, left:cs.left, transform:cs.transform, bw:br.width};
        }""")
        if not tail:
            fail("jt017 bar3: missing T note or B tail")
        else:
            if abs(tail["tc"] - tail["bc"]) > 1.5:
                fail(f"jt017 bar3: T/B tail center off by {tail['tc']-tail['bc']:.1f}px")
            if tail["pos"] != "absolute" or tail["transform"] == "none":
                fail(f"jt017 bar3: tail pseudo not absolutely centered: {tail}")
            elif abs(float(tail["left"].replace("px", "")) - tail["bw"] / 2) > 1.2:
                fail(f"jt017 bar3: tail pseudo left not half box: {tail}")
        if errs:
            fail("jt017 page errors: " + " | ".join(errs[:4]))
        ctx.close()

        # every score: last bar = final double barline; repeat dots only when a repeat ends there;
        # single-voice (one staff) must not draw the system bracket line in the gutter
        import json as _json
        import urllib.request as _url

        def _get_json(rel):
            with _url.urlopen(BASE + rel, timeout=20) as r:
                return _json.load(r)

        mapping = _get_json("data/v2-scores.json")
        for key, ent in mapping.get("scores", {}).items():
            score = _get_json(ent["file"])
            last = len(score["bars"]) - 1
            rep = score.get("repeat")
            expect_repeat = bool(rep and rep.get("to") == last)
            ctx, page, frame, errs = open_score(browser, key)
            bar = frame.locator(f'.bar[data-bar="{last}"]')
            cls = (bar.get_attribute("class") or "").split()
            if ("repeat-end" in cls) != expect_repeat:
                fail(f"{key}: last bar repeat-end={('repeat-end' in cls)}, expected {expect_repeat}")
            dots = bar.evaluate("el=>getComputedStyle(el,'::before').backgroundImage")
            if expect_repeat and dots == "none":
                fail(f"{key}: repeat end has no repeat dots")
            if not expect_repeat and dots != "none":
                fail(f"{key}: last bar shows repeat dots but no repeat ends there")
            endline = bar.evaluate("el=>getComputedStyle(el,'::after').backgroundImage")
            if endline == "none":
                fail(f"{key}: last bar has no final double barline")
            single = score.get("voices") == ["S"]
            root_cls = (frame.locator("#score").get_attribute("class") or "").split()
            if ("single-voice" in root_cls) != single:
                fail(f"{key}: single-voice class {('single-voice' in root_cls)}, expected {single}")
            n_lines = frame.locator(".line").count()
            n_first = frame.locator(".bar.line-first").count()
            if n_first != n_lines:
                fail(f"{key}: line-first bars {n_first}, lines {n_lines}")
            n_brackets = frame.locator(".sys-bracket").count()
            if single:
                if n_brackets:
                    fail(f"{key}: single-voice score draws {n_brackets} system brackets")
                bw = frame.locator(".gutter").first.evaluate("el=>getComputedStyle(el).borderRightWidth")
                if bw not in ("0px", "0"):
                    fail(f"{key}: single-voice gutter still draws bracket line ({bw})")
                fl = frame.locator(".bar.line-first").first.evaluate("el=>getComputedStyle(el).borderLeftWidth")
                if fl not in ("0px", "0"):
                    fail(f"{key}: single-voice line start still draws a left line ({fl})")
            else:
                if n_brackets != n_lines:
                    fail(f"{key}: system brackets {n_brackets}, lines {n_lines}")
                geo = frame.locator("body").evaluate("""() => {
                  const line = document.querySelector('.line');
                  const sv = line.querySelector('.sys-bracket');
                  const bar = line.querySelector('.bar');
                  const rows = bar.querySelectorAll('.vrow');
                  if (!sv || !rows.length) return null;
                  const sr = sv.getBoundingClientRect(), br = bar.getBoundingClientRect();
                  const rect = sv.querySelector('rect').getBoundingClientRect();
                  const tr = rows[0].getBoundingClientRect(), er = rows[rows.length-1].getBoundingClientRect();
                  return {top: tr.top - sr.top, bottom: sr.bottom - er.bottom,
                          rectGap: br.left - rect.right, rectW: rect.width,
                          reach: sr.right - br.left,
                          fs: parseFloat(getComputedStyle(document.querySelector('#score')).fontSize)};
                }""")
                if not geo:
                    fail(f"{key}: system bracket/rows missing")
                else:
                    fs = geo["fs"]
                    if not (-fs*0.5 <= geo["top"] <= 2):
                        fail(f"{key}: bracket top offset {geo['top']:.1f}px vs voice row")
                    if not (-fs*0.5 <= geo["bottom"] <= 2):
                        fail(f"{key}: bracket bottom offset {geo['bottom']:.1f}px vs voice row")
                    if not (fs*0.25 <= geo["rectGap"] <= fs*0.55):
                        fail(f"{key}: bracket bar to first barline {geo['rectGap']:.1f}px (fs={fs:.1f})")
                    if geo["rectW"] < 2:
                        fail(f"{key}: bracket bar too thin ({geo['rectW']:.1f}px)")
                    if geo["reach"] < 3:
                        fail(f"{key}: bracket flags do not reach the staff ({geo['reach']:.1f}px)")
                fl = frame.locator(".bar.line-first").first.evaluate("el=>getComputedStyle(el).borderLeftWidth")
                if fl in ("0px", "0"):
                    fail(f"{key}: multi-voice first bar lost its thin barline")
            if errs:
                fail(f"{key} page errors: " + " | ".join(errs[:3]))
            ctx.close()

        browser.close()

    if errors:
        print("FAIL: UI checks")
        for e in errors:
            print(" -", e)
        return 1
    print("OK: UI checks (single voice, slurs, lyrics, accidental, dash)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
