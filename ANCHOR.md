# ANCHOR.md

本项目“元约定”的单一真源（Single Source of Truth）。每次改动前通读本文件；改动完成后回写本文件，确保协作与技术路径同步。

## 顶层约定

- 语言与沟通：默认中文；引用代码位置使用`file_path:line_number`
- 环境与命令：Windows + PowerShell
- 安全与合规：依赖与版本需先验证兼容性与许可
- 提交策略：除用户明确要求外不提交；以补丁提案与验证输出先行

## 项目地图

- 模块列表（名称 / 职责 / 入口 / 主要依赖）：
  - theme / 主题切换与跟随系统 / 入口：`apps/yi/index.html:673`；注册：`apps/yi/js/app.js:901-903` / 依赖：事件总线、存储
  - notification / 全局提示通知 / 入口：`apps/yi/index.html:674`；注册：`apps/yi/js/app.js:904-906` / 依赖：事件总线
  - hexagramData / 卦象与八卦数据管理 / 入口：`apps/yi/index.html:672`；注册：`apps/yi/js/app.js:907-909` / 依赖：`services/hexagram-data-service-module.js`
  - divination / 铜钱投掷与卦象成型 / 入口：`apps/yi/index.html:675`；注册：`apps/yi/js/app.js:910-912` / 依赖：数据服务、UI
  - history / 本地历史记录与导出 / 入口：`apps/yi/index.html:676`；注册：`apps/yi/js/app.js:913-915` / 依赖：存储
  - hexagram-analyzer / 上下卦组合分析 / 入口：`apps/yi/index.html:677`；注册：`apps/yi/js/app.js:916-918` / 依赖：数据服务
  - knowledge / 八卦知识展示 / 入口：`apps/yi/index.html:678`；注册：`apps/yi/js/app.js:919-921` / 依赖：数据服务
  - search / 关键词与标签查询 / 入口：`apps/yi/index.html:679`；注册：`apps/yi/js/app.js:922-924` / 依赖：数据服务
  - modal / 卦象详情模态框 / 入口：`apps/yi/index.html:680`；注册：`apps/yi/js/app.js:925-927` / 依赖：UI、事件
  - help / 帮助说明 / 入口：`apps/yi/index.html:681`；注册：`apps/yi/js/app.js:928-930` / 依赖：UI

- 入口与加载顺序：`apps/yi/index.html:668-682` 按 `defer` 顺序加载：`app.js` → 预加载 `data/*.js` → `services` → 各 `modules`

- 关键逻辑链路：
  - 错误处理：统一入口 `apps/yi/js/app.js:296-333`；模块初始化包装 `apps/yi/js/app.js:606-613`；全局错误与 Promise 拒绝监听 `apps/yi/js/app.js:587-593`、`958-965`
  - 配置加载：`apps/yi/js/app.js:10-30`（名称/版本/调试/性能阈值/存储前缀/动画时长）
  - 数据 IO 边界：卦象数据加载与回退 `apps/yi/js/services/hexagram-data-service-module.js:39-69`；八卦数据加载与回退 `78-113`
  - 事件驱动：模块注册事件 `apps/yi/js/app.js:484-486`；数据就绪事件 `apps/yi/js/services/hexagram-data-service-module.js:27-28`；导航与标签页事件 `apps/yi/js/app.js:682-685`、`720-722`
  - 性能监控：计时与阈值告警 `apps/yi/js/app.js:244-293`；注册/初始化打点 `apps/yi/js/app.js:475-479`、`609-612`
  - 存储回退：`sessionStorage` 不可用时转内存 Map `apps/yi/js/app.js:167-178`、`195-201`
  - 生命周期：初始化流程 `apps/yi/js/app.js:533-575`；销毁/重启 `apps/yi/js/app.js:819-849`

## 工作流程与检查清单

- 改动前：
- 通读本锚点，确认约定与依赖
- 评估影响范围与验证路径
- 拟定回滚方案

