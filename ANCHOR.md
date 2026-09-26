# ANCHOR.md

本项目“元约定”的单一真源（Single Source of Truth）。每次改动前通读本文件；改动完成后回写本文件，确保协作与技术路径同步。

## 顶层约定

- 语言与沟通：默认中文；引用代码位置使用`file_path:line_number`
- 环境与命令：Windows + PowerShell
- 安全与合规：依赖与版本需先验证兼容性与许可
- 提交策略：除用户明确要求外不提交；以补丁提案与验证输出先行

## 项目地图

- 视图（hash 路由 `#cast` / `#library` / `#trigrams` / `#history`，`Alt+1~4` 切换）：
  - 起卦 `cast` / 三钱起卦、成卦台、本卦→之卦、解读指引、保存/复制/导出 / `apps/yi/js/modules/divination-module.js`
  - 卦典 `library` / 六十四卦方图（行=上卦、列=下卦）与列表、排序搜索；取代旧“卦象分析”“卦象查询” / `apps/yi/js/modules/library-module.js`
  - 八卦 · 易传 `trigrams` / 八卦卡片（先天次序）、四象、断卦规则、错综互、爻位说明、十翼通论（系辞上下、说卦、序卦、杂卦全文）/ `apps/yi/js/modules/knowledge-module.js`
  - 占记 `history` / 本机记录的检索、按时段筛选、重读、删除（可撤销）、导入/导出 / `apps/yi/js/modules/history-module.js`
- 支撑模块：
  - 易理核心 `YiCore`（纯函数，无 DOM，可在 Node 测试）/ `apps/yi/js/core/yijing-core.js`
  - 数据服务 `hexagramData` / 加载、失败关闭校验、索引、全名/卦画/关系卦补齐、排序搜索 / `apps/yi/js/services/hexagram-data-service-module.js`
  - 应用内核 `YizhiApp` / 配置、存储、事件、错误、原生对话框、路由、通用 UI 片段 / `apps/yi/js/app.js`
  - `notification`（toast，可带“撤销”等操作）、`theme`（深浅色）、`modal`（卦详情 `<dialog>`）、`help`（使用说明 `<dialog>`）/ `apps/yi/js/modules/`
- 样式（按关注点拆分，均为无构建的原生 CSS）：`apps/yi/css/tokens.css`（设计令牌/深色）→ `base.css`（排版、顶栏、底部导航）→ `components.css`（按钮/输入/分段/提示/对话框）→ `gua.css`（卦画）→ `taiji.css`（太极：主题切换、启动画面、载入态、成卦台中轴）→ `cast.css`（起卦、解读、经传与爻位标记）→ `library.css`（卦典、八卦与十翼）→ `history.css`（占记、减少动效、强制色、打印）
- 数据（均为 JSON + 同内容 `.js` 回退）：`data/hexagrams.json`（卦名、卦画、白话）、`data/bagua.json`（八卦属性）、`data/zhouyi.json`（经传原文，v2.1.0 新增，可选）
- 测试与 CI：`apps/yi/tests/validate-project.mjs` 为统一入口（许可证、文档、HTML 契约、数据回退一致、JS 语法，并依次运行 `yijing-core.test.mjs` 与 6 份契约测试）；`.github/workflows/pages.yml` 对所有 PR 与 main 运行验证，仅 main 构建并部署 Pages，Actions 固定到 commit SHA
- 仓库卫生：`.gitattributes` 规定文本 LF；`.githooks/commit-msg` 要求提交信息含中文（`git config core.hooksPath .githooks` 启用），`.gitmessage` 为提交模板；`LICENSE` 为 MIT

- 入口与加载顺序：`apps/yi/index.html:364-374` 按 `defer` 顺序加载 `core/yijing-core.js` → `app.js` → `services` → 各 `modules`；模块注册顺序即初始化顺序，见 `apps/yi/js/app.js:703`（`data/*.js` 仍由数据服务按需回退加载）

