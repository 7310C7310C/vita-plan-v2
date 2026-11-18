# Re-review — 光荣颂 gr001/gr002/gr003 (frozen HEAD 950de2f, range f15b886..950de2f)

## 1. 裁定：FAIL

| # | 判準 | 裁定 | 摘要 |
|---|------|------|------|
| A | `check_scores.py` 独立复跑 | PASS | `OK: 13 scores, 9 mappings, manifest 3abdf69954c72c27` (exit 0) |
| B | `ui_check.py` 独立复跑 | PASS | `OK: UI checks (single voice, slurs, lyrics, accidental, dash)` (exit 0) |
| C | 上轮 blocker 1 — gr002 bar1 `3 2 3` + 全曲时值 | PASS | bar1 `[69,67,69]`=简谱 3-2-3（key F, keyBase 65）；全曲只有 0.5/1.0/2.0 三种时值，无 0.2/0.4 |
| D | 上轮 blocker 2 — gr001 乱码清除 + 逐拍对位 | **FAIL** | `thanksfor/wolrd/,we` 字面串已消失，但做法是**删字而非改字**：全曲英文歌词系统性缺词（dore/fy/thanks for/sus Christ/ten Son/mercy/Spirit 等），逐拍对位不成立 |
| E | 上轮 blocker 3 — gr002 0.2/0.4 杂讯时值 | PASS | 直方图 `{0.5:96, 1.0:34, 2.0:12}`，无杂讯 |
| F | 上轮 blocker 4 — gr003 孤儿/重复歌词 | PASS | 158 tokens 全被引用（0 orphan），连续重复 0；新增字「美/主/除」已分别挂到 bar12/18/26 |
| G | IMPORTANT — gr001 前奏和弦 | **FAIL** | 79 小节 `chords` 全为 `[]`，原图前奏 D/A/C#/Bm/F#m/A/G/Em7/Asus4/A 及全部副歌/主歌和弦均缺失 |
| H | IMPORTANT — D.S./Fine 记号 | 部分 | 渲染确有 Fine(bar34) 与 D.C. al Fine(bar79)，但原图为 **D.S.**（主歌一/二末各一），JSON 用 `dc:{from:78,to:33}` 近似；引擎 `engine.dc={stopAt:...}` 忽略 `from`，实际回到开头而非 D.S. 点。属已声明近似，记为限制 |
| I | IMPORTANT — gr002 bar12 `B` vs `Bb` | PASS | `bar12.chords=[[0,'Bb'],[1,'C']]`；原图 gr2s3 该处手写 Bb/C；全谱和弦名集合 `{A7,Am,Bb,C,Dm,F,G7,Gm}` 无裸 `B` |
| J | IMPORTANT — 伪和弦标记清除 | PASS | gr002 和弦名均为标准级数；原图涂黑/误写处未写入 JSON |
| K | 小节数对照原图 | **FAIL (gr002)** | 原图/123 初稿 58 小节（123 V:1 计数 8+7+8+8+7+7+5+3+5=58），JSON 仅 53；缺 5 小节 |
| L | 抽查首尾/变拍/段首 | **FAIL** | gr001 变拍 2/4→4/4 无 `bar.meter`，渲染全程 2/4；gr002 段首「主耶稣基督，独生子」整段丢失 |

结论：自动化门禁（A/B）与 4 个上轮 blocker 中 3 个（C/E/F）已解决；但 **D 未真正解决**，且新增/遗留 K/L/G 等阻断项。不可部署。

---

## 2. 證據（指令＋關鍵輸出＋結論）

### 自动化门禁
```
$ python3 scripts/check_scores.py
OK: 13 scores, 9 mappings, manifest 3abdf69954c72c27        # exit 0

$ python3 tests/serve.py 8137 & ; python3 tests/ui_check.py http://127.0.0.1:8137/
OK: UI checks (single voice, slurs, lyrics, accidental, dash)   # exit 0
```
注意：`ui_check.py` 只校验通用渲染/路由/布局不变量，**不校验乐谱内容正确性**；A/B 通过不能替代原图对照。

### 对照原图（逐张亲看）
- `img/光荣颂/光荣颂_002_光荣颂_1.jpeg` + `sys/gr2s1..6.png`
- `img/光荣颂/光荣颂_001_Glory To God_1.jpeg`、`_2.jpeg` + `sys1/p1s1..8.png`、`p2s1..8.png`
- `img/光荣颂/光荣颂_003_光荣颂_1.jpeg`
- 渲染截图 `gr1-render3.png`、`gr2-render2.png`、`gr3-render2.png`

###  blockers 证据