- 改动后：
- 更新本锚点涉及的设定/地图/逻辑
- 记录审计与验证结果（见下）

## 审计记录（模板）

- 变更版本：`v主.次.修`
- 改动概述：
- 影响模块：
- 变更文件与补丁摘要：
- 验证步骤与结果（PowerShell 脚本或命令；预览地址）：
- 风险与后续事项（TODO/技术债）：

## 最近14个版本变更日志

- v1.7.3（test/chore）：归一化 3 个与 LF 属性冲突的核心源文件，并增加索引 EOL 回归契约
- v1.7.2（test/chore）：commit-msg hook 改用 Node Unicode Han 检测，并通过真实 shell 执行测试验证中文放行、纯英文拒绝
- v1.7.1（test/docs）：hygiene 扫描改用未引号化 NUL 路径，覆盖非 ASCII 文件名，并修正 `.trae/documents` 中被旧扫描漏掉的引用与 EOF
- v1.7.0（docs/chore）：统一 `AGENTS.md/ANCHOR.md` 大小写与文档引用；明确 LF 策略；加入中文提交 hook/template 和 repository hygiene 契约
- v1.6.1（ci/bugfix）：build job 增加 `pages: read` 以兼容 private/internal 仓库读取 Pages 配置，同时保持部署写权限隔离
- v1.6.0（ci）：所有 PR/main 统一运行项目契约验证；Pages build/deploy 只消费通过验证的 main 快照；默认只读、部署最小权限并固定 Actions SHA
- v1.5.4（bugfix）：localStorage 读取异常时继续尝试 legacy sessionStorage；八卦 schema 要求所有用户可见说明字段为非空字符串
- v1.5.3（bugfix）：八卦 schema 固定每个卦名的 canonical 三位二进制映射，拒绝交换编码但仍格式唯一的语义畸形快照
- v1.5.2（bugfix）：legacy sessionStorage 迁移写入 localStorage 失败时仍返回已解析旧值，并保留原数据供后续重试
- v1.5.1（bugfix）：八卦 schema 强制要求 `乾/坤/震/巽/坎/离/艮/兑` 固定键，防止形式有效但业务查询不可达的数据进入 ready
- v1.5.0（security/bugfix）：历史记录采用 versioned codec 与 canonical `hexagramId` 水合；清理非法/未知版本记录，安全渲染持久化字段，并分离 Modal 展示内容与可保存卦象
- v1.4.0（bugfix）：为 64/8 数据快照建立严格 schema、两阶段关系索引和原子 ready 提交；空、缺失、畸形 JSON/JS fallback 均失败关闭
- v1.3.1（bugfix）：保留首次打开 Modal 的外部焦点来源，避免相关卦象内导航覆盖 opener；补充焦点恢复行为回归测试
- v1.3.0（bugfix）：补齐本地 favicon 与系统字体回退；修复搜索卦序/分类/特殊字符、推荐区 DOM 所有权、分析器就绪渲染、投掷重置竞态、重复错误监听和模态框焦点循环
- v1.2.0（docs）：补充 MIT 许可证与零依赖项目校验；记录问题分类、分层 PR、测试与安全边界设计；为后续 GitHub Issue 和修复提交建立可审计基线
- v1.1.0（arch/docs）：完整梳理架构与技术路径；填充“项目地图”与“关键逻辑链路”；新增 v1.1.0 审计记录与手动验证建议；保持静态架构与 GitHub Pages 部署路径不变
- v1.0.0（feature）：新增协作文档 `AGENTS.md` 与锚点文档 `ANCHOR.md`；确立角色、流程、提示词与审计规范；落实 Windows + PowerShell 约定

> 说明：超出最近5个版本的记录请转入归档文件（如 `CHANGELOG-ARCHIVE.md`）。

## 互动规则

- AI需在每次任务前后引用并维护本文件；保持“元约定”优先级最高
- 任何引入的依赖或约定更改，必须在本文件体现并进入最近14个版本日志