- 关键逻辑链路：
  - 起卦状态：唯一状态源为 `state.lines`（自下而上），成卦台、按钮、状态文案、解读全部由其推导；投掷入口 `apps/yi/js/modules/divination-module.js:84`
  - 投掷取消：`generation` 代次在重置与载入占记时递增（`cancelPending` `apps/yi/js/modules/divination-module.js:672`），进行中的投掷在动画结束后比对代次，过期即放弃写入，避免旧投掷写进新卦或占记之后
  - 三钱规则：背记 3、字记 2，和为 6/7/8/9 → 老阴/少阳/少阴/老阳；随机源优先 `crypto.getRandomValues` `apps/yi/js/core/yijing-core.js`
  - 断卦规则：依《易学启蒙·考变占》按变爻数 0~6 给出应看之处（乾坤六爻皆变用“用九/用六”）`apps/yi/js/core/yijing-core.js:25`、`237`；解读指引渲染 `apps/yi/js/modules/divination-module.js:402`，“以卦辞为断”时引卦辞与大象，爻则引爻辞、小象与爻位
  - 二进制约定：`binary` 为上爻在前的 6 位字符串，`slice(0, 3)` 为上卦、`slice(3)` 为下卦，与 `data/hexagrams.json` 一致；`bits` 为自下而上数组，仅用于渲染；全量内容契约见 `apps/yi/tests/hexagram-content-contract.mjs`
  - 数据校验（失败关闭）：六十四卦须恰好 1–64、卦画唯一、六爻齐全；八卦键名与卦画固定且展示字段非空 `apps/yi/js/services/hexagram-data-service-module.js:179`、`213`；网络失败时 `.js` 回退走同一校验；全部在局部变量中构建，上下卦或错综互任一无法解析即抛出，校验通过后才原子提交并发出 ready `250`；经传为可选增强，结构不完整时整体弃用 `233`
  - 爻辞结构：数据服务把每爻统一为 `{ title, text（经文）, gloss（白话）, xiang（小象）, content（旧字段） }` `apps/yi/js/services/hexagram-data-service-module.js:150`；有经传时经文取原文，白话由 `glossAfterClassic` 忽略标点比对剥离（比对不上退回 `splitLineText` 按首个句号切分）`apps/yi/js/core/yijing-core.js:119`、`147`
  - 经传原文：`hexagram.classic = { judgment, tuan, daxiang, lines[6], extra（用九/用六）, wenyan（乾坤）, xugua, zagua, notes }`，`hexagram.judgment` 为卦辞快捷字段；系辞、说卦、序卦、杂卦全文经 `getClassics()` 取得 `hexagram-data-service-module.js:334`；渲染片段 `UI.classicBlock` / `UI.wingsBlock` `apps/yi/js/app.js:377`
  - 经传来源与生成：王弼《周易注》底本（易學網校对，gist sui1491/52e8214c…），经 OpenCC 词典繁转简；“乾”不转“干”，罕用字（CJK 扩展 A 及 BMP 外）保留繁体以免缺字；坎上六“黴纆”据通行本改“徽纆”并记入 `notes`。已与 LarryZhu-dev/thebookofchanges 逐字比对，差异均为版本异文（如革“已日/己日”）或对方讹误（如蒙“初筮/初噬”）
  - 爻位：`linePositions(bits)` 给出当位（阳居奇、阴居偶）、居中（二、五）、相应（初四、二五、三上一阴一阳）；`positionSummary` 统计并点出“六爻皆当位（既济）/皆失位（未济）/三组皆应/上下无应” `apps/yi/js/core/yijing-core.js:175`、`195`；成卦台每爻显示当位/失位，卦文每爻显示 `UI.positionTags` `apps/yi/js/app.js:352`
  - 卦画渲染：`YizhiApp.ui.figure` 以 CSS 绘制（不依赖 U+4DC0 字形），变爻附 ○/× 标记而非只靠颜色 `apps/yi/js/app.js:305`、`apps/yi/css/gua.css`
  - 太极动效：同一 SVG（`UI.taiji`，`apps/yi/js/app.js:337`；阳=纸色、阴=墨色随主题互换）用于：主题切换（每次累计转半周，先转后以 View Transitions 自按钮圆形晕开新主题 `apps/yi/js/modules/theme-module.js:52`、`58`）、启动画面（400ms 后才显现，数据就绪淡出 `apps/yi/js/app.js:540`）、载入态 `UI.spinner`、成卦台中轴（每成一爻转 60°、与铜钱翻落同步，六爻成卦满一周并亮一圈朱晕 `apps/yi/js/modules/divination-module.js:220`、`230`）；减少动态效果时全部静止
  - 数据 IO：三份数据同一加载/回退策略 `apps/yi/js/services/hexagram-data-service-module.js:56`，经传加载失败只告警、退回白话数据；排序搜索（卦名>卦序>卦义>卦辞>爻辞>彖/大象>小象>概述>白话>文言>详解）`349`，高亮前先转义并转义正则元字符 `apps/yi/js/app.js:483`；错综互 `410`
  - 数据就绪：模块统一用 `YizhiApp.whenDataReady` 等待 `hexagram-data:ready`，失败时发出 `hexagram-data:error` 并各自显示错误态 `apps/yi/js/app.js:576`
  - 存储边界：优先 `localStorage`，兼容迁移旧 `sessionStorage`，不可用时转内存 Map `apps/yi/js/app.js:135`；`localStorage` 读取异常仍尝试旧值，迁移写入失败时返回旧值并保留原数据待下次重试；键：`yizhi_theme`、`yizhi_divination_history`、`yizhi_library_layout`
  - 占记编解码：存储结构 v1 只存引用与用户输入 `{ version: 1, id, timestamp, question, notes, lines: [6|7|8|9], hexagramId, source }`，不复制卦文 `apps/yi/js/modules/history-module.js:140`；读取时经数据服务按六爻（无六爻时按卦序）重新水合，非法卦序、未知版本、残缺六爻整条丢弃并回写清理 `93`、`162`；数据就绪前不读不写；兼容旧版完整 hexagram 对象、`{ type, changing }` 六爻与 `divination` 来源；删除可撤销 `206`；导入走同一解码并按 id 去重 `388`
  - 安全渲染：占记列表以 DOM API 构建，所问与备注只经 `textContent` 输出 `apps/yi/js/modules/history-module.js:302`；卦详情只渲染 canonical 卦，传入对象仅取卦序重新查询 `apps/yi/js/modules/modal-module.js:32`；其余文本经 `escapeHtml`
  - 从占记重读：六爻完整的记录回到起卦页完整还原 `apps/yi/js/modules/divination-module.js:717`；未保存进度被覆盖前需确认 `667`
  - 对话框：统一原生 `<dialog>`（焦点圈定、Esc 由浏览器提供），点遮罩关闭、关闭后还原到最初的外部 opener（详情内切换关系卦不覆盖）、危险确认默认聚焦“取消” `apps/yi/js/app.js:243`
  - 错误处理：`ErrorHandler.handle` 记录日志并以 toast 提示；全局 error/unhandledrejection 在 `YizhiApp.init` 中注册一次 `apps/yi/js/app.js:623`
  - 键盘：空格掷爻（仅起卦页、非输入框）、`/` 或 `Ctrl+K` 搜索卦典、`?` 帮助、`Alt+1~4` 切换视图 `apps/yi/js/app.js:589`

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

