# anchor.md

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

## 最近5个版本变更日志

- v1.1.0（arch/docs）：完整梳理架构与技术路径；填充“项目地图”与“关键逻辑链路”；新增 v1.1.0 审计记录与手动验证建议；保持静态架构与 GitHub Pages 部署路径不变
- v1.0.0（feature）：新增协作文档 `agents.md` 与锚点文档 `anchor.md`；确立角色、流程、提示词与审计规范；落实 Windows + PowerShell 约定

> 说明：超出最近5个版本的记录请转入归档文件（如 `CHANGELOG-ARCHIVE.md`）。

## 互动规则

- AI需在每次任务前后引用并维护本文件；保持“元约定”优先级最高
- 任何引入的依赖或约定更改，必须在本文件体现并进入最近14个版本日志

## 演练记录（首版）

- 目标：以不提交代码为前提，完成文档落地与验证
- 步骤：
- 阅读本锚点 → 更新`Agents.md` → 新增`anchor.md` → 在“最近14个版本变更日志”登记`v1.0.0`
- 输出：两文档已创建并包含提示词、约定与日志模板
- 结论：文档协作路径可用，后续改动可沿用审计模板记录

## 审计记录：v1.0.0

- 变更版本：v1.0.0（feature）
- 改动概述：建立AI协作与锚点机制
- 影响模块：文档与协作流程
- 变更文件与补丁摘要：
  - 更新 `Agents.md`：新增角色、流程、提示词、审计规范
  - 新增 `anchor.md`：顶层约定、检查清单、审计模板、5版本日志
- 验证步骤与结果：
  - PowerShell 手动验证建议：
    - `Get-Content -Path .\Agents.md -TotalCount 10`
    - `Get-Content -Path .\anchor.md -TotalCount 10`
  - 结果：两文件存在且包含约定与模板
- 风险与后续事项：
  - 后续需逐步填充“项目地图”与“关键逻辑链路”
  - 将后续改动按版本写入“最近5个版本变更日志”

## 审计记录：v1.1.0

- 变更版本：v1.1.0（arch/docs）
- 改动概述：梳理项目结构、架构与技术路径；更新 `anchor.md` 的“项目地图”与“关键逻辑链路”；新增验证建议与版本日志
- 影响模块：文档与协作流程（代码无改动）
- 变更文件与补丁摘要：
  - 更新 `anchor.md`：替换“项目地图”占位；新增关键逻辑链路；登记变更日志；新增本审计记录
- 验证步骤与结果：
  - PowerShell 手动验证建议：
    - `Select-String -Path .\apps\yi\js\app.js -Pattern "registerModule" | Measure-Object`
    - `Get-Content -Path .\apps\yi\index.html -TotalCount 30 ; Get-Content -Path .\apps\yi\index.html -Tail 20`
    - `Select-String -Path .\apps\yi\js\services\hexagram-data-service-module.js -Pattern "fetch\(|__HEXAGRAM_DATA__|hexagram-data:ready"`
    - `Get-ChildItem -Path .\apps\yi\js\modules | Select-Object -ExpandProperty Name`
  - 结果：模块注册与脚本顺序、数据服务回退与事件均与锚点记录一致
- 风险与后续事项：
  - 持续维护“项目地图”与“关键逻辑链路”，模块增删或逻辑调整须同步回写