## 演练记录（首版）

- 目标：以不提交代码为前提，完成文档落地与验证
- 步骤：
- 阅读本锚点 → 更新 `AGENTS.md` → 新增 `ANCHOR.md` → 在“最近14个版本变更日志”登记 `v1.0.0`
- 输出：两文档已创建并包含提示词、约定与日志模板
- 结论：文档协作路径可用，后续改动可沿用审计模板记录

## 审计记录：v1.0.0

- 变更版本：v1.0.0（feature）
- 改动概述：建立AI协作与锚点机制
- 影响模块：文档与协作流程
- 变更文件与补丁摘要：
  - 更新 `AGENTS.md`：新增角色、流程、提示词、审计规范
  - 新增 `ANCHOR.md`：顶层约定、检查清单、审计模板、5版本日志
- 验证步骤与结果：
  - PowerShell 手动验证建议：
    - `Get-Content -Path .\AGENTS.md -TotalCount 10`
    - `Get-Content -Path .\ANCHOR.md -TotalCount 10`
  - 结果：两文件存在且包含约定与模板
- 风险与后续事项：
  - 后续需逐步填充“项目地图”与“关键逻辑链路”
  - 将后续改动按版本写入“最近5个版本变更日志”

## 审计记录：v1.1.0

- 变更版本：v1.1.0（arch/docs）
- 改动概述：梳理项目结构、架构与技术路径；更新 `ANCHOR.md` 的“项目地图”与“关键逻辑链路”；新增验证建议与版本日志
- 影响模块：文档与协作流程（代码无改动）
- 变更文件与补丁摘要：
  - 更新 `ANCHOR.md`：替换“项目地图”占位；新增关键逻辑链路；登记变更日志；新增本审计记录
- 验证步骤与结果：
  - PowerShell 手动验证建议：
    - `Select-String -Path .\apps\yi\js\app.js -Pattern "registerModule" | Measure-Object`
    - `Get-Content -Path .\apps\yi\index.html -TotalCount 30 ; Get-Content -Path .\apps\yi\index.html -Tail 20`
    - `Select-String -Path .\apps\yi\js\services\hexagram-data-service-module.js -Pattern "fetch\(|__HEXAGRAM_DATA__|hexagram-data:ready"`
    - `Get-ChildItem -Path .\apps\yi\js\modules | Select-Object -ExpandProperty Name`
  - 结果：模块注册与脚本顺序、数据服务回退与事件均与锚点记录一致
- 风险与后续事项：
  - 持续维护“项目地图”与“关键逻辑链路”，模块增删或逻辑调整须同步回写

## 审计记录：v1.2.0

- 变更版本：v1.2.0（docs）
- 改动概述：补充 MIT 许可证和项目校验入口，固化当前问题治理、GitHub Issue 分类和四层 PR 设计
- 影响模块：文档与协作流程（运行时代码无改动）
- 变更文件与补丁摘要：
  - 新增 `docs/plans/2026-07-11-issue-pr-remediation-design.md`：记录目标、约束、10 个 Issue、4 层 PR、关键不变量与验证策略
  - 新增 `docs/plans/2026-07-11-issue-pr-remediation-plan.md`：将分层 PR 细化为文件、测试、实现、验证和远端复核步骤
  - 新增 `LICENSE`：采用 MIT License，版权行为 `jiao-ling and contributors`
  - 新增 `apps/yi/tests/validate-project.mjs`：校验许可证、64/8 数据规模、JSON/JS fallback 一致性与 JavaScript 语法
  - 更新 `ANCHOR.md`：登记本次设计基线与审计记录
- 验证步骤与结果：
  - `node apps/yi/tests/validate-project.mjs`：通过；MIT 许可证、64/8 数据快照、fallback 一致性和 JavaScript 语法均有效
  - `git diff --check`：通过；无空白错误
  - 文档内 Issue、PR 和验证边界与已批准方案逐项核对
