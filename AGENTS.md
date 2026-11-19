# AGENTS.md — Vita Plan v2 工作指示

本文件只放入口与流程规则，不放实现细节。可由代码或测试推导的事实，以 `scripts/check_scores.py`、`tests/ui_check.py` 为准。

## 开始前
- 读 `docs/omr-checklist.md`（制谱核对与教训）。
- 改谱或前端后运行 `python3 scripts/check_scores.py`；再开 `python3 tests/serve.py 8080`，跑 `python3 tests/ui_check.py http://127.0.0.1:8080/`。CI 未过不得部署。

## 流程
- 制谱先用 `lodebar2026/dolce` 出初稿，再按 `docs/omr-checklist.md` 对照原图核对。
- 曲号沿用既有编号，永不重排；删歌留空号。
- 提交中文说明；线上为 `https://kcan.cc/`，部署前先在本地验收；不新增指向 v1/GitHub Pages 的链接。
- frozen diff 部署前由 Reviewer 独立审；高风险（auth/权限/支付/数据/secrets/对外暴露）加 Auditor；Reviewer/Auditor 不改产品码，review 前后工作树 clean。

## 维护
- 新经验只追加到 `docs/omr-checklist.md` 的「已知教训」；不要写进本文件。
- 本文件只保留指示/流程；改动需 Reviewer PASS，commit 说明写「AGENTS.md indicator change」。
- 发现问题按本文件修复，不得只报告或绕过检查。