- v2.1.1（bugfix/merge）：合并 main 的 v1.2.0–v1.7.5 修复并移植到 v2 结构：数据失败关闭校验与原子提交、占记 v1 编解码与 canonical 水合、持久化文本只经 textContent、存储迁移容错、重置/载入占记取消进行中的投掷；契约测试改写为 v2 并纳入统一验证入口
- v2.1.0（feature）：补入经传原文（卦辞、爻辞、彖、大象、小象、文言、用九用六，及系辞上下、说卦、序卦、杂卦）；恢复并升级太极动效（主题切换半周旋转 + 墨晕揭示、启动画面、载入态、成卦台中轴）；外显爻位（当位/失位、居中、相应）
- v2.0.0（refactor）：以“成卦即得所读之辞”为核心重构信息架构、交互与视觉；新增易理核心纯函数与单测、卦典方图、占记重读/撤销/导入；样式拆分为 7 个文件，代码量约减少 45%
- v1.7.5（test/bugfix）：repository hygiene 只扫描 Git 已跟踪路径，排除未跟踪本地草稿对验证的干扰
- v1.7.4（test/chore）：commit-msg hook 忽略注释化模板提示，拒绝“英文内容 + 中文模板”的假阳性
- v1.7.3（test/chore）：归一化 3 个与 LF 属性冲突的核心源文件，并增加索引 EOL 回归契约
- v1.7.2（test/chore）：commit-msg hook 改用 Node Unicode Han 检测，并通过真实 shell 执行测试验证中文放行、纯英文拒绝
- v1.7.1（test/docs）：hygiene 扫描改用未引号化 NUL 路径，覆盖非 ASCII 文件名，并修正 `.trae/documents` 中被旧扫描漏掉的引用与 EOF
- v1.7.0（docs/chore）：统一 `AGENTS.md/ANCHOR.md` 大小写与文档引用；明确 LF 策略；加入中文提交 hook/template 和 repository hygiene 契约
- v1.6.1（ci/bugfix）：build job 增加 `pages: read` 以兼容 private/internal 仓库读取 Pages 配置，同时保持部署写权限隔离
- v1.6.0（ci）：所有 PR/main 统一运行项目契约验证；Pages build/deploy 只消费通过验证的 main 快照；默认只读、部署最小权限并固定 Actions SHA
- v1.5.5（data/bugfix）：校正屯、贲、升的上下卦与空间意象，并以六爻编码推导契约全量扫描 64 卦
- v1.5.4（bugfix）：localStorage 读取异常时继续尝试 legacy sessionStorage；八卦 schema 要求所有用户可见说明字段为非空字符串
- v1.5.3（bugfix）：八卦 schema 固定每个卦名的 canonical 三位二进制映射，拒绝交换编码但仍格式唯一的语义畸形快照

