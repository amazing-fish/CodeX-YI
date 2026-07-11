# 易之（YI）

易之是一个基于《易经》的静态站点，占卜、卦象分析与知识库完全由 HTML/CSS/JS 组合实现，不依赖打包器或第三方框架。

## 目录结构
- `index.html`：主页面，包含站点骨架与语义化结构。
- `css/styles.css`：全局样式与主题配色。
- `js/app.js`：核心应用内核，负责模块注册、生命周期与错误处理。
- `js/services/hexagram-data-service-module.js`：卦象数据服务，负责从 `data/hexagrams.json` 异步加载与处理数据。
- `js/modules/`：功能模块集合（主题、通知、占卜、历史、查询等），已拆分成多个易维护的文件。
- `data/hexagrams.json`：六十四卦的结构化数据源（用于 GitHub Pages 等标准静态托管环境）。
- `data/bagua.json`：八卦基础数据源，与卦象数据分离管理。
- `data/bagua.js`：八卦预加载数据，保障离线或 `file://` 访问可用。
- `data/hexagrams.js`：预加载版本的数据文件，确保在 `file://` 直接打开页面或离线情况下仍可使用。

## 开发指南
1. 使用任意静态文件服务器（如 `python -m http.server`）在 `apps/yi/` 目录下启动本地调试。
2. 所有脚本均采用 `<script defer>` 方式加载，确保按顺序初始化。
3. 如需扩展功能，请在 `js/modules/` 目录内新增对应模块文件，并在 `index.html` 中补充 `<script>` 引用，遵循现有命名规范。
4. 卦象或八卦数据更新可直接编辑 `data/hexagrams.json` 与 `data/bagua.json`，如有需要请同步生成对应的 `data/*.js` 回退文件。

## 数据与本地存储

- 数据服务只有在 64 个卦象和 8 个八卦全部通过结构校验后才会进入 ready 状态；网络加载失败时，预加载 `data/*.js` 也必须通过同一校验。
- 主题和历史记录使用带 `yizhi_` 前缀的 localStorage；旧 sessionStorage 值会在首次读取时迁移。
- 历史记录持久化为 version 1 引用模型，只保存 canonical `hexagramId` 和必要的占卜字段。非法引用、畸形字段或未知版本会被拒绝，持久化文本不会作为 HTML 渲染。

## 验证

在仓库根目录运行：

```powershell
node apps/yi/tests/validate-project.mjs
```

该命令检查许可证、数据快照与 fallback 一致性、JavaScript 语法，并执行静态交互、数据服务和历史安全契约。

## 浏览器支持
站点依赖浏览器原生 `fetch` 与 ES2020 语法，建议使用现代 Chromium、Firefox 或 Safari 浏览器访问。

## 部署
仓库通过 GitHub Pages 自动部署静态资源，配置位于 `.github/workflows/pages.yml`（如需调整请同步更新）。

## 范围说明
当前工程专注于功能体验，未启用任何 PWA 相关资源或 Service Worker，避免额外依赖导致的加载失败。如需拓展跨端安装能力，可在后续迭代补充 `manifest.json`、图标和离线缓存策略。
