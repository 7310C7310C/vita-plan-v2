# Re-review #4 — 光荣颂 (frozen HEAD 4a001e1, range a1058fc..4a001e1)

## 1. 裁定：FAIL（仅剩 gr002 一项，且本轮 diff 根本未含 gr002）

| # | 判準 | 裁定 | 摘要 |
|---|------|------|------|
| A | `check_scores.py` | PASS | `OK: 13 scores, 9 mappings, manifest 6ab6b62049a5543e` |
| B | `ui_check.py` | PASS | `OK: UI checks (...)` |
| C | gr001 歌词缺词全补（thanks/mercy/Spirit/Holy One/Most High/two you/away the 等） | **PASS** | 与参考 C 行字符级相似度 0.9926；177 音符 1:1 全带词，无 orphan/重复；前奏 8 小节无词；仅差 3 处非歌词性问题（见下） |
| D | gr001 逐字对位（副歌/主歌一二三，10+ 小节） | PASS | 逐小节对照原图与参考档，逐字吻合（详见证据） |
| E | gr001 前奏无歌词 + 和弦 + bar24 4/4 | PASS | intro b1-8 无词；78/79 小节有和弦；DOM bar index 23 显示 "44" |
| F | gr002「督,独生」「者，求你」到位 | **FAIL** | 本轮 diff **未包含** `data/scores/gr/002.json`（SHA 与上轮逐字节相同）；b24 仍「督,独」缺「生」，b37 仍「者，求俯听」缺「你」 |
| G | gr003 b29「除免世罪者」 | PASS | token 由「免」改为「除免」，b29 现「除免世罪者，」 |

结论：本轮 gr001 主 blocker 真正解决；gr003 次要项解决。但**上轮遗留的 gr002 两项（生/你）在承诺修正后仍未落地**——该档不在本次 frozen diff 中，字节与上轮完全相同。不可部署。若 gr002 两项确实已在别处修好，须重新冻结含 gr002 的 HEAD 再审。

---

## 2. 證據

### 门禁
```
$ python3 scripts/check_scores.py    → OK: 13 scores, 9 mappings, manifest 6ab6b62049a5543e
$ python3 tests/ui_check.py http://127.0.0.1:8143/  → OK: UI checks (...)
```

### C/D — gr001 歌词（对照 `gr001-reference.txt` C 行 + 原图 `sys1/p1s*.png`、`p2s*.png`）

参考档 C 行字符级比对：
```
EXPECTED len=611  ACTUAL len=604  similarity=0.9926
差异仅 3 处：
  delete '2.3.For'  → 段号标签（C2/C3 的「2.」「3. For」），原图标为段落标号，非演唱歌词，省略合理
  delete '-'        → expected "heav'n-ly" vs actual "heav'n-ly"：一处连字符位置差异（b41-42 "heav'" / "nly"）
  insert ' '        → "Sonof theFa-ther" 中一个空格（token 'of the' 分词，渲染无碍）
```
上轮全部缺词已补齐，逐段抽验（对照原图 crop）：
- 副歌 b9-25：`Glo-ry to God.`×3 `in the high-est, and on earth peace, on earth peace to peo-ple of good will.` ✓（p1s3/p1s4）
- 主歌一 b30-49：`praise you, we bless you, we a-dore you, we glo-ri-fy you, we give you thanks for your great glo-ry, Lord God, heav'n-ly King, O God, al-might-y Fa-ther. Lord Je-sus Christ, On-ly Be-got-ten Son` ✓（p1s6）——`thanks`(b38)、`glo-ri-fy`(b36-37)、`dore`(b35)、`Be-got-ten Son`(b48) 全到
- 主歌二 b49-66：`Lord God, Lamb of God, Son of the Fa-ther, you take a-way the sins of the world, have mer-cy on us; you take a-way the sins of the world, have mer-cy on us.` ✓（p2s2/p2s3/p2s4）——两个 `you`(b51/b55)、两个 `a-way the`(b52/b56-57)、`mer-cy`(b54-55/b64-65) 全到
- 主歌三 b66-79：`you a-lone are the Ho-ly One, you a-lone are the Lord, you a-lone are the Most High, Je-sus Christ, with the Ho-ly Spir-it, in the glo-ry of God the Fa-ther.` ✓（p2s5/p2s6）——`Ho-ly One`(b67-68)、`Most High`(b72)、`Ho-ly Spir-it`(b75-76) 全到