**(D1) gr001 歌词系统性缺词** — 原图 vs JSON/渲染逐字对照：
| 小节 | 原图 | JSON/渲染 |
|---|---|---|
| b17/b36-37 | `we a-dore you,` | `wea-you,` （缺 dore） |
| b38-39 | `we glo-ri-fy you,` | `weglo-ri- / you,` （缺 fy） |
| b40-42 | `we give you thanks for your great glory,` | `wegiveyou / yourgreat / glo-ry,` （缺 thanks for） |
| b47-50 | `Lord Jesus Christ, only begotten Son, Lord God, Lamb of God, Son of the Father.` | `LordJe- / On-lyBe-got- / LordGod,Lamb / SonofFa-` （缺 sus Christ / ten Son / of God） |
| b53/b63 | `have mercy on` | `havemer-on` （缺 cy） |
| b65-75 | `For you alone are the Holy One ... you alone are the Most High, Jesus Christ, with the Holy Spirit, in the glory of God the Father.` | `on / youa-lonearethe / youa-lone / Lord / youloneare / Je-susChrist / withthe / Ho-ly / inthe / of / ther.` （缺 For/Holy One/Most High/Spirit/glory of God the Father） |

证据：`python3` 打印 `''.join(lyrics[0])` 得 `...praiseyou,blessyou,wea-you,weglo-ri-you,wegiveyouyourgreatglo-ry,...`；`grep -c 'thanksfor\|wolrd\|,we'` 全为 0（字面串清除），但缺词取代了改字，逐拍对位失败。原图 `光荣颂_001..._1.jpeg` 第 3/4 行、`_2.jpeg` 全页为证。

**(D2/K) gr002 缺整段与缺字**：
- 原图 `sys/gr2s3.png`：上系统 `...感谢 你。 | 1 1 1 2 | 3 5 6`，下系统起 `3 - 子。`，歌词「**主耶稣基督，独生子。**」；JSON b22(`你`) 直接跳 b23(`主天`)，整段「主耶稣基督，独生子」的音符与歌词都不存在。`grep '独生'` gr002 JSON = 0；123 初稿 `光荣颂_002..._1.123` 明写「主耶稣基督，独生」+「子。」
- 原图 `sys/gr2s4.png`：`...的祈祷。| 3 3 3 5` 歌词「**坐在圣父**」，下系统 `6 5 3` 歌词「之右者」；JSON b36(`的祈祷`) 直接跳 b37(`之右者`, notes `[62,60,69]`=`6 5 3`)。`grep '坐在圣父'`/`'求你俯听'` gr002 JSON = 0（为 `求俯听`）。
- 123 初稿 V:1 计数 58 小节，JSON 53 小节，缺 5 小节。渲染截图 `gr2-render2.png` b22→b23、b36→b37 均无过渡，可直接看到跳段。

**(G) gr001 前奏和弦全丢**：
```
python3: gr001 chords = []  （79/79 小节 chords:[]，bar.meter=[]，marks=[]）
```
原图 `光荣颂_001..._1.jpeg` 「前奏」行清楚印有 D / A/C# / Bm / F#m/A / G / Em7 / Asus4 / A；副歌/主歌每行亦有和弦。`gr1-render3.png` 全谱无任何和弦字符。

**(L) 变拍未编码**：
```
grep bar.meter player-frame.html:1455: if(bar.meter){... if(bi===0 || bar.meter!==prevMeter) show meter }
gr001 bar meters = []  →  全程显示 2/4
```
原图 page1「of good | 4/4 will.」明确从 2/4 变 4/4；JSON 仅用 `beats` 4 表达拍数，没有 `meter:"4/4"`，播放器不会在变拍处显示 4/4。DOM 探针：`barMeters=[]`。

### 已解决项证据
- gr002 bar1 `[0,1.0,69][1.0,0.5,67][1.5,0.5,69]`：`keyBase=65`(F)→ 69=A=`3`, 67=G=`2` → 3-2-3；`sys/gr2s1.png` 原图首节确为「3 2 3」。
- gr002 时值直方图 `{0.5:96, 1.0:34, 2.0:12}`；无 0.2/0.4。
- gr003 token 审计：`158 tokens, 158 used, 0 unused`；连续重复 0；「美/主/除」分别用于 b12/b18/b26，原图相应处确有这些字。
- gr002 bar12 `Bb`（非裸 B）；无伪和弦名。

---

## 3. 問題（最小重現＋影響＋建議修法；阻斷 > 重要 > 次要）