- 风险与后续事项：
  - 设计文档不改变运行时行为；后续各层 PR 必须分别补充测试证据
  - GitHub Issue 编号由远端创建结果确定，依赖关系在创建后使用实际编号回填到 Issue 正文

## 审计记录：v1.3.0

- 变更版本：v1.3.0（bugfix）
- 改动概述：修复静态资源、搜索、投掷重置、分析器就绪和基础焦点管理问题
- 影响模块：页面入口、样式、App 启动、divination、search、knowledge、hexagram-analyzer、modal、测试
- 变更文件与补丁摘要：
  - `apps/yi/index.html`、`apps/yi/css/styles.css`、`apps/yi/favicon.svg`：使用本地 favicon 和系统字体，修正“风”标签与搜索推荐容器 id
  - `apps/yi/js/modules/search-module.js`、`knowledge-module.js`：支持 1–64 卦序查询、跨详情字段分类、正则转义，并收敛推荐区 DOM 所有权
  - `apps/yi/js/modules/divination-module.js`：以投掷 generation 使重置前的异步回调失效
  - `apps/yi/js/modules/hexagram-analyzer-module.js`：数据完整就绪后再渲染与分析
  - `apps/yi/js/app.js`：移除模拟启动延迟和重复全局错误监听
  - `apps/yi/js/modules/modal-module.js`：补充 Tab 焦点循环与关闭后的焦点恢复
  - `apps/yi/tests/static-ui-contract.mjs`、`validate-project.mjs`：加入确定性交互契约并纳入项目校验
- 验证步骤与结果：
  - `node apps/yi/tests/static-ui-contract.mjs`：通过；卦序、特殊字符、分类和重置竞态契约成立
  - `node apps/yi/tests/validate-project.mjs`：通过；基础快照、语法和静态交互契约全部有效
  - `git diff --check`：通过；无空白错误
- 风险与后续事项：
  - 模态框只完成焦点循环和恢复；完整语义、对比度与键盘路径继续由 #8 跟踪
  - 移动端布局、生命周期重启、CI 门禁和内容数据校正不在本层 PR 范围

## 审计记录：v1.3.1

- 变更版本：v1.3.1（bugfix）
- 改动概述：修复 Modal 内相关卦象导航覆盖最初外部 opener 的焦点恢复问题
- 影响模块：modal、静态交互契约测试
- 变更文件与补丁摘要：
  - `apps/yi/js/modules/modal-module.js`：仅在 hidden → visible 转换时捕获 `lastFocusedElement`
  - `apps/yi/tests/static-ui-contract.mjs`：覆盖首次打开、Modal 内二次 show、关闭后恢复原 opener 的完整行为
- 验证步骤与结果：
  - `node apps/yi/tests/static-ui-contract.mjs`：通过；Modal 内二次 show 后关闭会恢复最初外部 opener
  - `node apps/yi/tests/validate-project.mjs`：通过；许可证、64/8 快照、fallback、JavaScript 语法和静态交互契约有效
  - `git diff --check`：通过；无空白错误
- 风险与后续事项：
  - 只改变已打开 Modal 内导航时的焦点来源保留，不改变首次打开、Tab 焦点循环或 Escape 关闭行为

## 审计记录：v1.4.0

- 变更版本：v1.4.0（bugfix）
- 改动概述：建立完整、失败关闭的六十四卦数据快照与两阶段关系索引
- 影响模块：hexagram-data service、数据契约测试、项目校验
- 变更文件与补丁摘要：
  - `apps/yi/js/services/hexagram-data-service-module.js`：验证 64/8 数量、id、二进制、六爻与唯一性；先建立全量索引再计算三类关系；全部成功后一次性提交 ready 状态
  - `apps/yi/tests/data-service-contract.mjs`：覆盖正常 JSON、合法 fallback、空/缺失/非法二进制/非六爻/非法 fallback 与 64×3 关系引用
  - `apps/yi/tests/validate-project.mjs`：将数据服务契约纳入全量项目校验
