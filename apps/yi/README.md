# 易之（YI）

易之是一个基于《周易》的静态站点：以三钱法起卦，成卦后直接给出本卦、之卦，以及按变爻多少应当细读的卦辞或爻辞；附六十四卦经传原文（卦辞、彖、象、文言及系辞、说卦、序卦、杂卦）、方图、八卦与本机占记。全部由 HTML / CSS / JS 实现，不依赖打包器或第三方框架。

## 四个视图
- 起卦 `#cast`：写下所问，掷六次成卦；成卦台上下卦之间的太极随爻转动，每爻标出当位 / 失位。右侧给出本卦 → 之卦、解读指引（依《易学启蒙·考变占》）与两卦全文（卦辞、彖、象、六爻爻辞与小象、爻位、白话），可保存、复制或导出。
- 卦典 `#library`：六十四卦方图（行为上卦、列为下卦）或列表，支持卦名、卦序与经传原文关键词搜索。
- 八卦 · 易传 `#trigrams`：八卦取象、四象与三钱、断卦规则、错综互、爻位（当位、居中、相应），以及十翼中系辞上下、说卦、序卦、杂卦全文。
- 占记 `#history`：本机保存的卦，可检索、按时段筛选、重读、删除（可撤销）、导入与导出。

## 目录结构
- `index.html`：页面骨架，四个视图、启动画面与三个原生 `<dialog>`（卦详情、使用说明、确认）。
- `css/`：按关注点拆分的样式，按顺序加载：`tokens.css`（设计令牌与深色）、`base.css`、`components.css`、`gua.css`（卦画）、`taiji.css`（太极动效）、`cast.css`、`library.css`、`history.css`。
- `js/core/yijing-core.js`：易理核心纯函数（三钱、之卦、错综互、断卦规则、爻位、爻辞拆分），不依赖 DOM。
- `js/app.js`：应用内核（存储、事件、错误、对话框、hash 路由、卦画 / 太极 / 经传等通用 UI 片段、模块生命周期）。
- `js/services/hexagram-data-service-module.js`：数据加载与回退、经传合并、索引与排序搜索。
- `js/modules/`：各视图与通用模块（起卦、卦典、八卦 · 易传、占记、详情弹窗、帮助、主题、提示）。
- `data/`：`hexagrams.json`（卦名、卦画与白话）、`bagua.json`（八卦）、`zhouyi.json`（经传原文）；同名 `.js` 为同内容的回退文件，保障 `file://` 直接打开时可用。
- `favicon.svg`：站点图标。
- `tests/`：`yijing-core.test.mjs`（核心规则与经传数据单测）与 `validate-project.mjs`（项目约定校验，会同时运行单测）。

## 经传原文
`data/zhouyi.json` 以王弼《周易注》为底本（[易學網校對整理本](https://gist.github.com/sui1491/52e8214c8e5f4a189b94f5ea2b8bdb05)），依 OpenCC 词典转为简体：卦名“乾”保留原字，罕用字保留繁体以免缺字；已与 [LarryZhu-dev/thebookofchanges](https://github.com/LarryZhu-dev/thebookofchanges) 逐字比对。校改之处记在对应卦的 `notes` 字段。

## 开发指南
1. 在 `apps/yi/` 目录下启动任意静态服务器，例如 `python -m http.server 8000 --bind 127.0.0.1`。
2. 脚本均以 `<script defer>` 按顺序加载；新增模块时在 `index.html` 引入，并在 `js/app.js` 的注册表中登记。
3. 与卦理相关的计算放在 `js/core/yijing-core.js` 并补充单测；视图模块只负责渲染与交互。
4. 更新 `data/*.json` 后请同步生成对应的 `data/*.js` 回退文件（内容须一致，校验脚本会比对）。
5. 提交前运行：
   - `node apps/yi/tests/validate-project.mjs`
   - `Get-ChildItem -Path .\apps\yi\js -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }`

## 本地数据
主题、占记与卦典展示方式保存在浏览器 `localStorage`（键前缀 `yizhi_`），兼容读取早期 `sessionStorage` 数据；存储不可用时退回运行期内存。数据不会上传到任何服务器。

## 浏览器支持
依赖原生 `<dialog>`、`color-mix()`、`:has()` 与容器查询，建议使用 2023 年以后的 Chromium、Firefox 或 Safari。主题切换的圆形晕开依赖 View Transitions，不支持时仅旋转太极后直接切换。系统开启“减少动态效果”时，太极与铜钱动画均停用。

## 部署
通过 GitHub Pages 自动部署，配置位于仓库根目录 `.github/workflows/pages.yml`。

## 范围说明
当前未启用 PWA 与 Service Worker。白话释义为原项目自带，个别条目与原文有出入，阅读时以经文为准。内容仅供学习与自省。
