# Re-review #3 — 光荣颂 gr001/gr002 (frozen HEAD a1058fc, range 950de2f..a1058fc)

## 1. 裁定：FAIL

| # | 判準 | 裁定 | 摘要 |
|---|------|------|------|
| A | `check_scores.py` | PASS | `OK: 13 scores, 9 mappings, manifest 4a5083b9ac3f0e1a` |
| B | `ui_check.py` | PASS | `OK: UI checks (...)` |
| C | 上轮 blocker 1 — gr001 英文系统性缺词 | **FAIL** | 字面补了 dore/for，但逐段仍系统性缺词（约 15 处），且**倒退**删掉 `will.`；核心 blocker 未解决 |
| D | 上轮 blocker 2 — gr001 前奏/各段和弦 | PASS | 78/79 小节有和弦；intro D/A/C#/Bm/F#m/A/G/Em7/Asus4/A 与原图逐节一致；DOM 探针确认渲染 |
| E | 上轮 blocker 3 — gr001 变拍 | PASS | bar24 `meter:"4/4"`，DOM 在 bar index 23 显示 "44"，位置正确 |
| F | 上轮 blocker 4 — gr002 补段 | 部分 | 补了 4 小节（现 57），「主耶稣基督」「坐在圣父之右者」已出现；但「独生」仍缺「生」（成「独子」），「求你俯听」仍缺「你」 |
| G | gr003 b29「除」缺字（次要项） | 仍存在 | b29 token = 免/世/罪/者，仍无「除」 |

结论：门禁绿、blocker 2/3 解决、blocker 4 部分解决；**blocker 1（歌词）未解决且有倒退**，不可部署。

---

## 2. 證據

### 门禁
```
$ python3 scripts/check_scores.py
OK: 13 scores, 9 mappings, manifest 4a5083b9ac3f0e1a        # exit 0
$ python3 tests/ui_check.py http://127.0.0.1:8141/
OK: UI checks (single voice, slurs, lyrics, accidental, dash)   # exit 0
```
`ui_check` 不验谱面内容，不能替代原图对照。

### C — gr001 歌词（对照 `sys1/p1s4..p1s6.png`、`p2s1..p2s3.png`、原图 `_1.jpeg/_2.jpeg`）

逐段抽检 10+ 小节，原图 vs JSON（token 逐字）：

| 小节 | 原图 | JSON | 问题 |
|---|---|---|---|
| b23-26 | `to peo-ple of good will.` | `topeo- / pleof / good / (空)` | **`will.` 整词丢失**（上轮还在 `goodwill.`，本轮倒退）；b26 空但应承载 will. |
| b35-36 | `praise you, we bless you,` | `praise / you, / we` + `we / bless / you,` | **重复 `we`** → "we we bless you" |
| b37-39 | `we a-dore you, we glo-ri-fy you,` | `we / a- / dore` + `we / glo- / ri-` + `you,` | 缺 `you,`（a-dore 后）、缺 `fy` |
| b40-42 | `we give you thanks for your great glo-ry,` | `we / give / you` + `for / your / great` + `glo- / ry,` | **缺 `thanks`**（本轮只补了 for） |
| b45-46 | `O God, al-might-y Fa-ther.` | `O / God, / al- / might-` + `Fa- / ther.` | 缺 `y` |
| b47-49 | `Lord Je-sus Christ, On-ly Be-got-ten Son,` | `Lord / Je-` + `On- / ly / Be- / got-` + `Lord / God, / Lamb` | **缺 `sus Christ,`、`ten Son,`**；整小节数少 1 |
| b49-50 | `Lord God, Lamb of God, Son of the Fa-ther,` | `LordGod,Lamb` + `Sonofthe` | 缺 `of God,`；`Fa-ther` 被 `the` 取代 |
| b51-56 | `you take a-way the sins of the world, have mer-cy on us; you take a-way the sins of the world,` | `takea-waythe / sinsoftheworld, / havemer-cy / youtake / sinsofthe / world,` | 缺第二个 `you`、`away the`、`on us;`；首 `you` 缺 |
| b59-60 | `you are seat-ed at the right hand of the Fa-ther,` | `youareseat-ed` + `righthand` | 缺 `at the` |
| b65-75 | `For you a-lone are the Ho-ly One, ... you a-lone are the Most High, Je-sus Christ, with the Ho-ly Spir-it, in the glo-ry of God the Fa-ther.` | `on / youa-lonearethe / youa-lone / Lord, / youa-lone / Je-susChrist, / withthe / inthe / ofGod / Fa- / Fa-ther.` | 缺 `For`、`Ho-ly One`、`are the Most High`、`Ho-ly Spir-it,`、`glo-ry`；`Fa-` 重复 |

计数证据：
```
grep -c: dore=1, for=1, sus=1, Christ=1
         thanks=0, begotten=0, "ten Son"=0, mercy=0, Spirit=0,
         "Holy One"=0, "Most High"=0, "glory of God the Father"=0, "will."=0
```
维修方声称补回的 `you,/dore/for/ten Son`：**仅 dore、for 落地**；`ten Son` 计数 0，`you,` 落到了错误位置（b39 属 glo-ri-fy，非 a-dore）。`will.` 由上轮的 `goodwill.` 变成 `good`，属**倒退**。