> 说明：超出最近14个版本的记录已转入归档文件 `CHANGELOG-ARCHIVE.md`；各版本审计记录保留在本文件下方。

## 互动规则

- AI需在每次任务前后引用并维护本文件；保持“元约定”优先级最高
- 任何引入的依赖或约定更改，必须在本文件体现并进入最近14个版本日志

## 演练记录（首版）

- 目标：以不提交代码为前提，完成文档落地与验证
- 步骤：
- 阅读本锚点 → 更新 `AGENTS.md` → 新增 `ANCHOR.md` → 在“最近14个版本变更日志”登记 `v1.0.0`
- 输出：两文档已创建并包含提示词、约定与日志模板
- 结论：文档协作路径可用，后续改动可沿用审计模板记录

## 审计记录：v2.1.1

- 变更版本：v2.1.1（bugfix/merge）
- 改动概述：将 `main` 上 v1.2.0–v1.7.5 的稳定性与安全修复合并进 v2 分支。v2 已重写相关模块，因此不直接取用旧实现，而是把每条不变量移植到 v2 结构，并把针对 v1 DOM 的契约测试改写为 v2 行为测试，断言保持同等强度。
- 版本号说明：v2 分支此前在本地登记的 v1.2.0–v1.5.0 从未推送，且与 `main` 上同号版本内容不同；合并后以 `main` 的 v1.x 为准，本地那几条已随 v2.0.0 一并落地，不再单列。
- 影响模块：数据服务、存储、占记、起卦、卦详情；测试与验证入口；锚点与 README
- 变更文件与补丁摘要：
  - `hexagram-data-service-module.js`：新增 `validateHexagramData` / `validateBaguaData` / `validateClassics`；八卦固定键名与卦画、展示字段非空；六十四卦恰好 1–64、卦画唯一、六爻齐全；上下卦与错综互无法解析即抛出；全部在局部变量中构建后原子提交；经传结构不完整时整体弃用并告警
  - `app.js`：`StorageManager.getItem` 将 localStorage 读取与迁移写入分别兜底；版本号 2.1.1
  - `history-module.js`：重写为 v1 编解码——只存引用与用户输入，读取时按六爻/卦序经数据服务水合；拒绝非法卦序、未知版本、残缺六爻并回写清理；列表改为 DOM API 构建，持久化文本只经 `textContent`；数据未就绪时显示载入态、失败时显示错误态，均不触碰存储；导出改为存储结构
  - `divination-module.js`：新增 `generation` 代次与 `cancelPending`；强制重置与载入占记会取消进行中的投掷
  - `modal-module.js`：只渲染 canonical 卦，传入对象只取卦序重新查询
  - 测试：`static-ui-contract.mjs`（真实数据服务 + 卦典的卦序/特殊字符/转义搜索、对话框 opener 保持、投掷取消）、`data-service-contract.mjs`（加载 YiCore，新增经传可选且损坏整体弃用）、`history-security-contract.mjs`（v2 API 下的编解码、canonical 水合、保存边界、详情 canonical、存储迁移容错）改写为 v2；`repository-hygiene-contract.mjs` 兼容 PATH 中 `Git\mingw64\bin\git.exe` 的布局查找 `sh.exe`；`validate-project.mjs` 合并双方检查并依次运行核心单测与 6 份契约
  - 合并自 `main` 未改动：`.gitattributes`、`LICENSE`、`.githooks/commit-msg`、`.gitmessage`、`AGENTS.md`、`.github/workflows/pages.yml`、`hexagrams.json/.js`（屯、贲、升校正）、`hexagram-content-contract.mjs`、`ci-workflow-contract.mjs`、`docs/plans/*`
  - 新增 `CHANGELOG-ARCHIVE.md`：收纳超出最近 14 个版本的变更日志
