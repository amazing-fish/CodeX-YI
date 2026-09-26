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
  - 数据服务 `hexagramData` / 加载、索引、全名/卦画/关系卦补齐、排序搜索 / `apps/yi/js/services/hexagram-data-service-module.js`
  - 应用内核 `YizhiApp` / 配置、存储、事件、错误、原生对话框、路由、通用 UI 片段 / `apps/yi/js/app.js`
  - `notification`（toast，可带“撤销”等操作）、`theme`（深浅色）、`modal`（卦详情 `<dialog>`）、`help`（使用说明 `<dialog>`）/ `apps/yi/js/modules/`
- 样式（按关注点拆分，均为无构建的原生 CSS）：`apps/yi/css/tokens.css`（设计令牌/深色）→ `base.css`（排版、顶栏、底部导航）→ `components.css`（按钮/输入/分段/提示/对话框）→ `gua.css`（卦画）→ `taiji.css`（太极：主题切换、启动画面、载入态、成卦台中轴）→ `cast.css`（起卦、解读、经传与爻位标记）→ `library.css`（卦典、八卦与十翼）→ `history.css`（占记、减少动效、强制色、打印）
- 数据（均为 JSON + 同内容 `.js` 回退）：`data/hexagrams.json`（卦名、卦画、白话）、`data/bagua.json`（八卦属性）、`data/zhouyi.json`（经传原文，v2.1.0 新增，可选）

- 入口与加载顺序：`apps/yi/index.html:364-374` 按 `defer` 顺序加载 `core/yijing-core.js` → `app.js` → `services` → 各 `modules`；模块注册顺序即初始化顺序，见 `apps/yi/js/app.js:684`（`data/*.js` 仍由数据服务按需回退加载）