### 阻斷 1 — gr001 英文歌词系统性缺词（D 未解决）
- 最小重现：`python3 -c "import json;print(''.join(json.load(open('data/scores/gr/001.json'))['lyrics'][0]))"` 与 `光荣颂_001..._1.jpeg/_2.jpeg` 对照 b17/b37-42/b47-50/b53/b63/b65-75。
- 影响：歌词与音符逐拍错配，敬拜/播放时唱错，属核心内容错误。字面乱码串清除是**假修复**（删字代替改字）。
- 建议（交 Builder）：按两页原图逐字重录英文歌词，补齐 `a-dore`/`glo-ri-fy`/`thanks for`/`Jesus Christ`/`begotten Son`/`of God`/`mercy`/`For`/`Holy One`/`Most High`/`Spirit`/`glory of God the Father` 等，保证 `lyrics[0]` token 数与实际音节数一致、每个 syl 指向正确拍；不要以删词方式消除乱码。

### 阻斷 2 — gr002 缺整段「主耶稣基督，独生子」及「求你俯听…坐在圣父之右者」
- 最小重现：`grep -c '独生\|坐在圣父\|求你俯听' data/scores/gr/002.json`（全 0）；对照 `sys/gr2s3.png`/`gr2s4.png` 与渲染 `gr2-render2.png` b22→b23、b36→b37。
- 影响：缺 5 小节音符与歌词（123 初稿 58 → JSON 53），「主耶稣基督，独生子」整句丢失、「求你俯听」缺「你」、「祈祷」与「之右者」间缺「。坐在圣父」。
- 建议：按原图补回缺失小节（含音符/时值/八度点/歌词/和弦），或明确说明为何有意省略并出示用户裁决；补后重算小节数与 manifest。

### 阻斷 3 — gr001 前奏及各段和弦全丢（G）
- 最小重现：`python3` 输出 gr001 `chords=[]`；原图前奏 8 小节 D/A/C#/Bm/F#m/A/G/Em7/Asus4/A。
- 影响：伴奏信息完全缺失，与前两轮「补和弦」目标相反。
- 建议：按原图逐小节写入 `chords:[[beat,name],...]`（前奏 8 小节至少 8 个和弦；副歌/主歌各行照原图），重跑 `check_scores.py` 与 manifest。

### 重要 4 — gr001 变拍 2/4→4/4 未编码（L）
- 最小重现：gr001 `bar meters=[]`；DOM `barMeters=[]`；原图 page1 有 4/4 变拍记号。
- 影响：渲染全程 2/4，4 拍小节缺拍号标记，演奏者无法识别变拍。
- 建议：在变拍首小节写 `meter:"4/4"`（结束段回到 2/4 的若有则 likewise），由播放器 `bar.meter` 分支自动显示。

### 次要 5 — D.S./Fine 近似（H）
- 现状：JSON `dc:{from:78,to:33}` 渲染 Fine(bar34)+D.C. al Fine(bar79)；原图为 D.S.（主歌一/二末）。
- 影响：反复结构与原图不一致；引擎忽略 `dc.from`，回到谱首而非 D.S. 点。
- 建议：若需精确，实现 D.S./segno（在 `dc` 增 `segnoFrom` 并让引擎跳到该小节）；否则在交付说明中明确记录为已知近似（当前已声明）。

### 次要 6 — gr003 第二处「除免世罪者」缺「除」
- gr003 b29 歌词为「免世罪者，」（token 84 起），原图第二处为「除免世罪者，」。
- 建议：补 token「除」并按拍挂到 b29 首音。

---

## 4. 殘餘風險與未驗項
- **未验**：gr001 前奏/副歌音符时值与八度点未逐音核对（仅核 bar1/段首/末尾与歌词）；gr003 逐音时值未全量核对（本轮范围外）。
- **方法盲点**：`ui_check.py` 不验证乐谱内容，A/B 通过不代表内容正确；原图为手写/扫描件，个别八度点靠放大裁切判读，存在视觉判读误差可能。
- **已知限制**：gr001 以 D.C. al Fine 近似 D.S.（见次要 5）；生产站未部署，本轮仅本地 8137 端口复跑。

---

## 5. tree／HEAD／工作树状态
- Frozen HEAD：`950de2f82d4e5f7592543256dcec7a224a6dda46`
- HEAD tree：`31042ee054a8e83f9e29884605988e8fd294845f`
- 审查范围：`f15b886..950de2f`（本轮 diff 实际只含 `8db2288` gr002、`950de2f` gr001；gr003 在基线 f15b886，另作内容复核）
- 变更文件（range）：`data/scores/gr/001.json`、`data/scores/gr/002.json`、`data/v2-manifest.json`
- 工作树：review 前 `git status --porcelain` 空；review 后 tracked 文件仍空（HEAD/tree hash 前后一致）。唯一新增为本报告 `.team/reviews/gr-recheck-950de2f.md`（untracked review artifact，非产品码；临时探针均在 `/tmp/opencode/review/`，测试服务器已关）。