- 默认值与安全边界：
  - 占记最多保存 200 条（`APP_CONFIG.history.maxRecords`）；所问与备注去除控制字符并截断为 500 字，id 截断为 100 字
  - 首次在 v2.1.1 打开占记时，旧记录会被一次性迁移为 v1 结构；无法校验的记录会被丢弃且不可恢复（与 `main` v1.5.0 行为一致）
  - 数据加载失败时占记不读不写，避免把无法校验的记录误清掉
- 验证步骤与结果：
  - `node .\apps\yi\tests\validate-project.mjs`：通过（核心单测 13 项 + 6 份契约）
  - 回归校验：临时去掉 `castOnce` 中的代次检查后，`static-ui-contract.mjs` 以“重置后旧投掷不得写入第一爻”失败，恢复后通过
  - `git add --renormalize .` 后 `git ls-files --eol` 中 LF 策略文件均为 `i/lf`；`git diff --cached --check`：通过
  - 浏览器（`python -m http.server 8765 --bind 127.0.0.1`，工作目录 `apps/yi`）：预置 4 条旧占记（恶意卦名 + HTML 备注、`{ type, changing }` 六爻、卦序 999、version 9）后打开占记——保留 2 条并回写为 v1 结构，备注以纯文本显示、列表内无注入节点；投掷中载入占记得完整六爻、无第七爻；投掷中强制重置后回到“掷第一爻”；一次成卦并保存后存储只含爻值与卦序；“查阅”记录打开 canonical 详情，伪造对象不打开；卦典搜索 `[(*` 无异常；390×844 深色无横向溢出；控制台 0 条消息
- 风险与后续事项：
  - 旧版“查阅保存”记录只有卦序，重读时只能打开详情
  - `docs/plans/2026-07-11-*` 描述的是 v1 结构下的修复方案，保留作为历史设计记录

## 审计记录：v2.1.0