- 验证步骤与结果：
  - `node apps/yi/tests/data-service-contract.mjs`：通过；JSON/fallback 成功路径、失败关闭和 64×3 关系引用均有效
  - `node apps/yi/tests/validate-project.mjs`：通过；基础快照、语法、静态交互和数据服务契约全部有效
  - `git diff --check`：通过；无空白错误
- 风险与后续事项：
  - 数据 schema 变严格；缺失或畸形快照将明确保持 not-ready，而不是以空数据继续运行
  - 屯、贲、升的内容语义校正继续由 #10 独立跟踪，本 PR 不改变原始数据文本

## 审计记录：v1.5.0

- 变更版本：v1.5.0（security/bugfix）
- 改动概述：封闭 localStorage 历史记录到列表/Modal 的持久化 DOM XSS 信任边界
- 影响模块：存储管理、主题预初始化、history、divination、modal、theme、安全契约测试
- 变更文件与补丁摘要：
  - `apps/yi/js/app.js`、`index.html`、`theme-module.js`：以 localStorage 为持久化后端，显式迁移旧 sessionStorage，保持主题预初始化一致
  - `apps/yi/js/modules/history-module.js`：引入 version 1 codec、字段/长度/时间/爻结构校验、canonical `hexagramId` 水合与非法记录清洗；持久化文本使用 `textContent`
  - `apps/yi/js/modules/divination-module.js`、`modal-module.js`：写入稳定 timestamp；Modal 仅允许与数据服务匹配的 canonical 卦象保存，帮助等展示内容不可入历史
  - `apps/yi/README.md`：记录失败关闭的数据快照、localStorage 迁移、version 1 历史模型与统一验证命令
  - `apps/yi/tests/history-security-contract.mjs`、`validate-project.mjs`：覆盖恶意旧记录、非法引用、未知版本、安全 DOM sink 和 Modal 保存边界
- 验证步骤与结果：
  - `node apps/yi/tests/history-security-contract.mjs`：通过；恶意持久化字段未进入 innerHTML，非法/未知版本被清理，展示内容不可保存
  - `node apps/yi/tests/validate-project.mjs`：通过；基础快照、语法及全部三类契约测试有效
  - `git diff --check`：通过；无空白错误
- 风险与后续事项：
  - 未通过 schema 的历史记录将被拒绝并从规范化存储中移除；合法旧记录会迁移为 version 1
  - 完整无障碍语义和应用 restart 生命周期继续由 #8、#6 独立跟踪

## 审计记录：v1.5.1

- 变更版本：v1.5.1（bugfix）
- 改动概述：补齐八卦固定名称键约束，保证 ready 快照可被既有 UI 与分析器按名称查询
- 影响模块：hexagram-data service、数据契约测试
- 变更文件与补丁摘要：
  - `apps/yi/js/services/hexagram-data-service-module.js`：要求八个固定卦名全部存在，再校验各自字段与二进制唯一性
  - `apps/yi/tests/data-service-contract.mjs`：加入“保留 8 个唯一二进制但将乾重命名为天”的失败关闭回归用例
- 验证步骤与结果：
  - `node apps/yi/tests/data-service-contract.mjs`：通过；重命名固定卦名的 8 项 payload 保持 not-ready
  - `node apps/yi/tests/validate-project.mjs`：通过；静态交互、数据服务、历史安全及基础项目校验全部有效
  - `git diff --check`：通过；无空白错误
- 风险与后续事项：
  - 固定名称是现有下拉框、常用组合和 `getBagua()` API 的公开契约；拒绝别名键属于预期的失败关闭行为

## 审计记录：v1.5.2

