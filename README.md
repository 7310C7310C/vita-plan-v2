# 复活计划乐队 · v2

> 本仓库是 **v2**。v1 的 README 与说明已全部废弃，不再沿用。
>
> v2 以 v1 的站点外观、分类、搜索、收藏与后台为基础，播放器改为读取 JSON 乐谱；v1 保留在独立仓库与 `v1.kcan.cc`，v2 不改动 v1。

## 地址

| 环境 | 地址 |
| --- | --- |
| Staging | <https://v2.kcan.cc/> |
| 生产（待切换） | <https://kcan.cc/> |
| v1（保留） | <https://v1.kcan.cc/> |
| GitHub Pages 备份 | 仓库 Pages（不对外链接，仅灾备） |

## 当前状态

- 已完成 v2 基础站、播放器、标注、离线 JSON、admin 登录/读取。
- 已数字化 4 首：`jt/017`、`lz/008`、`lz/019`、`lz/020`。
- 其余歌曲仍只有 v1 图片谱；全站数字化是后续主線。
- 正式上线前：`v2.kcan.cc` 验收 → 切 `kcan.cc` root → v1 留 `v1.kcan.cc` → 清理 v1 的 `/001`、`/tmp`。

## 与 v1 的边界

- v2 任何页面**不链接** v1，也不链接 GitHub Pages；对外只走 `kcan.cc`。
- v1 是独立仓库/独立站点；v2 的更新不得影响 v1。
- v2 复用 v1 的 `assets/css/style.css`、`assets/js/script.js` 作为站点外壳，但播放器为 `player-frame.html`。

## 功能

- 首页、搜索、分类、本周歌曲、最近查看、收藏。
- 默认显示 JSON 乐谱；顶栏「图片谱」按钮切到对应图片版本，再点「返回」回 JSON。
- 版本：原谱 / 贝司 / 吉他 / 备选；URL 使用 `?v=o|b|g|a`。
- 顶栏：收藏、面包屑、图片谱、菜单、播放/暂停图标、关闭；窄屏新谱下收藏+面包屑一行，其余按钮换行靠左。
- 播放器菜单：声部（含全选）、节拍器、速度、音量、音色（128 种/16 组）、字号、跟随播放、夜间、简繁、重置。
- 标注：点击或拖框选择音符，红圈/圆角矩形包住；可加半透文字；支持保存、清空、橡皮擦、撤销、重做；标记存本机。
- 底栏：上一首、版本、标注（原涂改位置）、自动换行、下一首。
- 离线：壳与全部 JSON 谱可离线；图片、OpenCC、字体不保证离线。
- 中英界面：只翻 UI/分类，不翻曲名与歌词。

## 路由

| 路径 | 说明 |
| --- | --- |
| `/` | 首页 |
| `/weekly` | 本周歌曲 |
| `/{code}` | 分类 |
| `/{code}/{id}` | 歌曲 |
| `?v=o/b/g/a` | 原谱/贝司/吉他/备选 |

分类码：

```text
jt 进堂咏   cl 垂怜曲   gr 光荣颂   dc 答唱咏（朱健仁）
fy 福音前欢呼 fx 奉献咏  tz 天主经   lz 领主咏
lc 礼成咏   sd 圣诞     ss 圣神     by 备用
qt 其他
```

编号沿用 v1，永不重排；删歌留空号。

## 乐谱数据

- 乐谱：`data/scores/{code}/{id}.json`
- 运行时映射：`data/v2-scores.json` → 构建时生成 `data/v2-scores.js`
- 离线清单：`data/v2-manifest.json`（脚本生成）
- 歌曲目录：`data/songs.json`
- 生成脚本：`scripts/generate_v2_manifest.py`

JSON 主要字段：

```text
id title credit original credits key keyBase meter beatUnit tempo tempoLabel
compound clickStep lyricsMode voiceOct phrases bars lyrics slurs ties dc repeat
```

- `original`：原文歌名，居中显示在标题下（可省略）。
- `credits`：作词/作曲/说明，多行右对齐（可省略）。
- `tempoLabel`：默认速度，如 `♩=100`、`♪=176`，显示在调性/节拍下方。
- `repeat`：`{from,to}` 小节索引；`dc`：`{from,to}`。

新增一首 JSON 谱：