- 变更版本：v2.1.0（feature）
- 改动概述：回应三项反馈——①太极动效不可取消，需恢复并升级；②补全卦辞及十翼；③当位与否需外显。
- 影响模块：数据服务、易理核心、起卦、卦详情、八卦 · 易传、主题；新增经传数据与太极样式
- 变更文件与补丁摘要：
  - 新增 `apps/yi/data/zhouyi.json` / `zhouyi.js`（约 124KB，内容一致）：64 卦卦辞、彖、大象、384 爻爻辞与小象、用九用六、乾坤文言、每卦序卦/杂卦对应句（乾坤不入序卦正文，62 卦有序卦句）；附系辞上 21 段、系辞下 16 段、说卦 17 段、序卦 18 段、杂卦 8 段；`source` 字段注明底本与转换规则
  - `hexagram-data-service-module.js`：三份数据合并为同一 `loadDataset` 加载/回退逻辑；经传为可选增强；统一爻辞结构；新增 `getClassics()`；搜索覆盖卦辞、彖、象、文言与白话并标注命中字段
  - `yijing-core.js`：新增 `glossAfterClassic`、`linePositions`、`positionSummary`；断卦规则文案由“卦义”恢复为“卦辞”
  - `app.js`：新增 `UI.taiji`、`UI.spinner`、`UI.positionTags`、`UI.positionSummary`、`UI.classicBlock`、`UI.wingsBlock`、`BootSplash`；`lineList` 改为“爻题 + 爻位标记 / 经文 / 小象 / 白话”，乾坤附用九用六；版本号 2.1.0
  - `divination-module.js`：成卦台骨架常驻，上下卦之间设太极中轴；每爻显示当位/失位；指引与卦文改用原文，新增“卦辞 · 彖 · 象”“白话”“传”分区；复制文本含卦辞、爻辞与小象
  - `modal-module.js`：详情含卦辞、彖、象、爻位、小象、文言、序卦、杂卦；复制卦文同步
  - `knowledge-module.js` + `index.html`：视图标题改为“八卦 · 易传”；新增“爻位”说明卡与“十翼”折叠全文；新增启动画面；主题按钮改为太极
  - `theme-module.js`：太极累计半周旋转；先转 260ms 再以 View Transitions 圆形揭示新主题；连续点击以最后一次为准
  - 新增 `css/taiji.css`；`cast.css` 新增经传、小象、爻位标记样式；`library.css` 新增十翼样式并将知识卡改为两列；`base.css` 删去不再使用的日月图标规则
  - 测试：`yijing-core.test.mjs` 新增 4 项（爻位、白话剥离、经传完整性、用九用六与原文一致及 384 爻白话剥离）；`validate-project.mjs` 校验 `zhouyi.json` 与 `.js` 回退一致、64 卦、含出处
- 默认值与安全边界：
  - 经传数据缺失或加载失败时仅 `console.warn`，界面退回 v2.0.0 的白话爻辞，不阻断起卦
  - 启动画面 8 秒兜底移除；无脚本（`noscript`）时不出现；启动异常时立即移除
  - 所有经传文本经 `escapeHtml` 输出，不以 HTML 注入
  - 未新增任何第三方依赖；繁简转换只在离线生成阶段使用 OpenCC 词典，不随站点发布
- 验证步骤与结果：
  - `node .\apps\yi\tests\yijing-core.test.mjs`：13 项全部通过
  - `node .\apps\yi\tests\validate-project.mjs`：通过
  - `Get-ChildItem -Path .\apps\yi\js -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }`：通过
  - 浏览器（`python -m http.server 8765 --bind 127.0.0.1`，工作目录 `apps/yi`）：1440×900 深色下重读“既济之咸”——成卦台太极中轴转满一周，六爻均标“当位”，指引引六四、初九爻辞与小象及爻位标记，卦文显示卦辞/彖/象与“六爻皆当位，三组皆应”；切换主题太极转半周、主题正确切换、`aria-pressed` 同步；“八卦 · 易传”十翼五篇可展开；390×844 下乾卦详情显示用九、文言、杂卦，起卦页四列成卦行无溢出；控制台 0 errors / 0 warnings
  - 数据校对：与 LarryZhu-dev/thebookofchanges 逐字段比对，108 处差异逐一复核，均为排版切分、通假异文或对方讹误，未发现本方转写错误
- 风险与后续事项：
  - 旧白话数据有 58 爻只存到经文首句，白话剥离采用“比对不上则按首句号切分”，个别爻白话可能仍含半句经文；后续可逐条校订 `hexagrams.json`
  - 旧白话中有少量与原文不符的讹字（如同人九三“伏戎于莽”作“伏战于莽”），现在经文以原文为准，白话未改
  - View Transitions 圆形揭示需 Chromium 111+ / Safari 18+，其他浏览器仅旋转后直接切换
  - 序卦、杂卦按句归属到卦为规则切分（“而”后对举、名后置等），已逐卦人工核对；若更换底本需复核 `xugua` / `zagua`

## 审计记录：v2.0.0

