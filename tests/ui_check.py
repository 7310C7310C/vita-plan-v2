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
    page.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
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

        ctx, page, frame, errs = open_score(browser, "jt/017")
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
