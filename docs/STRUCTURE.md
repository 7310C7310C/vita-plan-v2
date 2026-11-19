# 项目结构 / 路径契约

本仓库是**无构建**的静态 PWA：nginx 直接以仓库根目录为站点根，GitHub Pages 也以仓库根目录发布。  
因此 **文件路径就是线上 URL**。整理结构时，优先保持运行时路径不变。

## 目录职责

| 路径 | 作用 | 状态 |
|---|---|---|
| `index.html` | 唯一入口（首页、分类、查看器外壳） | runtime，勿改名 |
| `404.html` | GitHub Pages 的 SPA fallback，必须与 `index.html` 完全一致 | generated copy |
| `player-frame.html` | 乐谱 iframe 外壳 | runtime，勿改名 |
| `sw-v2.js` | 唯一 Service Worker；SHELL 与版本号在此维护 | runtime |
| `favicon.ico` | 站点图标 | runtime |
| `assets/css/` | 主站样式（`style.css`）与 v2 控件样式（`v2-ui.css`） | runtime |
| `assets/js/` | 主站逻辑（`script.js`）、v2 桥接（`v2-ui.js`）、后台缓存（`v2-cache.js`） | runtime |
| `assets/player/` | 乐谱渲染器的 CSS / JS（由 `player-frame.html` 拆分） | runtime |
| `data/songs.json` | 图片谱目录：分类、曲号、标题、版本、页码 | source |
| `data/v2-scores.json` | 可播放 JSON 谱的映射（分类代码 → 文件/版本） | source |
| `data/scores/<code>/` | 可播放 JSON 谱文件 | source |
| `data/v2-scores.js` | `v2-scores.json` 的运行时 JS 包装 | generated，勿手改 |
| `data/v2-manifest.json` | JSON 谱缓存清单（hash/size/version） | generated，勿手改 |
| `data/chords-guitar.json` | 吉他和弦指法库（MIT） | source |
| `img/<分类>/` | 图片谱内容资产 | content |
| `admin/` | `admin.kcan.cc` 独立后台；发布时同步主站文件 | sub-app |
| `scripts/` | 校验与生成脚本 | dev |
| `tests/` | Playwright UI 检查与本地静态服务器 | dev |
| `docs/` | 制谱核对清单、本结构说明 | dev |
| `tools/` | 独立小工具：`storage-test.html`、`transpose/`、`random-notes/` | standalone |
| `key/`、`random/` | 旧工具路径的重定向 stub，仅用于兼容旧链接 | legacy stub |
| `.github/workflows/` | CI 校验与 VPS 部署 | infra |

## 运行时路径契约

以下路径对外公开，**不得随意改名或移动**：

```text
/index.html
/404.html
/player-frame.html
/sw-v2.js
/data/songs.json
/data/v2-scores.js
/data/v2-manifest.json
/data/scores/<code>/<id>[-v].json
/img/<分类>/<文件名>
/assets/player/player.css
/assets/player/player-boot.js
/assets/player/player-main.js
/assets/player/player-chords.js
```

如果确实必须改路径：保留旧路径的 stub 或 nginx 301 至少一个发布周期，并在**同一个 commit** 内同步更新 `index.html`、`404.html`、`sw-v2.js` SHELL、`scripts/check_scores.py`、`tests/ui_check.py`、`admin/admin.js` 和 nginx。

## 生成关系

| 产物 | 来源 | 生成命令 |
|---|---|---|
| `data/v2-scores.js` | `data/v2-scores.json` | `python3 scripts/generate_v2_manifest.py` |
| `data/v2-manifest.json` | `data/scores/**/*.json` | `python3 scripts/generate_v2_manifest.py` |
| `404.html` | `index.html` 的逐字节副本 | 手工复制；CI 校验一致 |

`sw-v2.js` 的 `SHELL` 必须包含 `index.html` / `player-frame.html` 当前引用的带版本资源；版本号变化时同步更新，否则 `scripts/check_scores.py` 会失败。结构性改动（新增/删除 shell 文件）还要提升 `SHELL_CACHE` 版本。

## 命名与改动规则

- 新代码文件用 lowercase-kebab-case；不再新增 `v2-` 前缀（本仓库本身就是 v2）。
- 生成物加 `AUTO-GENERATED` 头，禁止手改。
- `data/songs.json` 与 `data/v2-scores.json` 的曲号/标题必须一致；新增可播放谱时两边一起改。
- 改谱或前端后依次运行：
  ```bash
  python3 scripts/check_scores.py
  python3 scripts/check_agents.py
  python3 tests/serve.py 8080
  python3 tests/ui_check.py http://127.0.0.1:8080/
  ```
- v1 的离线栈（`sw.js`、`offline.js`、`offline-manifest.json`）已从本仓库移除；v1 归档在 `v1.kcan.cc`，不要在本仓库恢复。