- 变更版本：v2.0.0（refactor）
- 改动概述：从“用户为何打开这个页面”出发重构信息架构、交互与视觉。核心路径由“掷六次 → 自己翻四个标签页找答案”改为“掷六次 → 直接看到本卦、之卦和应读的那一句”。
- 第一性原理拆解：
  - 用户的核心任务只有一个：问一件事，得到可读的卦与应看的辞。其余（查卦、学八卦、回顾）都是支线。
  - 旧版对同一状态有五处重复反馈（步骤条、进度条、流程看板、过程日志、按钮副标题），合并为唯一的“成卦台”。
  - 旧版需要手动点“变卦显示”才能看到之卦；新版本卦与之卦并排，按《易学启蒙》规则自动给出应读爻辞。
  - “卦象分析”（选上下卦）与“卦象查询”本质都是找卦，合并为“卦典”：8×8 方图即上下卦组合，列表支持排序搜索。
  - 删除无依据的“吉凶/事业/感情”按字匹配分类，避免给出看似权威的错误结果。
- 影响模块：全部视图与样式；数据文件未改动
- 变更文件与补丁摘要：
  - 新增 `apps/yi/js/core/yijing-core.js`：三钱、爻、之卦、错综互、全名、爻辞拆分、断卦规则等纯函数
  - 新增 `apps/yi/js/modules/library-module.js`；删除 `hexagram-analyzer-module.js`、`search-module.js`
  - 重写 `apps/yi/index.html`：四视图 + 三个原生 `<dialog>`；窄屏改为底部导航；移除全屏加载遮罩与内联 onclick（启动失败兜底除外）
  - 重写 `apps/yi/js/app.js`：精简为存储/事件/错误/对话框/路由/UI 片段；移除未使用的性能监控、restart/destroy、节流等
  - 重写 `divination-module.js`、`history-module.js`、`knowledge-module.js`、`modal-module.js`、`notification-module.js`、`theme-module.js`、`help-module.js`
  - 更新 `hexagram-data-service-module.js`：补齐 `fullName`/`bits`，排序搜索返回命中片段，加载失败发出 `hexagram-data:error`
  - `css/styles.css`（4179 行）拆分为 7 个按关注点组织的样式文件；新视觉为“宣纸 / 墨 / 朱砂”，朱色只用于标记变爻
  - 新增 `apps/yi/tests/yijing-core.test.mjs`；`validate-project.mjs` 改为校验 id 唯一、资源存在、脚本引用的 id 存在、视图与模块一一对应，并纳入核心单测
  - 代码总量约 9369 行 → 约 5200 行（含新增测试与核心模块）
- 交互细节：
  - 空格掷爻；“一次成卦”加速剩余投掷；系统开启“减少动态效果”时跳过动画
  - 重来/覆盖未保存的卦前确认；单条占记删除改为“撤销”而非确认弹窗
  - 保存按钮保存后保持可聚焦（`aria-disabled`），避免焦点丢失；成卦后焦点移至解读标题，窄屏自动滚动到解读
  - 深浅色默认跟随系统，手动切换后记忆
- 验证步骤与结果：
  - `node .\apps\yi\tests\yijing-core.test.mjs`：9 项全部通过（含 384 爻爻题与阴阳一致性）
  - `node .\apps\yi\tests\validate-project.mjs`：通过
  - `Get-ChildItem -Path .\apps\yi\js -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }`：通过
  - 浏览器（`python -m http.server 8765 --bind 127.0.0.1`，工作目录 `apps/yi`）：1440×900 与 390×844 下完成起卦 → 保存 → 占记重读 → 删除并撤销 → 卦典搜索“潜龙”→ 方图打开“既济”详情 → 深浅色切换；控制台 0 errors / 0 warnings；无横向溢出
  - 人工核对：无妄之家人（三、四爻变）指引为九四为主、六三参看；无妄错升、综大畜、互渐；既济错综互皆为未济
- 风险与后续事项：
  - 视觉依赖 `color-mix()`、`:has()`、容器查询与原生 `<dialog>`，需 2023 年后的主流浏览器；旧浏览器顶栏退化为不透明、弹窗打开时背景可滚动
  - 数据只有卦义（白话概述），无传统卦辞原文；“以卦辞为断”的情形暂以卦义代替，后续可补充卦辞、彖传、象传字段
  - 旧版占记若只存了卦（来自“查阅保存”），无法在起卦页重读，只能打开详情
  - 卦名全名依赖八卦 `nature` 字段组合，若修改 `bagua.json` 需复跑单测

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
  - 将后续改动按版本写入“最近14个版本变更日志”

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