- 关键逻辑链路：
  - 起卦状态：唯一状态源为 `state.lines`（自下而上），成卦台、按钮、状态文案、解读全部由其推导；投掷入口 `apps/yi/js/modules/divination-module.js:82`
  - 三钱规则：背记 3、字记 2，和为 6/7/8/9 → 老阴/少阳/少阴/老阳；随机源优先 `crypto.getRandomValues` `apps/yi/js/core/yijing-core.js`
  - 断卦规则：依《易学启蒙·考变占》按变爻数 0~6 给出应看之处（乾坤六爻皆变用“用九/用六”）`apps/yi/js/core/yijing-core.js:25`、`237`；解读指引渲染 `apps/yi/js/modules/divination-module.js:397`，“以卦辞为断”时引卦辞与大象，爻则引爻辞、小象与爻位
  - 二进制约定：`binary` 为上爻在前的 6 位字符串，与 `data/hexagrams.json` 一致；`bits` 为自下而上数组，仅用于渲染
  - 爻辞结构：数据服务把每爻统一为 `{ title, text（经文）, gloss（白话）, xiang（小象）, content（旧字段） }` `apps/yi/js/services/hexagram-data-service-module.js:153`；有经传时经文取原文，白话由 `glossAfterClassic` 忽略标点比对剥离（比对不上退回 `splitLineText` 按首个句号切分）`apps/yi/js/core/yijing-core.js:119`、`147`
  - 经传原文：`hexagram.classic = { judgment, tuan, daxiang, lines[6], extra（用九/用六）, wenyan（乾坤）, xugua, zagua, notes }`，`hexagram.judgment` 为卦辞快捷字段；系辞、说卦、序卦、杂卦全文经 `getClassics()` 取得 `hexagram-data-service-module.js:244`；渲染片段 `UI.classicBlock` / `UI.wingsBlock` `apps/yi/js/app.js:364`
  - 经传来源与生成：王弼《周易注》底本（易學網校对，gist sui1491/52e8214c…），经 OpenCC 词典繁转简；“乾”不转“干”，罕用字（CJK 扩展 A 及 BMP 外）保留繁体以免缺字；坎上六“黴纆”据通行本改“徽纆”并记入 `notes`。已与 LarryZhu-dev/thebookofchanges 逐字比对，差异均为版本异文（如革“已日/己日”）或对方讹误（如蒙“初筮/初噬”）
  - 爻位：`linePositions(bits)` 给出当位（阳居奇、阴居偶）、居中（二、五）、相应（初四、二五、三上一阴一阳）；`positionSummary` 统计并点出“六爻皆当位（既济）/皆失位（未济）/三组皆应/上下无应” `apps/yi/js/core/yijing-core.js:175`、`195`；成卦台每爻显示当位/失位，卦文每爻显示 `UI.positionTags` `apps/yi/js/app.js:339`
  - 卦画渲染：`YizhiApp.ui.figure` 以 CSS 绘制（不依赖 U+4DC0 字形），变爻附 ○/× 标记而非只靠颜色 `apps/yi/js/app.js:282`、`apps/yi/css/gua.css`
  - 太极动效：同一 SVG（`UI.taiji`，`apps/yi/js/app.js:324`；阳=纸色、阴=墨色随主题互换）用于：主题切换（每次累计转半周，先转后以 View Transitions 自按钮圆形晕开新主题 `apps/yi/js/modules/theme-module.js:58`、`83`）、启动画面（400ms 后才显现，数据就绪淡出 `apps/yi/js/app.js:527`）、载入态 `UI.spinner`、成卦台中轴（每成一爻转 60°、与铜钱翻落同步，六爻成卦满一周并亮一圈朱晕 `apps/yi/js/modules/divination-module.js:215`、`225`）；减少动态效果时全部静止
  - 数据 IO：三份数据同一加载/回退策略 `apps/yi/js/services/hexagram-data-service-module.js:50`，经传加载失败只告警、退回白话数据；索引、关系卦与经传合并 `169`；排序搜索（卦名>卦序>卦义>卦辞>爻辞>彖/大象>小象>概述>白话>文言>详解）`259`；错综互 `320`
  - 数据就绪：模块统一用 `YizhiApp.whenDataReady` 等待 `hexagram-data:ready`，失败时发出 `hexagram-data:error` 并各自显示错误态 `apps/yi/js/app.js:563`
  - 存储边界：优先 `localStorage`，兼容迁移旧 `sessionStorage`，不可用时转内存 Map `apps/yi/js/app.js:135`；键：`yizhi_theme`、`yizhi_divination_history`、`yizhi_library_layout`
  - 占记结构与兼容：新记录含 `question/lines/hexagramId/changedHexagramId`；旧记录（完整 hexagram 对象、无 value、无 id）在读取时标准化 `apps/yi/js/modules/history-module.js:57`；删除可撤销 `129`；导入按 id 去重 `262`
  - 从占记重读：六爻完整的记录回到起卦页完整还原 `apps/yi/js/modules/divination-module.js:703`；未保存进度被覆盖前需确认 `662`
  - 对话框：统一原生 `<dialog>`（焦点圈定、Esc 由浏览器提供），点遮罩关闭、关闭后还原焦点、危险确认默认聚焦“取消” `apps/yi/js/app.js:230`
  - 错误处理：`ErrorHandler.handle` 记录日志并以 toast 提示；全局 error/unhandledrejection 在 `YizhiApp.init` 中注册一次 `apps/yi/js/app.js:221`
  - 键盘：空格掷爻（仅起卦页、非输入框）、`/` 或 `Ctrl+K` 搜索卦典、`?` 帮助、`Alt+1~4` 切换视图 `apps/yi/js/app.js:575`

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

- v2.1.0（feature）：补入经传原文（卦辞、爻辞、彖、大象、小象、文言、用九用六，及系辞上下、说卦、序卦、杂卦）；恢复并升级太极动效（主题切换半周旋转 + 墨晕揭示、启动画面、载入态、成卦台中轴）；外显爻位（当位/失位、居中、相应）

