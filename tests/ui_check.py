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


def open_score(browser, path: str, width: int = 1280):
    ctx = browser.new_context(viewport={"width": width, "height": 900}, service_workers="block")
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

        # 分类页按返回：URL 回到首页，且不重载页面
        ctx = browser.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
        page = ctx.new_page()
        p_errs: list[str] = []
        page.on("pageerror", lambda e: p_errs.append(str(e)))
        page.goto(BASE, wait_until="load", timeout=60000)
        page.wait_for_timeout(1800)
        if page.locator('#version-modal').is_visible():
            page.locator('#modalVersionBtnList .primary-version-btn').click()
            page.wait_for_timeout(250)
        page.evaluate("window.__navMarker = 'alive'")
        page.locator('#categoriesContainer .category-card').first.click()
        page.wait_for_timeout(700)
        cat_url = page.url
        if cat_url.rstrip('/') == BASE.rstrip('/'):
            fail(f"category click did not change URL: {cat_url}")
        page.click('#backButton')
        page.wait_for_timeout(700)
        if page.url.rstrip('/') != BASE.rstrip('/'):
            fail(f"category back: URL {page.url} != home {BASE}")
        if page.evaluate("window.__navMarker") != "alive":
            fail("category back: page reloaded (nav marker lost)")
        if p_errs:
            fail("category back page errors: " + " | ".join(p_errs[:3]))
        # 本周歌曲返回同样应回到首页 URL 且不重载
        page.click('#weeklyButton')
        page.wait_for_timeout(600)
        if not page.url.rstrip('/').endswith('/weekly'):
            fail(f"weekly route: {page.url} not /weekly")
        page.click('#backButtonWeekly')
        page.wait_for_timeout(600)
        if page.url.rstrip('/') != BASE.rstrip('/'):
            fail(f"weekly back: URL {page.url} != home {BASE}")
        if page.evaluate("window.__navMarker") != "alive":
            fail("weekly back: page reloaded (nav marker lost)")
        # 复合流程：分类→歌曲→关闭→页内返回→浏览器后退，网址与视图必须一致
        page.locator('#categoriesContainer .category-card').first.click()
        page.wait_for_timeout(600)
        cat_path = page.url
        page.locator('#songsContainer .song-item').first.click()
        page.wait_for_timeout(2200)
        if page.url == BASE:
            fail("compound: song click did not change URL")
        page.click('#close-viewer')
        page.wait_for_timeout(700)
        if page.url.rstrip('/') != cat_path.rstrip('/'):
            fail(f"compound: closeViewer URL {page.url} != {cat_path}")
        # 直接按浏览器后退：应回到首页网址并同步显示首页视图
        page.go_back()
        page.wait_for_timeout(800)
        views = page.evaluate("""() => ({
          cat: getComputedStyle(document.getElementById('category-view')).display,
          main: getComputedStyle(document.getElementById('main-view')).display })""")
        if page.url.rstrip('/') != BASE.rstrip('/'):
            fail(f"compound: popstate URL {page.url} != home {BASE}")
        if views["main"] != "block" or views["cat"] != "none":
            fail(f"compound: popstate URL {page.url} but views {views}")
        if page.evaluate("window.__navMarker") != "alive":
            fail("compound flow: page reloaded (nav marker lost)")
        if p_errs:
            fail("compound flow page errors: " + " | ".join(p_errs[:3]))
        # 深链进入：× 关闭 / 页内返回必须能回到首页网址与视图（B1 回归）
        for path, closer in (("cl/001", "#close-viewer"), ("jt", "#backButton"), ("weekly", "#backButtonWeekly")):
            page.goto(BASE + path, wait_until="load", timeout=60000)
            page.wait_for_timeout(2600)
            page.evaluate("window.__deepMarker = 'alive'")
            if not page.url.rstrip('/').endswith('/' + path):
                fail(f"deep link {path}: unexpected URL {page.url}")
            page.click(closer)
            page.wait_for_timeout(800)
            if page.url.rstrip('/') != BASE.rstrip('/'):
                fail(f"deep link {path}: after close/back URL {page.url} != home {BASE}")
            v = page.evaluate("""() => ({
              main: getComputedStyle(document.getElementById('main-view')).display,
              viewer: getComputedStyle(document.getElementById('viewer-view')).display,
              cat: getComputedStyle(document.getElementById('category-view')).display })""")
            if v["main"] != "block" or v["viewer"] != "none" or v["cat"] != "none":
                fail(f"deep link {path}: views after close/back {v}")
            if page.evaluate("window.__deepMarker") != "alive":
                fail(f"deep link {path}: page reloaded")
        # 深链后按浏览器后退：应留站内并回到首页，不得 about:blank / 离站
        for path in ("cl/001", "cl", "weekly"):
            page.goto(BASE + path, wait_until="load", timeout=60000)
            page.wait_for_timeout(2600)
            page.evaluate("window.__deepBackMarker = 'alive'")
            page.go_back()
            page.wait_for_timeout(900)
            if page.url.rstrip('/') != BASE.rstrip('/'):
                fail(f"deep link {path}: browser back left site or wrong URL {page.url}")
            if page.evaluate("window.__deepBackMarker") != "alive":
                fail(f"deep link {path}: browser back reloaded/left the app")
            v = page.evaluate("() => getComputedStyle(document.getElementById('main-view')).display")
            if v != "block":
                fail(f"deep link {path}: browser back did not show home view ({v})")
        ctx.close()

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
        meters_on = frame.locator("body").evaluate(r"""() => {
          const sc=document.querySelector('#score'), sr=sc.getBoundingClientRect();
          return {nowrap:sc.classList.contains('nowrap'),
                  lines:[...document.querySelectorAll('.line')].map(l=>l.querySelectorAll('.bar').length),
                  meters:[...document.querySelectorAll('.bar-meter')].map(m=>{
                    const r=m.getBoundingClientRect();
                    return {txt:m.textContent.replace(/\s+/g,''), top:r.top-sr.top, bottom:r.bottom-sr.top, h:sr.height};
                  })};
        }""")
        frame.locator("body").evaluate("()=>document.getElementById('wrapBtn').click()")
        page.wait_for_timeout(500)
        meters_off = frame.locator("body").evaluate(r"""() => {
          const sc=document.querySelector('#score'), sr=sc.getBoundingClientRect();
          return {wrap:window.__hymn.autowrap, nowrap:sc.classList.contains('nowrap'),
                  lines:[...document.querySelectorAll('.line')].map(l=>l.querySelectorAll('.bar').length),
                  meters:[...document.querySelectorAll('.bar-meter')].map(m=>{
                    const r=m.getBoundingClientRect();
                    return {txt:m.textContent.replace(/\s+/g,''), top:r.top-sr.top, bottom:r.bottom-sr.top, h:sr.height};
                  })};
        }""")
        expected_meters = ["24","34","24","34","24","34","44"]
        if meters_on["nowrap"] or sum(meters_on["lines"]) != 8 or [m["txt"] for m in meters_on["meters"]] != expected_meters:
            fail(f"cl001: autowrap on layout/meters changed: {meters_on}")
        if meters_off["wrap"] or not meters_off["nowrap"] or meters_off["lines"] != [4,4]:
            fail(f"cl001: autowrap off must keep phrase rows: {meters_off}")
        if [m["txt"] for m in meters_off["meters"]] != expected_meters:
            fail(f"cl001: nowrap lost meter elements: {meters_off['meters']}")
        bad = [m for m in meters_off["meters"] if m["top"] < -0.5 or m["bottom"] > m["h"] + 0.5]
        if bad:
            fail(f"cl001: nowrap clips meter elements: {bad}")
        frame.locator("body").evaluate("()=>document.getElementById('wrapBtn').click()")
        page.wait_for_timeout(400)
        meters_back = frame.locator("body").evaluate("""() => ({
          nowrap: document.querySelector('#score').classList.contains('nowrap'),
          lines: [...document.querySelectorAll('.line')].map(l=>l.querySelectorAll('.bar').length)
        })""")
        if meters_back["nowrap"] or meters_back["lines"] != meters_on["lines"]:
            fail(f"cl001: autowrap toggle back did not restore wrapped layout: {meters_back}")
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

        # narrow autowrap: one-bar lines must still end with a visible barline
        ctx, page, frame, errs = open_score(browser, "cl/002", width=360)
        narrow_lines = frame.locator("body").evaluate("""() => {
          return [...document.querySelectorAll('.line')].map(l=>{
            const bars=[...l.querySelectorAll('.bar')];
            const b=bars[bars.length-1], cs=getComputedStyle(b);
            return {n:bars.length, final:b.classList.contains('final'),
                    bg:cs.backgroundImage, pos:cs.backgroundPosition,
                    after:getComputedStyle(b,'::after').backgroundImage};
          });
        }""")
        if len(narrow_lines) != 22 or any(x["n"] != 1 for x in narrow_lines):
            fail(f"cl002@360: expected 22 one-bar lines, got {[x['n'] for x in narrow_lines]}")
        for i, x in enumerate(narrow_lines):
            if x["final"]:
                if "linear-gradient" not in x["after"]:
                    fail(f"cl002@360: final line lost its double barline: {x}")
                continue
            if x["bg"].count("linear-gradient") != 1 or not x["pos"].startswith("100%"):
                fail(f"cl002@360: line {i+1} must have exactly one right barline: {x}")
        frame_geo = frame.locator("body").evaluate("""() => {
          const sc=document.querySelector('#score'), fs=parseFloat(getComputedStyle(sc).fontSize);
          return [...document.querySelectorAll('.line')].map((l,i)=>{
            const bar=l.querySelector('.bar'); bar.classList.add('playing');
            const f=bar.querySelector('.play-frame');
            const br=bar.getBoundingClientRect(), fr=f.getBoundingClientRect();
            const out={line:i+1, cls:bar.className, inset:+(br.right-fr.right).toFixed(2), fs,
                       display:getComputedStyle(f).display};
            bar.classList.remove('playing'); return out;
          });
        }""")
        for x in frame_geo:
            if x["display"] != "block":
                fail(f"cl002@360: line {x['line']} play frame not displayed")
            elif "final" in x["cls"]:
                if x["inset"] < x["fs"]*0.42 - 0.6:
                    fail(f"cl002@360: line {x['line']} frame covers final double barline: {x}")
            elif not (1.2 <= x["inset"] <= 1.6):
                fail(f"cl002@360: line {x['line']} frame covers its right barline: {x}")
        if errs:
            fail("cl002@360 page errors: " + " | ".join(errs[:4]))
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
            n = frame.locator(f'.bar[data-bar="{i}"] .lrow:not(.hum-row)').count()
            if n != 1:
                fail(f"jt017 bar{i+1}: {n} lyric rows, expected 1 (shared opening)")
                break
        for i in range(16, 32):
            n = frame.locator(f'.bar[data-bar="{i}"] .lrow:not(.hum-row)').count()
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

        # first visit prefetches all score JSON into v2-json-v2 in the background
        ctx = browser.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
        page = ctx.new_page()
        page.goto(BASE, wait_until="load", timeout=60000)
        n_scores = 0
        for _ in range(12):
            n_scores = page.evaluate("""async () => {
              const c = await caches.open('v2-json-v2');
              const keys = await c.keys();
              return keys.filter(k => k.url.includes('/data/scores/')).length;
            }""")
            if n_scores >= 6:
                break
            page.wait_for_timeout(500)
        if n_scores < 6:
            fail(f"first-visit score prefetch incomplete: {n_scores}/6 cached")
        ctx.close()

        # mid-line repeat-start (narrow viewport wraps bar 9 inside a line)
        ctx, page, frame, errs = open_score(browser, "lz/019", width=900)
        mb = frame.locator('.bar[data-bar="8"]')
        cls = mb.get_attribute("class") or ""
        if "repeat-start" not in cls or "line-first" in cls:
            fail(f"lz019@900: bar9 classes {cls!r}, expected mid-line repeat-start")
        mbg = mb.evaluate("el=>getComputedStyle(el,'::before').backgroundImage")
        if mbg.count("linear-gradient") != 2:
            fail("lz019@900: mid-line repeat sign missing thick/thin lines")
        if "rgb(36, 31, 26)" not in mbg:
            fail("lz019@900: mid-line repeat dots are not ink black")
        if errs:
            fail("lz019@900 page errors: " + " | ".join(errs[:3]))
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
            if "endbar" not in score["bars"][-1]:
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
                fl = frame.locator("body").evaluate("""() => {
                  const line=[...document.querySelectorAll('.line')].find(l=>l.querySelectorAll('.bar').length>1);
                  if (!line) return "skip";
                  return getComputedStyle(line.querySelector('.bar')).backgroundImage;
                }""")
                if fl not in ("skip","none"):
                    fail(f"{key}: single-voice line start still draws a left line ({fl[:30]})")
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
                    if abs(geo["top"]) > 1.2:
                        fail(f"{key}: bracket hook top not at thin-line top ({geo['top']:.1f}px)")
                    if abs(geo["bottom"]) > 1.2:
                        fail(f"{key}: bracket hook bottom not at thin-line bottom ({geo['bottom']:.1f}px)")
                    if not (fs*0.08 <= geo["rectGap"] <= fs*0.25):
                        fail(f"{key}: bracket bar to first barline {geo['rectGap']:.1f}px (fs={fs:.1f})")
                    if geo["rectW"] < 2:
                        fail(f"{key}: bracket bar too thin ({geo['rectW']:.1f}px)")
                    if geo["reach"] < 3:
                        fail(f"{key}: bracket flags do not reach the staff ({geo['reach']:.1f}px)")
                fl = frame.locator(".bar.line-first").first.evaluate("el=>getComputedStyle(el).backgroundImage")
                if "linear-gradient" not in fl:
                    fail(f"{key}: multi-voice first bar lost its thin barline")

            # playing frame must not cover the bar's own right barline (line-end / final / repeat / endbar)
            frames = frame.locator("body").evaluate("""() => {
              const sc=document.querySelector('#score'), fs=parseFloat(getComputedStyle(sc).fontSize);
              return [...document.querySelectorAll('#score .bar')].map(bar=>{
                bar.classList.add('playing');
                const f=bar.querySelector('.play-frame');
                const br=bar.getBoundingClientRect(), fr=f.getBoundingClientRect();
                const special=bar.matches('.final,.endbar-thin-thick,.endbar-double-thin,.repeat-end');
                const last=bar.matches(':last-child');
                const out={bi:+bar.dataset.bar, display:getComputedStyle(f).display,
                           inset:+(br.right-fr.right).toFixed(2), fs,
                           special, last,
                           ownLine:getComputedStyle(bar).backgroundImage.includes('linear-gradient'),
                           pos:getComputedStyle(bar).backgroundPosition,
                           after:getComputedStyle(bar,'::after').backgroundImage.includes('linear-gradient')};
                bar.classList.remove('playing');
                return out;
              });
            }""")
            for fr_ in frames:
                if fr_["display"] != "block":
                    fail(f"{key}: bar {fr_['bi']} play frame not displayed")
                if fr_["special"]:
                    if fr_["inset"] < fr_["fs"]*0.42 - 0.6:
                        fail(f"{key}: bar {fr_['bi']} play frame covers its end barline (inset {fr_['inset']})")
                elif fr_["last"]:
                    if not (1.2 <= fr_["inset"] <= 1.6) or not fr_["ownLine"] or "100%" not in fr_["pos"]:
                        fail(f"{key}: bar {fr_['bi']} play frame covers the line-end barline ({fr_})")
                elif abs(fr_["inset"]) > 0.5:
                    fail(f"{key}: bar {fr_['bi']} play frame right edge must sit on the bar edge ({fr_})")

            if key == "cl/001":
                mc = frame.locator(".bar-meter").first.evaluate("el=>getComputedStyle(el).color")
                if mc != "rgb(0, 0, 0)":
                    fail(f"cl001: bar meter must be pure black, got {mc}")
                bn = frame.locator(".bar .bnum").count()
                bars = frame.locator(".bar").count()
                if bn != bars:
                    fail(f"cl001: {bn} bar numbers for {bars} bars (meter changes must not hide numbers)")
            if key == "lz/020":
                if frame.locator('.bar[data-bar="0"] .btag').count():
                    fail("lz020: 弱起 tag should be removed")
                g = frame.locator("body").evaluate("""() => {
                  const bar = document.querySelector('.bar[data-bar="7"]');
                  const span = [...bar.querySelectorAll('.chordrow span')].find(s=>s.textContent.trim()==='G');
                  const tail = bar.querySelectorAll('.vrow[data-vrow="S"] .cell')[3].querySelector('.tail');
                  if (!span || !tail) return null;
                  const r=document.createRange(); r.selectNodeContents(span);
                  const sr=r.getBoundingClientRect(), tr=tail.getBoundingClientRect();
                  return {c:(sr.left+sr.right)/2, t:(tr.left+tr.right)/2};
                }""")
                if not g:
                    fail("lz020 bar8: G chord or beat4 tail missing")
                elif abs(g["c"] - g["t"]) > 1.5:
                    fail(f"lz020 bar8 G chord center {g['c']:.1f} != beat4 dash {g['t']:.1f}")
            if key == "cl/002":
                g = frame.locator("body").evaluate("""() => {
                  const bar = document.querySelector('.bar[data-bar="1"]');
                  const num = bar.querySelector('.bnum');
                  const chord = bar.querySelector('.chordrow');
                  if (!num || !chord) return null;
                  return {nb: num.getBoundingClientRect().bottom, cb: chord.getBoundingClientRect().bottom,
                          bg: getComputedStyle(bar).backgroundImage};
                }""")
                if not g:
                    fail("cl002 bar2: number band missing")
                else:
                    if g["nb"] > g["cb"] + 1:
                        fail(f"cl002 bar2: bar number extends below its band ({g['nb']:.1f} > {g['cb']:.1f})")
                    if "linear-gradient" not in g["bg"]:
                        fail("cl002 bar2: barline background missing")
            if key == "jt/017":
                needed = [[2,'A',2,3],[2,'A',2,4],[2,'B',2,3],[2,'S',2,3],[2,'S',2,4],
                          [2,'T',2,3],[2,'T',2,4],[6,'A',2,3],[6,'B',2,3],[6,'S',2,3],[6,'T',2,3],
                          [10,'A',2,3],[10,'B',2,3],[10,'S',2,3],[10,'T',2,3],
                          [12,'B',1,2],[12,'S',1,2],[14,'S',0,1],[14,'S',0,2],[15,'T',0,16,'T',0],[23,'T',0,24,'T',0],[31,'T',0,0,'T',0]]
                missing = [x for x in needed if x not in score.get("slurs", [])]
                if missing:
                    fail(f"jt/017: missing slurs {missing}")
                if [14,'S',0,1] not in score.get("slurs", []) or [14,'S',0,2] not in score.get("slurs", []):
                    fail("jt/017 bar15: both 3→first-beat-2 and 3→second-beat-2 slurs are required")
                tie_play = frame.locator("body").evaluate("""() => {
                  const h=window.__hymn, start=h.BAR_START[14];
                  const evs=h.engine.events.filter(e=>e.bar===14 && e.voice==='S');
                  const a=evs.find(e=>Math.abs(e.beat-(start+0.5))<1e-6);
                  const b=evs.find(e=>Math.abs(e.beat-(start+1))<1e-6);
                  return {a:a?{dur:a.dur,midi:a.midi}:null, b:!!b};
                }""")
                if not tie_play["a"] or abs(tie_play["a"]["dur"] - 1.5) > 1e-6 or tie_play["b"]:
                    fail(f"jt017 bar15: tied 2 must sustain 1.5 beats without re-attack, got {tie_play}")
                order = frame.locator("body").evaluate("""() => {
                  const line=[...document.querySelectorAll('.line')].find(l=>l.querySelector('.bar[data-bar="14"]'));
                  const bar=line && line.querySelector('.bar[data-bar="14"]');
                  if(!line || !bar) return null;
                  const base=line.getBoundingClientRect();
                  const notes=[...bar.querySelectorAll('.vrow[data-vrow="S"] .note .num')].slice(0,3).map(n=>{
                    const r=n.getBoundingClientRect(); return r.left+r.width/2-base.left;
                  });
                  const paths=[...line.querySelectorAll('.slur-layer path')].map(p=>{
                    const a=p.getAttribute('d').match(/-?[0-9]+(?:[.][0-9]+)?/g).map(Number);
                    return {x1:a[0],y1:a[1],x2:a[a.length-2],y2:a[a.length-1]};
                  });
                  const find=(x1,x2)=>paths.find(p=>Math.abs(p.x1-x1)<2 && Math.abs(p.x2-x2)<2);
                  return {long:find(notes[0],notes[2]), short:find(notes[0],notes[1]), notes};
                }""")
                if not order or not order["long"] or not order["short"]:
                    fail(f"jt017 bar15: long/short slur paths not found: {order}")
                elif order["long"]["y1"] >= order["short"]["y1"]:
                    fail(f"jt017 bar15: long slur must be above short tie: {order}")
                bad7 = [x for x in score.get("slurs", []) if x[:3] in ([6,'S',1],[6,'A',1],[6,'T',1],[6,'B',1]) and x[3]==2]
                if bad7:
                    fail(f"jt/017: bar7 first pair is a beam, not a slur: {bad7}")
                needed_ties = [[[15,'B',0],[16,'B',0]],[[14,'S',1],[14,'S',2],'playonly'],[[11,'T',0],[12,'T',0]],[[11,'B',0],[12,'B',0]],
                               [[17,'S',2],[18,'S',0]],[[18,'S',3],[19,'S',0]],[[21,'S',2],[22,'S',0]],
                               [[17,'T',0],[18,'T',0]],[[19,'T',0],[20,'T',0]],[[21,'T',0],[22,'T',0]],
                               [[25,'T',0],[26,'T',0]],[[27,'T',0],[28,'T',0]],[[29,'T',0],[30,'T',0]],
                               [[25,'S',2],[26,'S',0]],[[26,'S',3],[27,'S',0]],[[29,'S',2],[30,'S',0]],
                               [[17,'B',0],[18,'B',0]],[[19,'B',0],[20,'B',0]],[[21,'B',0],[22,'B',0]],
                               [[23,'B',0],[24,'B',0]],[[25,'B',0],[26,'B',0]],[[27,'B',0],[28,'B',0]],
                               [[29,'B',0],[30,'B',0]],[[31,'B',0],[0,'B',0]]]
                mt = [t for t in needed_ties if t not in score.get("ties", [])]
                if mt:
                    fail(f"jt/017: missing ties {mt}")
                bn = frame.locator("body").evaluate("""() => {
                  const bar = document.querySelector('.bar[data-bar="1"]');
                  const num = bar.querySelector('.bnum');
                  const chord = bar.querySelector('.chordrow');
                  if (!num || !chord) return null;
                  const nr = num.getBoundingClientRect(), br = bar.getBoundingClientRect(), cr = chord.getBoundingClientRect();
                  return {dx: (nr.left + nr.width/2) - br.left,
                          ncy: nr.top + nr.height/2, ccy: cr.top + cr.height/2,
                          pos: getComputedStyle(num).position};
                }""")
                if not bn:
                    fail("jt017 bar2: bar number / chord row missing")
                else:
                    if abs(bn["dx"]) > 3:
                        fail(f"jt017 bar2: bar number center is {bn['dx']:.1f}px from the barline")
                    if abs(bn["ncy"] - bn["ccy"]) > 3:
                        fail(f"jt017 bar2: bar number not vertically aligned with chord row ({bn['ncy']:.1f} vs {bn['ccy']:.1f})")
                    if bn["pos"] != "absolute":
                        fail(f"jt017 bar2: bar number is not absolutely positioned ({bn['pos']})")
                    colors = frame.locator("body").evaluate("""() => {
                      const els = [...document.querySelectorAll('.score-head .kt'), document.querySelector('.score-tempo')].filter(Boolean);
                      return els.map(e => getComputedStyle(e).color);
                    }""")
                    if any(c != "rgb(0, 0, 0)" for c in colors):
                        fail(f"jt017: score key/meter/tempo must be pure black, got {colors}")
                    first_s = frame.locator('.bar[data-bar="0"] .vrow[data-vrow="S"] .cell').first.inner_text().strip()
                    first_a = frame.locator('.bar[data-bar="0"] .vrow[data-vrow="A"] .cell').first.inner_text().strip()
                    if first_s != "0" or first_a != "0":
                        fail(f"jt017 bar1: rests at beat 1 must show 0 (S={first_s!r}, A={first_a!r})")
                    t0 = frame.locator('.bar[data-bar="0"] .vrow[data-vrow="T"] .note').first
                    if t0.locator(".dot").count():
                        fail("jt017 bar1 T 7: octave dot should be suppressed (original has none)")
                    s_last = frame.locator('.bar[data-bar="0"] .vrow[data-vrow="S"] .note').last
                    if s_last.locator(".dot").count() != 1:
                        fail("jt017 bar1 S 7: low octave dot missing")
                    frame.locator('body').evaluate("()=>document.querySelector('.bar').classList.add('sel')")
                    selbg = frame.locator('.bar').first.evaluate("el=>getComputedStyle(el).backgroundImage")
                    if "linear-gradient" not in selbg:
                        fail("selected bar lost its barline background image")
                    frame.locator('body').evaluate("()=>document.querySelector('.bar').classList.remove('sel')")
                    pf = frame.locator('body').evaluate("""() => {
                      const bar=document.querySelector('.bar'); bar.classList.add('playing');
                      const f=bar.querySelector('.play-frame');
                      const cs=getComputedStyle(f);
                      const out={d:cs.display,l:parseFloat(cs.left),r:parseFloat(cs.right)};
                      bar.classList.remove('playing');
                      return out;
                    }""")
                    if pf["d"] != "block" or pf["l"] < 1.2 or pf["l"] > 1.4 or pf["r"] > 0.5:
                        fail(f"playing frame must hug barlines (left~1.3, right~0): {pf}")
                    eb16 = frame.locator('.bar[data-bar="15"]').evaluate("el=>({cls:el.className,bg:getComputedStyle(el,'::after').backgroundImage})")
                    if "endbar-thin-thick" not in eb16["cls"] or "linear-gradient" not in eb16["bg"]:
                        fail(f"jt017 bar16 endbar thinThick missing: {eb16}")
                    eb32 = frame.locator('.bar[data-bar="31"]').evaluate("el=>({cls:el.className,bg:getComputedStyle(el,'::after').backgroundImage,bc:getComputedStyle(el,'::after').backgroundColor,bgi:getComputedStyle(el).backgroundImage})")
                    if "endbar-double-thin" not in eb32["cls"] or "final" in eb32["cls"].split():
                        fail(f"jt017 bar32 endbar doubleThin/final wrong: {eb32}")
                    if eb32["bc"] in ("rgba(0, 0, 0, 0)", "transparent"):
                        fail(f"jt017 bar32 double-thin inner line missing: {eb32}")
                    if eb32["bgi"].count("linear-gradient") < 2:
                        fail(f"jt017 bar32 lost its right thin barline: {eb32}")
                    capo_val = page.locator("#v2Capo").input_value() if page.locator("#v2Capo").count() else "0"
                    if capo_val != "0":
                        fail(f"jt017: capo must default to 0, got {capo_val}")
                    capo_badge = frame.locator("#scoreCapo").inner_text().strip()
                    if capo_badge:
                        fail(f"jt017: capo badge should be empty by default, got {capo_badge!r}")
                    a11 = frame.locator('.bar[data-bar="10"] .vrow[data-vrow="A"] .note').first.inner_text().strip()
                    if a11 != "1":
                        fail(f"jt017 bar11 A first note {a11!r}, expected 1")
                    b13 = " ".join(frame.locator('.bar[data-bar="12"] .vrow[data-vrow="B"]').inner_text().split())
                    if b13 != "6 – – 6 5":
                        fail(f"jt017 bar13 B row {b13!r}, expected '6 – – 6 5'")
                    st = frame.locator('.bar[data-bar="1"]').evaluate("""el=>{
                      const cs=getComputedStyle(el);
                      return {bw:cs.borderLeftWidth, bg:cs.backgroundImage};
                    }""")
                    if st["bw"] not in ("0px", "0"):
                        fail(f"jt017 bar2: barline still uses a full-height border ({st['bw']})")
                    if "linear-gradient" not in st["bg"]:
                        fail("jt017 bar2: barline background missing")
            if key == "jt/017":
                l15 = " ".join(frame.locator('.bar[data-bar="14"] .lrow:not(.hum-row)').first.inner_text().split())
                l16 = " ".join(frame.locator('.bar[data-bar="15"] .lrow:not(.hum-row)').first.inner_text().split())
                if l15 != "耶 路 撒" or "冷" in l15:
                    fail(f"jt017 bar15 lyrics {l15!r}, expected '耶 路 撒' with 路 on beat 3")
                if l16 != "冷":
                    fail(f"jt017 bar16 lyrics {l16!r}, expected '冷'")
                h18 = " ".join(frame.locator('.bar[data-bar="17"] .hum-row').inner_text().split())
                h19 = " ".join(frame.locator('.bar[data-bar="18"] .hum-row').inner_text().split())
                if h18 != "呜" or h19:
                    fail(f"jt017 hum bars: bar18={h18!r}, bar19={h19!r} (expected 呜 then blank)")
                n_hum = frame.locator('.hum-row').evaluate_all("els=>els.filter(e=>e.textContent.trim()==='呜').length")
                if n_hum != 8:
                    fail(f"jt017: hum count {n_hum}, expected 8 (bars 18,20,22,24,26,28,30,32)")
                hum_bars = frame.locator(".bar").evaluate_all("""bars=>bars.filter(b=>{
                  const h=b.querySelector('.hum-row'); return h && h.textContent.trim()==='呜';
                }).map(b=>+b.dataset.bar+1)""")
                if hum_bars != [18,20,22,24,26,28,30,32]:
                    fail(f"jt017 hum bars {hum_bars}, expected even 18..32")
                bad_s = [x for x in score.get("slurs", []) if len(x) == 6 and x[1] == "S" and x[0] != x[3]]
                if bad_s:
                    fail(f"jt017: unexpected S cross-bar slurs {bad_s}")
                cross = frame.locator("body").evaluate("""() => {
                  const lines = [...document.querySelectorAll('.line')];
                  const l1 = lines.findIndex(l=>l.querySelector('.bar[data-bar="25"]'));
                  const l2 = lines.findIndex(l=>l.querySelector('.bar[data-bar="26"]'));
                  if (l1 < 0 || l2 < 0) return null;
                  return {same: l1===l2,
                          p1: lines[l1].querySelectorAll('.slur-layer path').length,
                          p2: lines[l2].querySelectorAll('.slur-layer path').length};
                }""")
                if not cross:
                    fail("jt017: bars 26/27 not found for cross-line slur check")
                elif not cross["same"] and (cross["p1"] < 1 or cross["p2"] < 1):
                    fail(f"jt017: cross-line slur missing a half (line paths {cross['p1']}/{cross['p2']})")
                dark = frame.locator("body").evaluate("""() => {
                  const lyr = document.querySelector('.lrow');
                  const kt = document.querySelector('.score-head .kt');
                  const bar = document.querySelector('.bar');
                  document.documentElement.dataset.theme = 'dark';
                  const out = {
                    ly: getComputedStyle(lyr).color,
                    kt: kt ? getComputedStyle(kt).color : null,
                    bg: getComputedStyle(bar).backgroundImage
                  };
                  document.documentElement.dataset.theme = 'light';
                  return out;
                }""")
                if dark["ly"] != "rgb(236, 227, 212)" or (dark["kt"] and dark["kt"] != "rgb(236, 227, 212)"):
                    fail(f"jt017 dark mode: lyrics/meta must be light, got {dark}")
                if "rgb(236, 227, 212)" not in dark["bg"]:
                    fail("jt017 dark mode: barline must be light")
                y0 = frame.locator("body").evaluate("()=>window.scrollY")
                page.keyboard.press("PageDown"); page.wait_for_timeout(700)
                y1 = frame.locator("body").evaluate("()=>window.scrollY")
                if y1 <= y0:
                    fail("PageDown did not scroll the score iframe")
                page.keyboard.press("PageUp"); page.wait_for_timeout(700)
                y2 = frame.locator("body").evaluate("()=>window.scrollY")
                if y2 >= y1:
                    fail(f"PageUp did not scroll back (y={y2}, was {y1})")
                page.keyboard.press("End"); page.wait_for_timeout(500)
                yEnd = frame.locator("body").evaluate("()=>window.scrollY")
                if yEnd <= y2:
                    fail(f"End did not jump to the score bottom (y={yEnd}, was {y2})")
                page.keyboard.press("Home"); page.wait_for_timeout(500)
                yHome = frame.locator("body").evaluate("()=>window.scrollY")
                if yHome > 2:
                    fail(f"Home did not jump to the score top (y={yHome})")
                frame.locator("body").evaluate("""()=>{
                  let i=document.getElementById('__testInp');
                  if(!i){ i=document.createElement('input'); i.id='__testInp'; i.style.position='fixed'; i.style.top='-50px'; document.body.appendChild(i); }
                  i.focus();
                }""")
                yi = frame.locator("body").evaluate("()=>window.scrollY")
                for k in ("End", "Home", "PageDown"):
                    page.keyboard.press(k); page.wait_for_timeout(150)
                    if frame.locator("body").evaluate("()=>window.scrollY") != yi:
                        fail(f"{k} hijacked a focused input and scrolled the score")
                        break
                frame.locator("body").evaluate("""()=>{
                  const i=document.getElementById('__testInp'); if(i) i.remove();
                  if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
                }""")

            if key == "lz/019":
                row = frame.locator('.bar[data-bar="0"] .vrow[data-vrow="S"]')
                nb = row.locator('.group-beam').count()
                if nb != 1:
                    fail(f"lz019 bar1: S group beams {nb}, expected 1 continuous beam")
                vis = row.evaluate("r=>[...r.querySelectorAll('.note .u1')].filter(u=>getComputedStyle(u).display!=='none').length")
                if vis != 0:
                    fail(f"lz019 bar1: {vis} per-note underlines still visible under beamed notes")
                span = row.evaluate("""r => {
                  const bs = [...r.querySelectorAll('.group-beam')][0];
                  const notes = [...r.querySelectorAll('.note')].filter(n=>parseFloat(n.dataset.bs)>=3);
                  if (!bs || notes.length < 3) return null;
                  const br = bs.getBoundingClientRect();
                  const a = notes[0].getBoundingClientRect(), z = notes[notes.length-1].getBoundingClientRect();
                  return {left: br.left - a.left, right: z.right - br.right};
                }""")
                if not span or span["left"] > 2 or span["right"] > 2:
                    fail(f"lz019 bar1: beam does not span the 4 3 1 group: {span}")
            if key == "lz/019":
                rs = frame.locator('.bar[data-bar="8"].repeat-start.line-first')
                if not rs.count():
                    fail("lz019 bar9: repeat-start line-first marker missing")
                rgeo = frame.locator("body").evaluate("""() => {
                  const line = [...document.querySelectorAll('.line')].find(l=>l.querySelector('.bar[data-bar="8"]'));
                  const bar = line && line.querySelector('.bar[data-bar="8"]');
                  if (!bar) return null;
                  const ps = getComputedStyle(bar,'::before');
                  return {brackets: line.querySelectorAll('.sys-bracket').length,
                          bg: ps.backgroundImage, pw: parseFloat(ps.width),
                          fs: parseFloat(getComputedStyle(document.querySelector('#score')).fontSize)};
                }""")
                if not rgeo:
                    fail("lz019 bar9: repeat-start bar missing")
                else:
                    if rs.evaluate("el=>el.classList.contains('line-first')"):
                        if not rgeo["brackets"]:
                            fail("lz019 bar9: line-start repeat lost the system bracket (thick line)")
                        if rgeo["bg"].count("linear-gradient") != 0:
                            fail("lz019 bar9: line-start repeat should only add dots, not extra lines")
                    else:
                        if rgeo["bg"].count("linear-gradient") != 2:
                            fail("lz019 bar9: mid-line repeat needs thick + thin lines")
                    if rgeo["pw"] < rgeo["fs"]*0.75:
                        fail(f"lz019 bar9: repeat dot area too narrow ({rgeo['pw']:.1f}px), dots clipped")
            if errs:
                fail(f"{key} page errors: " + " | ".join(errs[:3]))
            ctx.close()

        # lz008 吉他版：仍是四声部，只把和弦换成原图手写 Capo 3 形状 +3 半音的实际音高
        ctx, page, frame, errs = open_score(browser, "lz/008")
        page.click(".version-toggle-button"); page.wait_for_timeout(250)
        page.click('.version-button:has-text("吉他")'); page.wait_for_timeout(2400)
        g8 = page.evaluate("VP2UI.isImage()")
        info8 = frame.locator("body").evaluate("""() => ({
          chords: [...document.querySelectorAll('.chordrow span')].filter(s=>s.textContent.trim()).map(s=>s.textContent),
          marks: [...document.querySelectorAll('.fret-mark')].filter(s=>s.textContent.trim()).length,
          clickable: document.querySelectorAll('.chordrow span[data-chord]').length,
          voices: document.querySelectorAll('.vrow').length,
          bars: document.querySelectorAll('.bar').length,
          capo: (document.getElementById('scoreCapo')||{}).textContent || '' })""")
        if g8:
            fail("lz008 吉他: has JSON, must not fall back to the image")
        if info8["chords"][:3] != ["Eb", "Bb/Ab", "Eb/G"]:
            fail(f"lz008 吉他: first chords {info8['chords'][:4]} != ['Eb','Bb/Ab','Eb/G']")
        if info8["marks"]:
            fail("lz008 吉他: guitar version must not render fret marks")
        if info8["clickable"] < 15:
            fail(f"lz008 吉他: chords should be clickable ({info8['clickable']})")
        if info8["voices"] < 4 or info8["bars"] != 8:
            fail(f"lz008 吉他: must keep SATB rows and 8 bars ({info8['voices']} voices/{info8['bars']} bars)")
        if info8["capo"]:
            fail(f"lz008 吉他: capo must default to 0 (badge {info8['capo']!r})")
        # Capo 3 时必须显示回原图手写形状（根音与斜杠低音一起回退，降号记法保持）
        page.click("#v2MenuBtn"); page.wait_for_timeout(250)
        page.select_option("#v2Capo", "3"); page.wait_for_timeout(900)
        shapes = frame.locator("body").evaluate("""() => [...document.querySelectorAll('.chordrow span')]
              .map(s=>s.textContent.trim()).filter(Boolean)""")
        want = ["C", "G/F", "C/E", "G/D", "C", "G/B", "C", "Am7", "D/F#", "G",
                "C/E", "F/A", "C/G", "F6", "Bb/F", "C/E", "F/A", "C", "G", "C"]
        if shapes != want:
            fail(f"lz008 吉他 capo 3: shapes {shapes} != printed chart {want}")
        page.select_option("#v2Capo", "0"); page.wait_for_timeout(500)
        page.click("#v2MenuBtn"); page.wait_for_timeout(250)
        page.click(".version-toggle-button"); page.wait_for_timeout(250)
        page.click('.version-button:has-text("原谱")'); page.wait_for_timeout(2400)
        if page.evaluate("VP2UI.isImage()"):
            fail("lz008: switching back to 原谱 should stay in JSON mode")
        if "v=" in page.url:
            fail(f"lz008: switching back to 原谱 leaves version in URL ({page.url})")
        if errs:
            fail("lz008 吉他 page errors: " + " | ".join(errs[:3]))
        ctx.close()

        # cl001 贝司版：12 个弦.品记号，无和弦弹窗
        ctx, page, frame, errs = open_score(browser, "cl/001?v=b")
        b1 = frame.locator("body").evaluate("""() => ({
          chords: [...document.querySelectorAll('.chordrow span')].filter(s=>s.textContent.trim()).map(s=>s.textContent),
          marks: [...document.querySelectorAll('.fret-mark')].filter(s=>s.textContent.trim()).length,
          clickable: [...document.querySelectorAll('.chordrow span[data-chord]')].filter(s=>s.textContent.trim()).length,
          bars: document.querySelectorAll('.bar').length })""")
        if b1["marks"] != 12:
            fail(f"cl001?v=b: expected 12 fret marks, got {b1['marks']}")
        if b1["clickable"]:
            fail(f"cl001?v=b: fret marks must not open the chord popup ({b1['clickable']})")
        if b1["chords"][:2] != ["2x", "3x"] or "3.2" not in b1["chords"]:
            fail(f"cl001?v=b: marks {b1['chords'][:4]} != ['2x','3x',...,'3.2']")
        if any("X" in x for x in b1["chords"]):
            fail(f"cl001?v=b: x must be lowercase: {b1['chords']}")
        if b1["bars"] != 8:
            fail(f"cl001?v=b: expected 8 bars, got {b1['bars']}")
        # 贝司记号随变调夹保音高换算：Capo 3 后 2x→3.2、3x→4.2、4.3→4x
        page.click("#v2MenuBtn"); page.wait_for_timeout(250)
        page.select_option("#v2Capo", "3"); page.wait_for_timeout(900)
        conv = frame.locator("body").evaluate("""() => [...document.querySelectorAll('.fret-mark')]
              .map(s=>s.textContent.trim()).filter(Boolean)""")
        want3 = ["3.2", "4.2", "4.4", "4x", "4.2", "4.2", "4.2", "4x", "4x", "4.2", "4.2", "3.2"]
        if conv != want3:
            fail(f"cl001?v=b capo 3: marks {conv} != {want3}")
        page.select_option("#v2Capo", "0"); page.wait_for_timeout(600)
        back = frame.locator("body").evaluate("""() => [...document.querySelectorAll('.fret-mark')]
              .map(s=>s.textContent.trim()).filter(Boolean)""")
        if back != b1["chords"]:
            fail(f"cl001?v=b capo 0 restore: {back} != {b1['chords']}")
        if errs:
            fail("cl001?v=b page errors: " + " | ".join(errs[:3]))
        ctx.close()

        # 纯图片谱（无 JSON 原谱）底栏不应有「标注」「自动换行」
        ctx, page, frame, errs = open_score(browser, "lz/009")
        bar = page.evaluate("""() => ({
          imgMode: !VP2UI.isActive(),
          imgLoaded: (document.getElementById('sheet-image')||{}).naturalWidth > 0,
          cls: document.body.classList.contains('v2-image-mode'),
          annot: getComputedStyle(document.getElementById('v2AnnotBarBtn')).display,
          wrap: getComputedStyle(document.getElementById('v2WrapBarBtn')).display })""")
        if not bar["imgMode"] or not bar["imgLoaded"]:
            fail(f"lz/009: should be a plain image score, got {bar}")
        if not page.evaluate("VP2UI.isImage()"):
            fail("lz/009: VP2UI.isImage() should be true for an image-only score")
        if not bar["cls"] or bar["annot"] != "none" or bar["wrap"] != "none":
            fail(f"lz/009: bottom bar must hide 标注/自动换行: {bar}")
        # JSON 谱则应正常显示这两个按钮
        page.goto(BASE + "cl/001", wait_until="load", timeout=60000); page.wait_for_timeout(2600)
        vis = page.evaluate("""() => ({
          annot: getComputedStyle(document.getElementById('v2AnnotBarBtn')).display,
          wrap: getComputedStyle(document.getElementById('v2WrapBarBtn')).display })""")
        if vis["annot"] == "none" or vis["wrap"] == "none":
            fail(f"cl/001 JSON: bottom bar should show 标注/自动换行: {vis}")
        if errs:
            fail("image-score bar page errors: " + " | ".join(errs[:3]))
        ctx.close()

        # 版本没有 JSON 的模式：把 versionScore 临时置空，点「吉他」应回落图片谱
        ctx, page, frame, errs = open_score(browser, "cl/002")
        page.evaluate("VP2UI.versionScore = () => null")
        page.click(".version-toggle-button"); page.wait_for_timeout(250)
        page.click('.version-button:has-text("吉他")')
        try:
            page.wait_for_function("VP2UI.isImage() === true", timeout=8000)
        except Exception:
            fail("version fallback: image mode never became active")
        fb = page.evaluate("""() => ({
          image: VP2UI.isImage(),
          src: (document.getElementById('sheet-image') || {}).getAttribute ? document.getElementById('sheet-image').getAttribute('src') : '' })""")
        if not fb["image"] or "垂怜曲_002" not in fb["src"] or "吉他" not in fb["src"]:
            fail(f"version without JSON: should fall back to the version image, got {fb}")
        hb = page.evaluate("""() => ({
          annot: getComputedStyle(document.getElementById('v2AnnotBarBtn')).display,
          wrap: getComputedStyle(document.getElementById('v2WrapBarBtn')).display })""")
        if hb["annot"] != "none" or hb["wrap"] != "none":
            fail(f"version image fallback: bottom bar must hide 标注/自动换行: {hb}")
        if errs:
            fail("version fallback page errors: " + " | ".join(errs[:3]))
        ctx.close()

        # version JSONs: 吉他 / 贝司 与原谱同一旋律，和弦改为实际音高 / 弦.品记号
        for vkey, label, expect_chord in (("g", "吉他", "Cm"), ("b", "贝司", None)):
            ctx, page, frame, errs = open_score(browser, f"cl/002?v={vkey}")
            info = frame.locator("body").evaluate("""() => ({
              chords: [...document.querySelectorAll('.chordrow span')].filter(s=>s.textContent.trim()).map(s=>s.textContent),
              marks: [...document.querySelectorAll('.fret-mark')].filter(s=>s.textContent.trim()).length,
              clickable: document.querySelectorAll('.chordrow span[data-chord]').length,
              first_clickable: !!(document.querySelector('.chordrow span[data-chord]')||{}).getAttribute,
              capo: document.getElementById('scoreCapo') ? document.getElementById('scoreCapo').textContent : ''
            })""")
            if label == "吉他":
                if not info["chords"] or info["chords"][0] != expect_chord:
                    fail(f"cl002?v=g: first chord {info['chords'][:2]} != {expect_chord}")
                if info["marks"]:
                    fail("cl002?v=g: guitar version must not render fret marks")
                if not info["first_clickable"]:
                    fail("cl002?v=g: chords are not clickable")
            else:
                if info["marks"] != 40 or info["clickable"]:
                    fail(f"cl002?v=b: expected 40 fret marks and no clickable chords ({info})")
                if info["chords"] and info["chords"][0] != "3.3":
                    fail(f"cl002?v=b: first mark {info['chords'][:2]} != '3.3'")
                if any("X" in x for x in info["chords"]):
                    fail(f"cl002?v=b: x must be lowercase: {info['chords'][:6]}")
                page.click("#v2MenuBtn"); page.wait_for_timeout(250)
                page.select_option("#v2Capo", "3"); page.wait_for_timeout(900)
                c3 = frame.locator("body").evaluate("""() => [...document.querySelectorAll('.fret-mark')]
                      .map(s=>s.textContent.trim()).filter(Boolean)""")
                if len(c3) != 40 or c3[:5] != ["3x", "3x", "3x", "4.1", "4x"]:
                    fail(f"cl002?v=b capo 3: {c3[:6]} (n={len(c3)})")
                page.select_option("#v2Capo", "0"); page.wait_for_timeout(500)
            if info["capo"]:
                fail(f"cl002?v={vkey}: capo must default to 0 (badge {info['capo']!r})")
            if errs:
                fail(f"cl002?v={vkey} page errors: " + " | ".join(errs[:3]))
            ctx.close()

        # version switch in the UI: 原谱 -> 吉他 (chords change, URL ?v=g) -> 原谱 (chords gone)
        ctx, page, frame, errs = open_score(browser, "cl/002")
        page.click(".version-toggle-button"); page.wait_for_timeout(250)
        page.click('.version-button:has-text("吉他")'); page.wait_for_timeout(2400)
        g = frame.locator("body").evaluate("""() => ({
          first: (document.querySelector('.chordrow span')||{}).textContent || '',
          marks: document.querySelectorAll('.fret-mark').length })""")
        if g["first"] != "Cm" or g["marks"]:
            fail(f"cl002 version switch to 吉他: {g}")
        if "v=g" not in page.url:
            fail(f"cl002 version switch: URL missing ?v=g ({page.url})")
        page.click(".version-toggle-button"); page.wait_for_timeout(250)
        page.click('.version-button:has-text("原谱")'); page.wait_for_timeout(2400)
        o = frame.locator("body").evaluate("""() => [...document.querySelectorAll('.chordrow span[data-chord]')]
              .filter(s=>s.textContent.trim()).length""")
        if o:
            fail(f"cl002 switch back to 原谱: still renders {o} chords")
        if "v=" in page.url:
            fail(f"cl002 switch back to 原谱: URL still has version ({page.url})")
        if errs:
            fail("cl002 version switch page errors: " + " | ".join(errs[:3]))
        ctx.close()

        # capo transposes sounding chords back to the printed shapes (Eb - 3 = C)
        ctx, page, frame, errs = open_score(browser, "cl/002?v=g")
        page.click("#v2MenuBtn"); page.wait_for_timeout(250)
        page.select_option("#v2Capo", "3"); page.wait_for_timeout(900)
        capo = frame.locator("body").evaluate("""() => ({
          first: (document.querySelector('.chordrow span')||{}).textContent || '',
          badge: (document.getElementById('scoreCapo')||{}).textContent || '' })""")
        if capo["first"] != "Am" or "Capo 3" not in capo["badge"]:
            fail(f"capo 3 should show the printed capo-3 shape (Am) with badge, got {capo}")
        page.select_option("#v2Capo", "0"); page.wait_for_timeout(500)
        ctx.close()

        # 英文模式：音色选单的群组和选项都应是英文
        ctx, page, frame, errs = open_score(browser, "cl/001")
        page.evaluate("localStorage.setItem('fhj_language','en')")
        page.reload(wait_until="load", timeout=60000)
        page.wait_for_function("() => document.querySelectorAll('#v2Timbre option').length > 0", timeout=20000)
        page.wait_for_timeout(500)
        en_list = page.evaluate(r"""() => ({
          groups: [...document.querySelectorAll('#v2Timbre optgroup')].map(g => g.label),
          opts: [...document.querySelectorAll('#v2Timbre option')].map(o => o.textContent) })""")
        cjk = r"[\u4e00-\u9fff]"
        import re as _re
        bad = [x for x in en_list["groups"] + en_list["opts"] if _re.search(cjk, x)]
        if bad or not en_list["opts"]:
            fail(f"English timbre list should contain no Chinese: {bad[:5]} (n={len(en_list['opts'])})")
        if not any("Piano" in g for g in en_list["groups"]):
            fail(f"English timbre group names missing: {en_list['groups'][:4]}")
        page.evaluate("localStorage.setItem('fhj_language','zh')")
        page.reload(wait_until="load", timeout=60000)
        page.wait_for_function("() => document.querySelectorAll('#v2Timbre option').length > 0", timeout=20000)
        zh_first = page.evaluate("() => document.querySelector('#v2Timbre optgroup').label")
        if zh_first != "钢琴":
            fail(f"Chinese timbre list should return to 钢琴, got {zh_first!r}")
        if errs:
            fail("timbre i18n page errors: " + " | ".join(errs[:3]))
        ctx.close()

        # 优先显示贝司但曲目没有贝司版时，应回落到吉他版；有贝司仍用贝司；无版本用原谱
        ctx, page, frame, errs = open_score(browser, "jt/017")
        for cat, sid, path, want in (("领主咏", "008", "lz/008", "吉他"),
                                     ("垂怜曲", "001", "cl/001", "贝司"),
                                     ("进堂咏", "017", "jt/017", "原谱")):
            page.evaluate("() => { currentState.preferredVersion = '贝司'; }")
            page.evaluate("""([cat, id]) => {
              showSong(cat, Object.assign({}, songsData.categories[cat].songs[id], {id}));
            }""", [cat, sid])
            page.wait_for_timeout(1800)
            got = page.evaluate("currentState.currentVersion")
            if got != want:
                fail(f"preferred 贝司 on {path}: currentVersion {got!r} != {want!r}")
            want_v = {"吉他": "?v=g", "贝司": "?v=b", "原谱": ""}[want]
            if want_v not in page.url:
                fail(f"preferred 贝司 on {path}: URL {page.url} missing {want_v!r}")
        if errs:
            fail("preferred fallback page errors: " + " | ".join(errs[:3]))
        ctx.close()

        # 弥撒时段防误触：播放键/点音符在时段内须先确认，非时段不弹确认
        def mass_ctx(fake_iso):
            c = browser.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
            c.add_init_script(
                "const __R=Date; class __F extends __R { constructor(...a){ "
                "if(a.length===0) super('" + fake_iso + "'); else super(...a); } "
                "static now(){ return new __F().getTime(); } } window.Date=__F;"
            )
            return c

        # 周一至周六 07:30–08:30（2026-11-18 是周三）
        cases = [
            ("weekday 07:45", "2026-11-18T07:45:00", True, True, "#v2QuickPauseBtn"),
            ("sunday 09:15", "2026-11-22T09:15:00", True, True, ".note"),
            ("sunday 20:15", "2026-11-22T20:15:00", True, True, "#v2QuickPauseBtn"),
            ("weekday 08:30 boundary", "2026-11-18T08:30:00", False, False, "#v2QuickPauseBtn"),
            ("weekday noon", "2026-11-18T12:00:00", False, False, "#v2QuickPauseBtn"),
        ]
        for name, iso, quiet, want_dialog, sel in cases:
            ctx = mass_ctx(iso)
            page = ctx.new_page()
            dialogs: list[str] = []
            page.on("dialog", lambda d: (dialogs.append(d.message), d.accept()))
            page.goto(BASE + "cl/001", wait_until="load", timeout=60000)
            page.wait_for_timeout(3000)
            fr = page.frame_locator("#v2Frame")
            got = fr.locator("body").evaluate("() => window.__hymn.isMassQuietHour()")
            if got != quiet:
                fail(f"mass guard {name}: isMassQuietHour={got} != {quiet}")
            if sel == ".note":
                fr.locator(sel).first.click(timeout=8000)
            else:
                page.locator(sel).click(timeout=8000)
            page.wait_for_timeout(1000)
            if bool(dialogs) != want_dialog:
                fail(f"mass guard {name}: dialogs={dialogs} want_dialog={want_dialog}")
            if quiet and dialogs and "彌撒" not in dialogs[0]:
                fail(f"mass guard {name}: unexpected confirm text {dialogs[0]!r}")
            ctx.close()

        # 取消确认：不得开始播放
        ctx = mass_ctx("2026-11-18T07:45:00")
        page = ctx.new_page()
        page.on("dialog", lambda d: d.dismiss())
        page.goto(BASE + "cl/001", wait_until="load", timeout=60000)
        page.wait_for_timeout(3000)
        page.locator("#v2QuickPauseBtn").click(timeout=8000)
        page.wait_for_timeout(900)
        if page.frame_locator("#v2Frame").locator("body").evaluate("() => window.__hymn.engine.playing"):
            fail("mass guard: dismissed confirm must not start playback")
        ctx.close()

        # 光荣颂三首原谱 JSON：能进入 JSON 播放器，不回落图片
        for path in ("gr/001", "gr/002", "gr/003"):
            ctx, page, frame, errs = open_score(browser, path)
            if page.evaluate("VP2UI.isImage()"):
                fail(f"{path}: should load JSON score, not fall back to image")
            if frame.locator(".bar").count() < 10:
                fail(f"{path}: too few bars rendered")
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