## 审计记录：v1.5.5

- 变更版本：v1.5.5（data/bugfix）
- 改动概述：校正屯、贲、升的卦象组成叙述，并建立从六爻编码推导上下卦的全量内容契约
- 影响模块：卦象 JSON/JS fallback、数据文档、项目统一验证
- 变更文件与补丁摘要：
  - `apps/yi/data/hexagrams.json`、`hexagrams.js`：屯校正为坎(水)上震(雷)下，贲意象校正为“山下有火”，升意象校正为“地中生木”
  - `apps/yi/tests/hexagram-content-contract.mjs`：校验 JSON/JS 一致，并对 64 卦逐一推导上下卦、overview 和 detail 组成首句
  - `apps/yi/tests/validate-project.mjs`：将卦象内容契约纳入统一验证
  - `apps/yi/README.md`：记录六位编码位序、上下卦推导和经典物象边界
- 验证步骤与结果：
  - `node apps/yi/tests/hexagram-content-contract.mjs`：通过；64 卦结构叙述、三个定点意象和 fallback 一致性有效
  - `node apps/yi/tests/validate-project.mjs`：通过；静态交互、数据服务、内容语义和历史安全契约全部有效
  - `git diff --check`：通过；无空白错误
- 风险与后续事项：
  - 契约锁定数据服务的当前位序语义；若未来改变编码方向，必须同步迁移服务、64 卦数据与文档
  - 经典意象依据《周易·大象》；不扩展为对所有现代解读文本的学术校订

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

## 审计记录：v1.7.4

- 变更版本：v1.7.4（test/chore）
- 改动概述：防止中文提交模板的提示文本让纯英文实际内容绕过 commit-msg hook
- 影响模块：commit-msg hook、提交模板、repository hygiene、PowerShell 启用说明
- 变更文件与补丁摘要：
  - `.gitmessage`：将所有指导文本改为 `#` 注释行，不再成为实际提交内容
  - `.githooks/commit-msg`：检测 Han 字符前排除注释行
  - `apps/yi/tests/repository-hygiene-contract.mjs`：真实执行 hook 并覆盖“英文摘要 + 中文模板”拒绝路径
  - `AGENTS.md`：记录 hook 忽略模板注释的边界
- 验证步骤与结果：
  - `node apps/yi/tests/repository-hygiene-contract.mjs`：通过；中文内容放行，纯英文与带模板的纯英文内容均拒绝
  - `node apps/yi/tests/validate-project.mjs`：通过；所有项目契约有效
  - `git diff --check`：通过；无空白错误
- 风险与后续事项：
  - 以 `#` 开头的行按 Git 默认提交注释处理，不参与中文校验

## 审计记录：v1.7.5

- 变更版本：v1.7.5（test/bugfix）
- 改动概述：修正 repository hygiene 的输入边界，使统一验证只取决于版本库文件
- 影响模块：repository hygiene、PowerShell 本地验证说明
- 变更文件与补丁摘要：
  - `apps/yi/tests/repository-hygiene-contract.mjs`：移除 `git ls-files --others`，只扫描 `--cached` 返回的 Git 已跟踪/已暂存路径
  - `apps/yi/tests/repository-hygiene-contract.mjs`：新增未跟踪 Markdown fixture，验证旧文件名和行尾空白不会污染仓库校验
  - `AGENTS.md`：明确 hygiene 排除未跟踪本地草稿
- 验证步骤与结果：
  - `node apps/yi/tests/repository-hygiene-contract.mjs`：通过；未跟踪 fixture 不进入扫描，fixture 执行后已清理
  - `node apps/yi/tests/validate-project.mjs`：通过；全部项目契约有效
  - `git diff --check`：通过；无空白错误
- 风险与后续事项：
  - 未暂存的新文件不会进入 hygiene；新文件在提交前需先 `git add`，即纳入 `--cached` 输入