- v2.0.0（refactor）：以“成卦即得所读之辞”为核心重构信息架构、交互与视觉；新增易理核心纯函数与单测、卦典方图、占记重读/撤销/导入；样式拆分为 7 个文件，代码量约减少 45%
- v1.5.0（bugfix/docs）：修复本地预览 favicon 404、搜索/知识模块共享 DOM、历史记录会话级存储、文档命名漂移与缺失提交钩子；新增项目验证脚本
- v1.4.1（bugfix）：修复卦象分析快捷组合首屏依赖数据时序导致的空符号问题；统一搜索“风”标签关键词；移除重复的全局错误监听
- v1.4.0（refactor）：重构占卜主流程反馈层，新增流程看板（当前阶段/变爻统计/建议动作）与六爻过程记录，显著强化可见体验与状态透明度
- v1.3.1（feature）：补充可见型 P1 体验优化：占卜区新增“下一步操作提示”文案，完成六爻后自动滚动到解读区域，提升过程感知
- v1.3.0（refactor）：完成 P1 内部逻辑与可访问性优化：HexagramDataService 增加索引映射与更安全的关系卦回传；Modal 增加焦点保存/恢复与 Tab 焦点圈定
- v1.2.0（refactor）：完成 P0 稳定性优化：移除首屏固定数据预加载脚本、改为服务层按需回退加载；统一主题初始化键与节点；修复搜索正则高亮边界；历史记录改为 timestamp 并兼容旧数据
- v1.1.0（arch/docs）：完整梳理架构与技术路径；填充“项目地图”与“关键逻辑链路”；新增 v1.1.0 审计记录与手动验证建议；保持静态架构与 GitHub Pages 部署路径不变
- v1.0.0（feature）：新增协作文档 `AGENTS.md` 与锚点文档 `ANCHOR.md`；确立角色、流程、提示词与审计规范；落实 Windows + PowerShell 约定

> 说明：超出最近14个版本的记录请转入归档文件（如 `CHANGELOG-ARCHIVE.md`）。

## 互动规则

- AI需在每次任务前后引用并维护本文件；保持“元约定”优先级最高
- 任何引入的依赖或约定更改，必须在本文件体现并进入最近14个版本日志

## 演练记录（首版）

- 目标：以不提交代码为前提，完成文档落地与验证
- 步骤：
- 阅读本锚点 → 更新`AGENTS.md` → 新增`ANCHOR.md` → 在“最近14个版本变更日志”登记`v1.0.0`
- 输出：两文档已创建并包含提示词、约定与日志模板
- 结论：文档协作路径可用，后续改动可沿用审计模板记录

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
  - 新增 `ANCHOR.md`：顶层约定、检查清单、审计模板、14版本日志
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

- 变更版本：v1.2.0（refactor）
- 改动概述：落实 P0 稳定性优化，减少首屏冗余加载并修复核心一致性问题
- 影响模块：数据服务、主题、搜索、历史记录、占卜/模态保存链路
- 变更文件与补丁摘要：
  - 更新 `apps/yi/index.html`：移除固定 `data/hexagrams.js`、`data/bagua.js` 引用；主题预初始化改用 `yizhi_theme`（兼容旧 `theme`）
  - 更新 `apps/yi/js/services/hexagram-data-service-module.js`：新增本地协议/加载失败时按需注入预加载脚本的回退策略
  - 更新 `apps/yi/js/modules/theme-module.js`：统一使用 `document.documentElement` 作为主题挂载节点；兼容新旧 mediaQuery 监听 API
  - 更新 `apps/yi/js/modules/search-module.js`：新增 `escapeRegExp`，避免输入正则特殊字符导致搜索崩溃
  - 更新 `apps/yi/js/modules/history-module.js`：历史记录标准化为 `timestamp + date`，筛选与统计优先用 timestamp 并兼容旧数据
  - 更新 `apps/yi/js/modules/divination-module.js`、`apps/yi/js/modules/modal-module.js`：保存历史时补充 timestamp