结构审计：
```
bars9-79: total notes=177, with lyric=177, without lyric=0
distinct tokens used=177/177, unused=[], used>1=[]
bars1-8 (intro): 全部无歌词 ✓
```
`wolrd`(b58) 保留：原图 p2s3 第二处确印 `wolrd`（第一处 `world`），参考档亦为 `wolrd~`，属源谱拼写，按 AGENTS 不擅改源谱——非缺陷。

### E — 和弦/变拍（DOM `probe_r3.py`）
```
barMeters = [{bar:'23', t:'44'}]    # bar24 = 4/4，位置正确
introChords bar0..8 = D, A/C#, Bm, F#m/A, G, Em7, Asus4, A, D  # 与 p1s1 原图一致
nChordBars = 78, dcTags = Fine@33 / D.C. al Fine@78
```

### F — gr002 未修（阻断）
```
$ git show a1058fc:data/scores/gr/002.json | sha256sum
  1b4f7e19...5826
$ git show HEAD:data/scores/gr/002.json | sha256sum
  1b4f7e19...5826        ← 完全相同
$ git diff a1058fc..HEAD -- data/scores/gr/002.json
  (无输出)
$ git show --stat HEAD   → 4a001e1 仅含 001.json / 003.json / manifest / 上轮报告
```
当前实际内容（对照原图 `sys/gr2s3.png`、`gr2s4.png`）：
- b23-b25 = `主耶稣基 / 督,独 / 子` → 拼成「主耶稣基督,**独子**」，原图「主耶稣基督，**独生子**」，缺「生」
- b37-b38 = `者，求 / 俯听我们` → 拼成「者，求俯听」，原图「除免世罪者，**求你俯听**」，缺「你」

### G — gr003 b29
```
git diff: "免" → "除免"  → b29 = 除免世罪者， ✓（原图 gr003 第 7 行「除免世罪者，求你垂怜我」）
```

---

## 3. 問題

### 阻斷 1 — gr002「生」「你」未落地（F）
- 最小重現：`git show HEAD:data/scores/gr/002.json | grep -o '独生\|求你俯听'` 无匹配；对照 b24/b37 与原图 gr2s3/gr2s4。
- 影響：上轮承诺修正但未进入 frozen diff；gr002 仍两处缺字，歌词与原图不符。
- 建议：Builder 在 gr002 b24 补「生」（`督,独生`）、b37 补「你」（`者，求你`），重跑 manifest，重新冻结一个含 gr002 的 HEAD，我再复审。注意 `check_scores.py` 不校验歌词字面，必须人工对照原图。

（gr001 与 gr003 无阻断项。）

---

## 4. 殘餘風險／未驗項
- `ui_check` 不验谱面内容；A/B 绿不作内容证据。
- gr001 两处极轻微差异：`heav'n-ly` 连字符位置、一个空格——不影响演唱/对位，列为次要。
- 逐音时值/八度点未全量核对；扫描件八度点靠放大判读有视觉误差可能；生产站未部署。

## 5. tree／HEAD／工作樹狀態
- Frozen HEAD：`4a001e1fecf2235c8f40801efda1da9d1a8cf33b`
- HEAD tree：`930db79e75e98e91fc3f3bd15d2c3874b9516ad9`
- 範圍：`a1058fc..4a001e1`。实际改动档：`gr/001.json`、`gr/003.json`、`v2-manifest.json`、上轮报告。**`gr/002.json` 不在本 diff。**
- 工作樹：review 前后 `git status --porcelain` 皆空，HEAD/tree hash 前后一致；本报告写入 `.team/reviews/`（untracked artifact，非产品码），探针在 `/tmp/opencode/review/`，测试服务器已关。产品码未动。
