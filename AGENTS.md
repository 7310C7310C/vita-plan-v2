# AGENTS.md — Vita Plan v2 强制规则

本文件为 agent/开发者指示入口，优先于一般习惯。改仓库前先读；违反规则不得提交/部署。可由代码推导的事实不写在此，以 `tests/check_scores.py` 与 `tests/ui_check.py` 为准。

## 必读
- `README.md`：用户手册/生产口径。
- `docs/omr-checklist.md`：OMR 制谱核对清单与经验教训。
- `scripts/check_scores.py`、`tests/ui_check.py`：提交前必须跑。

## 强制检查（CI 不过则不能部署）
```bash
python3 scripts/check_scores.py
python3 tests/serve.py 8080 &
python3 tests/ui_check.py http://127.0.0.1:8080/
```
`.github/workflows/deploy.yml` 的 `validate` job 跑同一组检查；`deploy` 依赖 `validate`。

## 高层不变量（不可由代码推导）
- 制谱前按 `docs/omr-checklist.md` 使用 `lodebar2026/dolce` 作为初稿；Dolce 输出只作初稿，视觉排版与歌词边界按原图核对。
- 曲号沿用既有编号，永不重排；删歌留空号。
- 版本谱（g/b/a）必须与原谱同旋律的小节数/歌词/连音线一致；登记于 `data/v2-scores.json` 的 `versions`，`versionCode` 必须一致。
- 改前端资源或 `player-frame.html` 后：同步升 `?v=`、`sw-v2.js` 的 `SHELL_CACHE`，并把 `index.html` 复制为 `404.html`。
- 提交中文说明；staging `v2.kcan.cc` 验收后再谈 root；v2 不新增指向 v1/GitHub Pages 的对外链接。

## 评审
- 任何 frozen diff 部署前由 Reviewer 独立审；高风险（auth/权限/支付/数据/secrets/对外暴露）加 Auditor。
- Reviewer/Auditor 不改产品码；review 前后工作树必须 clean。

## 维护约定
- 新经验/教训只追加到 `docs/omr-checklist.md` 的「已知教训」；不得追加到本文件。
- 可由代码推导的事实以 tests/check_scores.py 为准，不写入本文件。
- 本文件结构/内容变更需 Reviewer PASS，并在 commit 说明写「AGENTS.md indicator change」。
- 本文件不得包含 OMR 细则、JSON 格式、功能需求或实现细节。
```<|end|><|start|>startup<|channel|>analysis <|constrain|>xml<|message|><rfl:parameter name="path">
/root/work/vita-plan-v2/docs/omr-checklist.md