- 验证步骤与结果：
  - `node --check "apps/yi/js/services/hexagram-data-service-module.js" && node --check "apps/yi/js/modules/theme-module.js" && node --check "apps/yi/js/modules/search-module.js" && node --check "apps/yi/js/modules/history-module.js" && node --check "apps/yi/js/modules/divination-module.js" && node --check "apps/yi/js/modules/modal-module.js"`
  - `Select-String -Path .\apps\yi\index.html -Pattern "data/hexagrams.js|data/bagua.js"`
  - 结果：JS 语法检查通过；`index.html` 已无固定数据预加载脚本引用
- 风险与后续事项：
  - 当前仍未建立自动化端到端测试，建议后续补充关键路径 smoke test
  - `hexagram-data-service-module.js` 中二进制到卦象的查找仍为线性扫描，可继续索引化优化

## 审计记录：v1.3.0

- 变更版本：v1.3.0（refactor）
- 改动概述：落实 P1 优化，提升数据查询性能与模态框键盘可访问性
- 影响模块：数据服务、模态框交互
- 变更文件与补丁摘要：
  - 更新 `apps/yi/js/services/hexagram-data-service-module.js`：新增 `hexagramIdByBinary` / `baguaNameByBinary` / `hexagramByTrigramKey` 索引；关系卦映射缺失时不再写入无效项
  - 更新 `apps/yi/js/modules/modal-module.js`：新增打开前焦点保存、关闭后焦点恢复、Tab/Shift+Tab 焦点圈定
- 验证步骤与结果：
  - `node --check "apps/yi/js/services/hexagram-data-service-module.js" && node --check "apps/yi/js/modules/modal-module.js"`
  - `Select-String -Path .\apps\yi\js\services\hexagram-data-service-module.js -Pattern "hexagramIdByBinary|hexagramByTrigramKey|baguaNameByBinary"`
  - 结果：语法检查通过；索引变量与查询路径已生效
- 风险与后续事项：
  - 目前未接入自动化性能基准，建议后续补充查询耗时对比数据
  - 焦点圈定依赖可见元素过滤，后续若模态结构调整需同步回归验证键盘路径

## 审计记录：v1.3.1

- 变更版本：v1.3.1（feature）
- 改动概述：补齐可见型 P1 体验反馈，增强占卜流程中的“下一步可见引导”
- 影响模块：占卜流程 UI 与样式
- 变更文件与补丁摘要：
  - 更新 `apps/yi/index.html`：进度区新增 `#nextActionHint`
  - 更新 `apps/yi/js/modules/divination-module.js`：新增 `updateNextActionHint` 与完成后 `scrollToResultArea`
  - 更新 `apps/yi/css/styles.css`：新增 `.next-action-hint` 样式
- 验证步骤与结果：
  - `node --check "apps/yi/js/modules/divination-module.js"`
  - `Select-String -Path .\apps\yi\index.html -Pattern "nextActionHint"`
  - 结果：语法检查通过；页面结构已包含引导区，投掷与完成状态文案可更新
- 风险与后续事项：
  - 自动滚动仅在完成六爻时触发，若后续调整页面布局需复核滚动目标位置

## 审计记录：v1.5.0

- 变更版本：v1.5.0（bugfix/docs）
- 改动概述：修复本地预览无法打开后的连锁问题，补齐自动验证与协作文档一致性
- 影响模块：本地预览、应用存储、搜索/知识模块、协作文档、验证脚本
- 变更文件与补丁摘要：
  - 新增 `apps/yi/tests/validate-project.mjs`：无依赖项目验证脚本，覆盖文档命名、favicon、搜索容器归属、存储契约、数据回退一致性与空白格式
  - 新增 `apps/yi/favicon.svg`：消除本地预览 favicon 404
  - 更新 `apps/yi/index.html`：移除外部 Google Fonts 首屏请求；主题预初始化优先读取 `localStorage`；搜索精选容器改为 `#searchFeaturedHexagrams`
  - 更新 `apps/yi/js/app.js`：存储后端改为 `localStorage` 并兼容迁移旧 `sessionStorage`；移除初始化中的人为等待以消除性能告警
  - 更新 `apps/yi/js/modules/knowledge-module.js`、`apps/yi/js/modules/search-module.js`：知识模块不再写搜索精选 DOM，搜索模块独占精选卦象容器
  - 新增 `.githooks/commit-msg` 与 `.gitmessage`，并更新 `AGENTS.md`、`apps/yi/README.md`、`ANCHOR.md` 的文档说明
