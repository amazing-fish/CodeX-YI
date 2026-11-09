# 易之 CLI 与本机 MCP

## 架构与范围

原站点是无构建的 HTML/CSS/JS 应用，已有不依赖 DOM 的 `YiCore`、64 卦/8 卦/经传 JSON，以及负责失败关闭校验、归一化、索引和排序搜索的数据服务。此前能力只能从浏览器页面使用，没有命令行或 MCP 入口。

现在调用路径为：CLI / stdio MCP → `api.mjs` → 同一个数据服务工厂和 `YiCore` → 仓库内三份 JSON。没有复制卦理算法或创建第二份卦象数据库。浏览器继续使用原词法接口；Node 使用 CommonJS 导出创建隔离实例。

- Node.js 22 或更高；本机验证版本为 24。零运行依赖，不需要 npm install、Python、浏览器、API key 或远程服务。
- 离线、只读；不读取/写入浏览器 `localStorage`，不保存所问或占记，不提供任意文件、shell、网络工具。
- 这是文化学习与自省工具，不提供现实预测或医疗、法律、投资等专业决策。
- 必需的 64 卦/8 卦损坏则初始化失败；可选经传缺失或损坏仅在 stderr 告警并降级为白话。

## CLI

从仓库根目录运行。也可使用入口文件绝对路径，在任意工作目录调用：

```powershell
node tools/yi/cli.mjs --help
node tools/yi/cli.mjs info
node tools/yi/cli.mjs list --offset 0 --limit 8
node tools/yi/cli.mjs show 1
node tools/yi/cli.mjs show 乾
node tools/yi/cli.mjs show --upper 坎 --lower 震
node tools/yi/cli.mjs show --binary 010001
node tools/yi/cli.mjs search "潜龙" --limit 5
node tools/yi/cli.mjs analyze 6,7,8,9,7,8 --question "仅作学习" --text
node tools/yi/cli.mjs cast --question "本周的自省方向" --text
node tools/yi/cli.mjs trigrams --name 坎
node tools/yi/cli.mjs classics --section shuogua
```

输出默认 JSON（也可显式 `--json`）；`--text` 适合人阅读，分析输出重点经文而非全部字段。成功退出码 0；参数或未找到错误退出码 2；初始化/内部错误退出码 1。错误是 stderr 上的 JSON，stdout 留空。帮助和版本输出为普通文本。

`show` 只接受一种查询方式：位置参数、`--id`、`--name`、`--binary`、或 `--upper` + `--lower`。六位 0/1 位置参数优先按卦画识别，其余纯数字按卦序；名称精确匹配，模糊查找用 `search`。

**位序不要混淆：**

- `analyze` / `values` 自下而上，即初爻 → 上爻，恰好六个整数；6=老阴、7=少阳、8=少阴、9=老阳。
- `binary` 自上而下，前 3 位是上卦，后 3 位是下卦。例如 `010001` 是坎上震下的水雷屯。
- 解析结果含本卦、之卦、变爻位置（从 1 开始）、当位/居中/相应，以及《易学启蒙》0–6 变爻指引所对应的实际经文。乾坤六爻皆变分别取用九/用六。
- `cast` 每爻独立抽三枚公平铜钱，用 Node 安全随机源。每次调用产生新结果，不应无意重试来替代上次结果。

附录 `section` 可选 `xici_shang`、`xici_xia`、`shuogua`、`xugua`、`zagua`。不指定时返回全部附录及出处。

## stdio MCP

入口：`node tools/yi/mcp.mjs`，或 `node tools/yi/cli.mjs mcp`。客户端负责启动进程，并通过 stdin/stdout 交换每行一个 JSON-RPC 2.0 消息；不要把服务当作 HTTP URL。stdout 仅包含协议响应，诊断只写 stderr。

明确支持 MCP 协议 `2025-11-25` / `2025-06-18`。未知版本协商返回 `2025-11-25`，由客户端决定能否继续。不声明旧版 batch、HTTP、resources、prompts 或 tasks 能力。

工具：

| 工具 | 参数 | 返回 |
| --- | --- | --- |
| `yi_info` | 无 | 版本、能力、位序、数据规模 |
| `yi_list_hexagrams` | `offset?`、`limit?` | 分页摘要 |
| `yi_get_hexagram` | `id` / `name` / `binary` / `upper+lower` 四选一 | 一卦全文及错综互 |
| `yi_search_hexagrams` | `query`、`limit?` | 命中字段、片段与排序摘要 |
| `yi_analyze_lines` | `values`、`question?` | 六爻解析及应读经文 |
| `yi_cast` | `question?` | 安全随机三钱成卦及解析 |
| `yi_get_trigrams` | `name?` | 八卦属性 |
| `yi_get_classics` | `section?` | 经传出处与附录 |

所有工具都有 `readOnlyHint: true`、`openWorldHint: false`；随机起卦的 `idempotentHint` 为 false。参数拒绝未知字段、隐式类型转换与不合法范围。MCP 工具失败以 `isError` 返回，不污染协议输出。每行输入上限 1 MiB，超大消息会被拒绝。

### 生成本机配置

不要把示例路径原样粘到其他机器。以下命令根据当前 Node 和项目的绝对位置输出配置，**本命令本身不会写设置**：

```powershell
node tools/yi/cli.mjs agent-config --client codex
node tools/yi/cli.mjs agent-config --client claude
```

Codex 的配置段落类似：

```toml
[mcp_servers.yi]
command = 'C:\Program Files\nodejs\node.exe'
args = ['D:\Develop\Project\GitHub\CodeX-YI\tools\yi\mcp.mjs']
```

也可使用 Codex 自己的配置命令注册，路径须改为实际值：

```powershell
codex mcp add yi -- "C:\Program Files\nodejs\node.exe" "D:\Develop\Project\GitHub\CodeX-YI\tools\yi\mcp.mjs"
```

Claude Desktop 使用 `mcpServers.yi` 的 JSON 片段；Claude Code 可使用自身 `mcp add --transport stdio` 命令注册同一 Node/入口。按客户端加载机制重新打开会话后，要求它调用 `yi_info`、查询水雷屯或解析给定六爻。配置存在不代表当前已启动会话已重载，须以客户端真实工具发现/调用为准。

项目移动后重新生成配置；移除时删除对应客户端的 `yi` 配置即可。没有后台服务或监听端口需要停止。包的 `bin` 元数据提供 `yi` / `yi-mcp` 名称；默认不全局安装，也不改 PATH。

## 开发与验证

```powershell
node --test tools/yi/tests/*.test.mjs
node apps/yi/tests/validate-project.mjs
git diff --check
```

共享 API 与工具 schema 在 `api.mjs`，CLI 只处理参数/展示，MCP 只处理协议。新增业务能力先增加共享操作与严格 schema，再补测试，避免两种入口行为分叉。

现有浏览器测试继续覆盖数据失败关闭与 UI 契约。新增测试包含 4096 种六爻组合（全部 64×64 本卦/之卦）、64 卦查询/关系、必需数据损坏与可选经传降级、参数边界、无网络/无存储、CLI 子进程和 MCP 生命周期/分片/错误处理。Windows 沙箱若阻止 Git 自带 sh.exe 创建命名对象，应在允许的正常本机终端重跑原统一校验，不跳过或削弱 hook 测试。
