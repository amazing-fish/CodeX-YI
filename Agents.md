# AGENTS.md

> 本文件供人类与编码智能体（IDE 内置 Agent、CLI 等）阅读与执行。  
> **沟通与协作一律使用简体中文**；提交信息与 PR 标题 **必须包含中文**。

---

## 1) 目标
将 `jiao-ling/YI` 引入本仓（路径：`apps/yi/`），在仅使用 **HTML / CSS / JS（三件套）** 的前提下进行工程化与可维护性优化，并通过 GitHub Pages 自动部署静态站点。

当前阶段聚焦核心功能体验，未启用 PWA 相关特性，避免缺失资源导致加载失败。若后续需要跨端安装体验，可在完成功能迭代后补齐 `manifest.json`、站点图标与 Service Worker。

---

## 2) 仓库结构
- `apps/yi/` — YI 的静态站点源码（HTML/CSS/JS）
- `apps/yi/data/` — 卦象与八卦数据（JSON 与 JS 回退）。
- `.github/workflows/pages.yml` — GitHub Pages 自动部署
- `.githooks/` — 本地 Git 钩子（提交信息中文校验）
- `.gitmessage` — 中文提交信息模板（可选）
- `AGENTS.md` — 本文件（操作卡）

> 说明：**不引入打包器与前端框架**；仅做三件套层面的规范与部署。

---

## 3) 拉取/更新 YI 源码（使用 `git subtree`）
- **首次引入**
  ```bash
  git remote add yi-origin https://github.com/jiao-ling/YI.git
  git fetch yi-origin
  git subtree add --prefix=apps/yi yi-origin main --squash
  ```

---

## 4) 部署说明
- 默认分支：`main`
- 静态资源目录：`apps/yi/`
- Pages 工作流：`.github/workflows/pages.yml`
- 首次启用 Pages 时需在仓库 Settings → Pages 中设置 Source=GitHub Actions（当前已配置）。

---

# 协作指引

## 核心理念
- 每次开始实现任务前必须通读仓库根目录下的 `ANCHOR.md`，确认本次改动与既有技术路径、协作约定保持一致。
- 所有改动完成后，都要回写到 `ANCHOR.md` 的技术路径或版本记录中，确保“锚点”信息与代码同步演进。

## 工作流约束
1. 全程使用中文进行提交信息、PR 描述以及代码注释补充说明。
2. 避免在对话中直接请求执行交互式命令；如需运行脚本，请明确写出脚本内容并在终端手动执行。
3. 提交前进行自检，评估改动对现有流程的影响范围，必要时在提交信息中点明关键约束或后续工作。
4. 若引入配置或流程约定的调整，需同时补充到 `ANCHOR.md` 的对应章节，并在版本记录中登记版本号与类型（feature / refactor / bugfix），版本号格式必须为 `v主.次.修`。
5. 使用win/powershell/python平台

## 代码与文档
- 不编写与业务无关的样例代码或调试输出，保持仓库干净。
- 修改配置时要说明默认值与安全边界，避免隐藏行为。
- 新增文档需与现有目录结构、命名风格保持一致，便于后续检索。