### D/E — 和弦与变拍（DOM 探针 `probe_r2.py`）
```
barMeters = [{bar:'23', t:'44'}]               # bar24 = 4/4，位置正确
introChords bar0..8 = D, A/C#, Bm, F#m/A, G, Em7, Asus4, A, D   # 与 p1s1 原图逐节一致
dcTags = [{bar:'33',t:'Fine'},{bar:'78',t:'D.C. al Fine'}]
```
逐节核对 b9-b79 和弦与两页原图各和弦行一致（含 verse1 Em/A、D/D/F#、Em/G/A、A/A/G、D/F#/Bm7…；verse2/3 各节均吻合）。前奏 8 小节和弦确实恢复。

### F — gr002 补段（对照 `sys/gr2s3.png`、`gr2s4.png`）
```
bars 53→57；lyrics 含 '主耶稣基督'×1、'坐在圣父'×1、'之右者'×1
但 '独生'×0、'求你俯听'×0
b23 主耶稣基 | b24 督,独 | b25 子        → 原图「主耶稣基督，独生子」，缺「生」
b37 者，求 | b38 俯听我们               → 原图「求你俯听」，缺「你」
```
补回的小节音符与原图 `1 1 1 2 | 3 5 6 | 3 -`（b23-25）、`6 5 3`（b41）吻合；仅歌词字面仍缺 2 字。首段时值已修正（原图 gr2s1「3 2 3」对应 b1 `[69,67,69]`）。

### G — gr003 b29
```
b29 tokens = [(84,'免'),(85,'世'),(86,'罪'),(87,'者，')]   # 仍无「除」
b26 有「除」(首处)，第二处 b29 仍缺。
```

---

## 3. 問題（阻斷 > 重要 > 次要）

### 阻斷 1 — gr001 英文歌词仍系统性缺词且倒退（C 未解决）
- 最小重现：`python3 -c "import json;print(''.join(json.load(open('data/scores/gr/001.json'))['lyrics'][0]))"` 对照 `p1s4/p1s6/p2s1/p2s2`。
- 影响：约 15 处缺词/重复/倒退，逐拍对位仍不成立；`will.` 丢失是本轮新增倒退。
- 建议：不要用「删/挪 token」方式凑音符数。应**先按原图列出完整歌词音节序列**，再让每个音节落到对应非休止音符；对 `praise you, we bless you, we a-dore you, we glo-ri-fy you, we give you thanks for your great glory` 与 `Lord Jesus Christ, only begotten Son`、`For you alone are the Holy One ... Most High ... with the Holy Spirit, in the glory of God the Father` 逐段补齐。可用 `gr001-reference.txt` 的 C: 行作权威文本（去掉 `~ @ / {}` 标记即为正确歌词），不要把它当乱码删字。补后逐段抽 10+ 小节再验。

### 阻斷 2 — gr002 补段仍缺「生」「你」（F 部分解决）
- 最小重现：`grep -o '独生\|求你俯听' data/scores/gr/002.json` = 0；对照 `gr2s3.png`/`gr2s4.png`。
- 建议：b24 第三个音符（原图「6」）补 token「生」→「督，独生」；b37/b38 间补「你」→「求你俯听」。确认后再数小节与 manifest。

### 次要 3 — gr003 b29 缺「除」（G，上轮次要项仍在）
- 建议：b29 首音补「除」，与 b26 首处一致。

### 次要 4 — D.S. 近似（承上轮，未变）
- JSON `dc:{from:78,to:33}` 渲染 D.C. al Fine，原图为 D.S.；引擎忽略 `dc.from`。属已声明近似，维持记录。

---

## 4. 殘餘風險／未驗項
- `ui_check` 不验内容，A/B 绿不能作内容正确证据。
- gr001 前奏/副歌逐音时值与八度点、gr003 逐音时值未全量核对；手写扫描件八度点靠放大判读，有视觉误差可能。
- 生产站未部署，仅本地 :8141 复跑；`gr001-reference.txt` 的歌词正确性本轮未逐字机器比对（仅人工按原图核对抽样段落）。

---

## 5. tree／HEAD／工作樹狀態
- Frozen HEAD：`a1058fc45a6210ce0ee87716cfee5ff6149ed965`
- HEAD tree：`ba2696e8f31979dd3bdbac7b57788034c16b77d8`
- 範圍：`950de2f..a1058fc`（單筆 `a1058fc`，含 `data/scores/gr/001.json`、`002.json`、`v2-manifest.json`，另含上一輪報告 `.team/reviews/gr-recheck-950de2f.md` 被一併提交）
- 工作樹：review 前後 `git status --porcelain` 皆空；HEAD/tree hash 前後一致。唯一新增為本報告 `.team/reviews/gr-recheck-a1058fc.md`（untracked review artifact，非產品碼）；探針在 `/tmp/opencode/review/`，測試伺服器已關。產品碼未動。
