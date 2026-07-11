# CodeX-YI 问题治理实施计划

> 本计划按已批准的 10 个 GitHub Issues 和 4 个依赖 PR 执行。每个运行时修复遵循“先失败测试、再最小实现、最后全量验证”。

## Task 1：建立 GitHub 问题治理基线

**远端对象：** `amazing-fish/CodeX-YI`

1. 启用 GitHub Issues。
2. 创建 `security`、`accessibility`、`ci`、`data-quality`、`ready-for-agent` 标签。
3. 按设计文档顺序创建 10 个 Issue；正文固定包含 `What to build`、`Acceptance criteria`、`Blocked by`。
4. 创建依赖 Issue 后，使用实际编号填写生命周期和无障碍 Issue 的阻塞关系。
5. 复核标题、标签、编号、URL 和开放状态。

## Task 2：完成 PR 1——许可与治理基线

**分支：** `codex/mit-repo-baseline`，**base：** `main`

**文件：**

- 新增：`LICENSE`
- 新增：`apps/yi/tests/validate-project.mjs`
- 新增：`docs/plans/2026-07-11-issue-pr-remediation-design.md`
- 新增：`docs/plans/2026-07-11-issue-pr-remediation-plan.md`
- 修改：`anchor.md`

步骤：

1. 加入 MIT 许可证，版权行为 `Copyright (c) 2025-2026 jiao-ling and contributors`。
2. 建立零依赖 Node 校验入口，检查许可证、64/8 数据规模、回退数据与 JSON 一致性、JavaScript 语法。
3. 运行 `node apps/yi/tests/validate-project.mjs` 和 `git diff --check`。
4. 中文提交，推送分支并创建以 `main` 为 base 的可评审 PR。

## Task 3：完成 PR 2——静态界面与交互稳定性

**分支：** `codex/static-ui-stability`，**base：** `codex/mit-repo-baseline`

**主要文件：**

- `apps/yi/index.html`
- `apps/yi/css/styles.css`
- `apps/yi/favicon.svg`
- `apps/yi/js/app.js`
- `apps/yi/js/modules/divination-module.js`
- `apps/yi/js/modules/hexagram-analyzer-module.js`
- `apps/yi/js/modules/knowledge-module.js`
- `apps/yi/js/modules/modal-module.js`
- `apps/yi/js/modules/search-module.js`
- `apps/yi/tests/validate-project.mjs`
- `anchor.md`

步骤：

1. 先扩展测试，证明搜索序号、搜索容器唯一所有权、重置取消投掷和数据就绪判断当前失败。
2. 加入本地 favicon，删除外部字体依赖；为搜索推荐区使用专属 DOM id。
3. 搜索同时匹配卦序、名称、关键词和已存在标签，转义正则特殊字符。
4. 使用 generation/token 使重置后的旧投掷回调失效。
5. 分析器仅在数据服务完整就绪后工作；移除重复全局错误监听。
6. 保留模态框焦点恢复等不改变数据契约的安全修复。
7. 运行定向测试、全量项目校验、语法检查和 `git diff --check`。
8. 更新 `anchor.md`，中文提交、推送并创建堆叠 PR；关联对应 Issue。

## Task 4：完成 PR 3——数据加载与关系索引契约

**分支：** `codex/data-contracts`，**base：** `codex/static-ui-stability`

**主要文件：**

- `apps/yi/js/services/hexagram-data-service-module.js`
- `apps/yi/tests/data-service-contract.mjs`
- `apps/yi/tests/validate-project.mjs`
- `anchor.md`

步骤：

1. 写失败测试：空对象、少于 64/8 条、非法二进制、非六爻结构不得 ready；64 个卦象必须各有三类有效关系。
2. 将载入分成“解析/校验快照”“建立全量索引”“计算关系”“提交 ready 状态”四步。
3. JSON 与 JS fallback 共用同一校验入口；失败时保留 not-ready 状态并发出明确错误。
4. 运行数据契约测试、全量校验、语法检查和 `git diff --check`。
5. 更新 `anchor.md`，中文提交、推送并创建堆叠 PR；关闭数据快照 Issue。

## Task 5：完成 PR 4——历史记录安全边界

**分支：** `codex/history-security`，**base：** `codex/data-contracts`

**主要文件：**

- `apps/yi/js/app.js`
- `apps/yi/js/modules/history-module.js`
- `apps/yi/js/modules/modal-module.js`
- `apps/yi/js/modules/theme-module.js`
- `apps/yi/tests/history-security-contract.mjs`
- `apps/yi/tests/validate-project.mjs`
- `anchor.md`

步骤：

1. 写失败测试：恶意 localStorage 字段不能触发脚本或事件属性；畸形记录不能进入历史列表。
2. 定义历史记录 codec：白名单字段、类型、长度、时间戳和合法卦象引用；明确旧 sessionStorage 迁移策略。
3. 历史列表用 `createElement` / `textContent` 构建；不可信字段不得进入 `innerHTML`。
4. Modal 区分“可保存的合法卦象详情”和“仅展示内容”，避免帮助或八卦数据污染历史。
5. 运行安全契约测试、全量校验、语法检查和 `git diff --check`。
6. 更新 `anchor.md`，中文提交、推送并创建堆叠 PR；关闭安全 Issue。

## Task 6：远端复核与交付

1. 查询四个 PR 的 base/head、draft 状态、checks 和关联 Issue。
2. 确认没有自动合并、没有修改原始脏工作区。
3. 汇总 Issue 分类、已关闭范围、后续 Issue、每个 PR 的本地验证与远端 CI 状态。