1. 放入 `data/scores/{code}/{id}.json`。
2. 在 `data/v2-scores.json` 的 `scores` 增加 `"{code}/{id}": {"file":"data/scores/{code}/{id}.json","label":"四声部"}`。
3. 运行 `python3 scripts/generate_v2_manifest.py`。
4. 若改了 `player-frame.html` 或前端资源，按下方「版本规则」升级缓存版本。

## 目录

```text
index.html / 404.html      站点外壳（404.html 与 index 同步）
player-frame.html          JSON 乐谱播放器（iframe）
assets/css/v2-ui.css       v2 顶栏/菜单/底栏/标注工具样式
assets/js/v2-ui.js         父页与播放器桥接、菜单、路由、标注状态
assets/js/v2-cache.js      Service Worker 注册与 manifest 同步
assets/js/script.js        v1 站点外壳逻辑（v2 复用）
assets/js/offline.js       v1 离线逻辑（v2 页面不加载，admin/旧逻辑仍引用）
sw-v2.js                   v2 Service Worker
sw.js                      v1 Service Worker（v2 页面不注册）
data/                      歌曲目录、乐谱 JSON、映射与 manifest
img/                       图片谱（按分类）
admin/                     管理后台（GitHub API）
scripts/                   manifest 生成脚本
key/ random/ tools/        v1 小工具页
```

## 本地运行

无构建步骤。仓库根目录启动静态服务器即可：

```bash
python3 -m http.server 8080
# 打开 http://localhost:8080/
```

`index.html`/`404.html` 开头的 `document.write('<base ...>')` 用于兼容 GitHub Pages 子路径；本地根路径与 `v2.kcan.cc` 都走 `/`。

## 部署

- 推送 `main` 后 GitHub Actions（`.github/workflows/deploy.yml`）SSH 到服务器：
  `/var/www/vita-plan-v2` → `git pull` → `chown www-data`。
- Nginx：`v1.kcan.cc` / `v2.kcan.cc` 独立 server block；gzip、CSP `frame-ancestors 'self'`、XFO 已配置。
- GitHub Pages：仓库设置中从分支发布，`.nojekyll` + `404.html` 保证深链可用；仅灾备，不对外宣传。

## 缓存与离线

| 内容 | 缓存方式 |
| --- | --- |
| 壳（HTML/CSS/JS/favicon） | SW `v2-shell-*`，stale-while-revalidate |
| `songs.json` | network-first，失败回缓存 |
| JSON 乐谱 | SW install 预缓存 + `v2-manifest` 版本同步，cache-first |
| 图片谱 | **不进 SW**；nginx 无长缓存头，仅浏览器启发式缓存 + 首页 10 秒预载本周图片 |
| 采样音源 | smplr 自带 Cache Storage（`smplr`），按乐器缓存 |
| 简繁 OpenCC | jsDelivr 外部脚本，仅浏览器 HTTP 缓存 |
| 字体 | **无 webfont**，使用系统字体；无字体缓存 |

### 版本规则

改动前端资源或 `player-frame.html` 后，必须同时：

1. 更新引用处的 `?v=`（`v2-ui.js` / `v2-ui.css` / `v2-cache.js` 等）。
2. 升级 `sw-v2.js` 的 `SHELL_CACHE`（如 `v2-shell-44`）。
3. 若 `index.html` 有改动，同步复制为 `404.html`。

只改 `data/scores/*.json` 时，运行 manifest 脚本即可；SW install / 运行期同步会更新乐谱缓存。

## 管理后台

- 地址：`/admin/`，用 GitHub fine-grained PAT 登录。
- Token 只需 `7310C7310C/vita-plan-v2` 的 **Contents: Read/Write**。
- Token 仅存本机；后台可编辑本周歌曲、歌曲与图片、提交历史、发布。
- 已知限制：v2 发布流程尚未自动生成 `v2-manifest.json`；发布后需手动运行脚本或确认 manifest。
- 后台「重整编号」已停用（v2 编号永不重排）。

## 开发约定

- 提交说明用中文。
- 编号沿用 v1，永不重排；删歌留空号。
- v2 不新增指向 v1 / GitHub Pages 的对外链接。
- 标注只存本机（`v2.annot.<songId>`）；设置按曲存在 `ys.settings.<songId>.v2`。
- 播放/标注改动需回归：顶部播放图标、B1 早暂停、背景暂停、repeat 第二遍、区间内重点、标注红圈/删除、图片谱返回、离线。
- 已知遗留：320 图片谱底栏偏宽；admin 发布不生成 v2 manifest；图片不保证离线；字体依赖系统。