- 变更版本：v1.5.2（bugfix）
- 改动概述：隔离 legacy storage 的迁移写入失败，保证可读旧数据不会因 localStorage 限制而被隐藏
- 影响模块：StorageManager、历史安全契约测试
- 变更文件与补丁摘要：
  - `apps/yi/js/app.js`：将 localStorage 写入和 sessionStorage 删除置于内层 best-effort try/catch；无论迁移是否成功都返回已解析旧值
  - `apps/yi/tests/history-security-contract.mjs`：从真实 app.js 提取 StorageManager，覆盖 localStorage.setItem 抛错时返回 legacy 值且不删除旧记录
- 验证步骤与结果：
  - `node apps/yi/tests/history-security-contract.mjs`：通过；迁移写入失败时返回 legacy 值且未删除 sessionStorage
  - `node apps/yi/tests/validate-project.mjs`：通过；静态交互、数据服务、历史安全及基础项目校验全部有效
  - `git diff --check`：通过；无空白错误
- 风险与后续事项：
  - 迁移失败会保留 sessionStorage，并在后续加载继续尝试；不会把失败误当成数据缺失

## 审计记录：v1.5.3

- 变更版本：v1.5.3（bugfix）
- 改动概述：把八卦固定键约束深化为名称到 canonical 三位二进制的完整映射约束
- 影响模块：hexagram-data service、数据契约测试
- 变更文件与补丁摘要：
  - `apps/yi/js/services/hexagram-data-service-module.js`：定义并校验 `乾=111`、`坤=000`、`震=001`、`巽=110`、`坎=010`、`离=101`、`艮=100`、`兑=011`
  - `apps/yi/tests/data-service-contract.mjs`：交换乾/坤编码但保持格式与全局唯一性，验证快照仍失败关闭
- 验证步骤与结果：
  - `node apps/yi/tests/data-service-contract.mjs`：通过；交换乾/坤编码的 payload 保持 not-ready
  - `node apps/yi/tests/validate-project.mjs`：通过；静态交互、数据服务、历史安全及基础项目校验全部有效
  - `git diff --check`：通过；无空白错误
- 风险与后续事项：
  - canonical 映射与现有数据、上下卦下拉框和分析器契约一致；别名或交换编码不再被接受

## 审计记录：v1.5.4

- 变更版本：v1.5.4（bugfix）
- 改动概述：补齐 localStorage 读取异常回退与八卦用户可见字段完整性边界
- 影响模块：StorageManager、hexagram-data service、历史与数据契约测试
- 变更文件与补丁摘要：
  - `apps/yi/js/app.js`：单独捕获 localStorage.getItem 访问异常；不吞掉可继续读取的 legacy sessionStorage
  - `apps/yi/js/services/hexagram-data-service-module.js`：要求 `symbol/nature/attribute/direction/animal/element/family` 全部为非空字符串
  - `apps/yi/tests/history-security-contract.mjs`：覆盖 localStorage 读取抛 SecurityError 后仍读取 legacy 值
  - `apps/yi/tests/data-service-contract.mjs`：覆盖缺失 `nature` 时快照保持 not-ready
- 验证步骤与结果：
  - `node apps/yi/tests/history-security-contract.mjs`：通过；localStorage 读取异常后仍返回 legacy 值
  - `node apps/yi/tests/data-service-contract.mjs`：通过；缺失 `nature` 的八卦快照保持 not-ready
  - `node apps/yi/tests/validate-project.mjs`：通过；静态交互、数据服务、历史安全及基础项目校验全部有效
  - `git diff --check`：通过；无空白错误
- 风险与后续事项：
  - localStorage 中存在但 JSON 畸形的当前值仍严格失败，不会降级读取 legacy 格式
  - 缺失展示字段的八卦快照会失败关闭，避免 ready 后向 UI 泄漏 `undefined`

## 审计记录：v1.6.0