- 验证步骤与结果：
  - `node .\apps\yi\tests\validate-project.mjs`：通过
  - `Get-ChildItem -Path .\apps\yi\js -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }`：通过
  - `git -c core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol diff --check`：通过
  - `python -m http.server 8000 --bind 127.0.0.1`（工作目录 `apps/yi`）后访问 `/`、`/favicon.svg`、`/data/hexagrams.json`：均返回 200
  - Playwright smoke：主页、搜索“风”、卦象分析“乾为天”、单次投掷流程均通过；控制台 0 errors / 0 warnings
- 风险与后续事项：
  - 当前本地预览服务进程仍运行在 `127.0.0.1:8000`，用于浏览器面板继续访问
  - in-app browser 自动控制链路受本机 Node 20.19.5 限制，`node_repl` 要求 Node >= 22.22.0；已通过 HTTP 与 Playwright 完成等价预览验证

## 审计记录：v1.4.1

- 变更版本：v1.4.1（bugfix）
- 改动概述：修复卦象分析模块的数据时序问题，消除搜索“风”标签命中偏差，并清理重复的全局错误监听
- 影响模块：卦象分析、搜索、应用内核、协作文档
- 变更文件与补丁摘要：
  - 更新 `apps/yi/js/modules/hexagram-analyzer-module.js`：监听 `hexagram-data:ready` 后重渲染常用组合，并在数据就绪后自动刷新当前分析结果
  - 更新 `apps/yi/index.html`：将搜索快捷标签 `data-keyword="風"` 修正为 `data-keyword="风"`
  - 更新 `apps/yi/js/app.js`：移除文件尾部重复注册的全局错误与 Promise 拒绝监听，保留初始化阶段的统一监听入口
  - 更新 `ANCHOR.md`：同步关键逻辑链路、版本日志与本审计记录
- 验证步骤与结果：
  - `Get-ChildItem -Path .\apps\yi\js -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }`
  - `Select-String -Path .\apps\yi\index.html -Pattern "data-keyword=\"风\""`
  - 结果：全部 JS 语法检查通过；搜索快捷标签已改为简体“风”
- 风险与后续事项：
  - 常用组合仍会在数据未就绪时先渲染一版无符号卡片，随后由事件重渲染修正；如需彻底消除首屏闪动，可后续补 loading skeleton 或延迟首渲染

## 审计记录：v1.4.0

- 变更版本：v1.4.0（refactor）
- 改动概述：重构占卜流程反馈系统，将单条提示升级为结构化流程看板与过程日志
- 影响模块：占卜页面结构、占卜模块状态渲染、相关样式
- 变更文件与补丁摘要：
  - 更新 `apps/yi/index.html`：进度区改为 `workflow-panel`（3项状态卡）；铜钱区新增 `lineLog`
  - 更新 `apps/yi/js/modules/divination-module.js`：`updateNextActionHint` 重构为 `renderWorkflowState`；新增 `renderLineLog`，统一在投掷/重置/变卦切换时刷新
  - 更新 `apps/yi/css/styles.css`：新增 `workflow-*` 与 `line-log*` 样式，支持自适应网格展示
- 验证步骤与结果：
  - `node --check "apps/yi/js/modules/divination-module.js"`
  - `Select-String -Path .\apps\yi\index.html -Pattern "workflowStage|workflowChanging|workflowNextAction|lineLog"`
  - 结果：语法检查通过；页面结构与模块状态渲染节点均已就位
- 风险与后续事项：
  - 新增过程日志为前端即时视图，未写入持久层；如需复盘追踪可后续与 history 模块联动