- 变更版本：v1.6.0（ci）
- 改动概述：建立覆盖堆叠 PR/main 的项目验证门禁，并让 Pages 发布显式依赖通过验证的 main 快照
- 影响模块：GitHub Actions、CI workflow 契约、项目统一验证、部署文档
- 变更文件与补丁摘要：
  - `.github/workflows/pages.yml`：新增 `validate` job；只有 main ref 在验证后 build/deploy，PR 或其他手动 ref 只验证；部署权限仅授予 deploy job
  - `apps/yi/tests/ci-workflow-contract.mjs`：静态验证触发器、依赖、最小权限、PR 部署隔离、concurrency 与 40 位 Action SHA
  - `apps/yi/tests/validate-project.mjs`：将 CI workflow 契约纳入统一校验入口
  - `apps/yi/README.md`：记录本地等价命令、失败诊断、部署边界与分支保护启用时机
- 验证步骤与结果：
  - `node apps/yi/tests/ci-workflow-contract.mjs`：通过；workflow 结构符合门禁契约
  - `node apps/yi/tests/validate-project.mjs`：通过；静态交互、数据服务、历史安全、CI workflow 与基础项目校验全部有效
  - `git diff --check`：通过；无空白错误
- 风险与后续事项：
  - required status check 必须在 workflow 合入 main 并首次产生 `validate` 后启用，避免在检查尚不存在时锁死 main
  - Actions 升级必须更新精确 SHA 与版本注释，不能退回浮动 tag

## 审计记录：v1.6.1

- 变更版本：v1.6.1（ci/bugfix）
- 改动概述：补齐 configure-pages 在非公开仓库读取 Pages 配置所需的只读权限
- 影响模块：Pages workflow、CI workflow 契约、部署文档
- 变更文件与补丁摘要：
  - `.github/workflows/pages.yml`：build job 显式授予 `contents: read` 与 `pages: read`
  - `apps/yi/tests/ci-workflow-contract.mjs`：要求 build 可读取 Pages 配置，同时禁止 `pages: write` 和 `id-token: write`
  - `apps/yi/README.md`：区分 workflow 默认只读、build Pages 只读与 deploy 写权限
- 验证步骤与结果：
  - `node apps/yi/tests/ci-workflow-contract.mjs`：通过；build 仅具有 `contents: read/pages: read`，部署写权限保持隔离
  - `node apps/yi/tests/validate-project.mjs`：通过；静态交互、数据服务、历史安全、CI workflow 与基础项目校验全部有效
  - `git diff --check`：通过；无空白错误
- 风险与后续事项：
  - 新增权限仅为读取 Pages 配置，不扩大 artifact 上传或部署写权限

## 审计记录：v1.7.0

- 变更版本：v1.7.0（docs/chore）
- 改动概述：建立 Windows/CI 一致的文档命名、换行、中文提交与 repository hygiene 基线
- 影响模块：根协作文档、Git 属性、本地 Git 配置资产、项目校验、历史空白噪声
- 变更文件与补丁摘要：
  - `AGENTS.md`、`ANCHOR.md`：完成 case-only rename，统一仓库内引用，并记录 PowerShell 初始化与验证命令
  - `.gitattributes`：对 Markdown、HTML、CSS、JavaScript、JSON、YAML、SVG 与 hooks 明确 LF 策略
  - `.githooks/commit-msg`、`.gitmessage`：提供可选的本地中文提交校验和模板，不影响 CI
  - `apps/yi/tests/repository-hygiene-contract.mjs`：校验精确文件名、引用、属性规则、hook/template、尾随空白与单一 EOF 换行
  - `apps/yi/tests/validate-project.mjs`：将 repository hygiene 纳入统一项目校验
  - `help-module.js`、`knowledge-module.js`、`search-module.js`、`hexagram-data-service-module.js`、`.gitignore`：移除被新契约识别的既有空白噪声
- 验证步骤与结果：
  - `node apps/yi/tests/repository-hygiene-contract.mjs`：通过；命名、引用、EOL 规则、Git 资产与空白契约有效
  - `node apps/yi/tests/validate-project.mjs`：通过；静态交互、数据服务、历史安全、CI workflow、repository hygiene 与基础项目校验全部有效
  - `git diff --check`：通过；无空白错误
- 风险与后续事项：
  - `.gitattributes` 约束后续 checkout/commit 的规范行尾，本 PR 不批量重写无关文件以避免大范围噪声
  - 本地 hook 需开发者显式运行 `git config core.hooksPath .githooks`，CI 不依赖该 hook

## 审计记录：v1.7.1

- 变更版本：v1.7.1（test/docs）
- 改动概述：修复 Git C 风格路径引号导致非 ASCII Markdown 漏扫的 hygiene 假阳性
- 影响模块：repository hygiene、`.trae/documents` 历史计划文档
- 变更文件与补丁摘要：
  - `apps/yi/tests/repository-hygiene-contract.mjs`：使用 `git -c core.quotePath=false ls-files -z` 并按 NUL 分割真实路径
  - `.trae/documents/*.md`：统一 `AGENTS.md/ANCHOR.md` 内容引用并修复单一 EOF 换行
- 验证步骤与结果：
  - `node apps/yi/tests/repository-hygiene-contract.mjs`：通过；非 ASCII 路径进入真实扫描且全部文本契约有效
  - `node apps/yi/tests/validate-project.mjs`：通过；所有项目契约有效
  - `git diff --check`：通过；无空白错误
- 风险与后续事项：
  - 保留历史文档文件名不变，只修正内容引用与格式，避免无必要的路径迁移

## 审计记录：v1.7.2

- 变更版本：v1.7.2（test/chore）
- 改动概述：用 Unicode 感知且跨 locale 的实现替代不可移植的 POSIX grep 中文范围
- 影响模块：commit-msg hook、repository hygiene、PowerShell 初始化说明
- 变更文件与补丁摘要：
  - `.githooks/commit-msg`：使用 Node `\p{Script=Han}` 检测 UTF-8 中文字符
  - `apps/yi/tests/repository-hygiene-contract.mjs`：在 Windows 使用 Git 自带 `sh.exe`、在 Unix 使用 `sh` 真实执行 hook，验证中文提交退出 0、纯英文退出 1
  - `AGENTS.md`：明确本地 hook 依赖 Node Unicode 检测
- 验证步骤与结果：
  - `node apps/yi/tests/repository-hygiene-contract.mjs`：通过；真实 Git shell 下中文提交退出 0、纯英文退出 1
  - `node apps/yi/tests/validate-project.mjs`：通过；所有项目契约有效
  - `git diff --check`：通过；无空白错误
- 风险与后续事项：
  - 本地启用 hook 前需确保 `node` 位于 PATH；这与项目统一验证入口的运行要求一致

## 审计记录：v1.7.3

- 变更版本：v1.7.3（test/chore）
- 改动概述：修复强制 LF 属性与历史 mixed EOL 索引 blob 冲突导致全新 checkout 立即变脏的问题
- 影响模块：Git 换行策略、repository hygiene、核心静态源文件
- 变更文件与补丁摘要：
  - `apps/yi/css/styles.css`、`apps/yi/index.html`、`apps/yi/js/app.js`：仅将索引内 mixed EOL 归一化为 LF，不改变文本语义
  - `apps/yi/tests/repository-hygiene-contract.mjs`：要求所有匹配 `text eol=lf` 的已跟踪文件在 Git 索引中实际为 LF
- 验证步骤与结果：
  - `node apps/yi/tests/repository-hygiene-contract.mjs`：通过；LF 属性与索引 EOL 一致
  - `node apps/yi/tests/validate-project.mjs`：通过；所有项目契约有效
  - 全新 detached worktree 的 `git status --short`：无输出
  - `git diff --check`：通过；无空白错误
- 风险与后续事项：
  - 3 个源文件在 Git diff 中会显示整文件换行变更，已用忽略行尾差异的 diff 验证无语义改动
