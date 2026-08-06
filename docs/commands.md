# 斜杠命令架构

Kimi GUI 不再维护一份与上游无关联的精简命令白名单。命令由三层组成：

1. `web/src/lib/upstreamSlashCommands.json`：Kimi Code 发布版命令名称与别名快照。
2. `web/src/lib/commandRegistry.ts`：GUI 自己维护的 surface、可用条件和执行器映射。
3. `web/src/lib/slashCommands.ts`：从映射生成菜单项，并在其后追加 daemon 动态返回的 Skills。

当前快照对应 `@moonshot-ai/kimi-code@0.33.0`，共 40 个主命令（包括实验命令 `secondary_model`）。`/feedback` 的 `/bug` 别名也来自同一快照。上游目前只提供名称、别名、描述、参数补全和空闲条件，没有提供 `TUI / GUI / 通用` 的机器可读分类，因此 surface 映射由本项目显式维护。

## 分类

| kind | 含义 | 例子 | GUI 行为 |
|---|---|---|---|
| `command` | 已接入 GUI 执行器 | `/compact`、`/settings`、`/title` | 执行 app/daemon 动作 |
| `native-ui` | 已有更合适的 GUI 入口 | `/model`、`/provider`、`/usage` | 不重复塞入菜单；手输时提示入口位置 |
| `tui-only` | 语义依赖终端 TUI | `/reload-tui`、`/editor`、`/web` | 不执行，并明确说明 |
| `unavailable` | 通用能力但 Web API/GUI 尚未实现 | `/init`、`/add-dir` | 明确提示限制，不当作消息或 Skill |

命令执行路径为：解析 token → 解析官方别名 → 查询 GUI 映射 → 校验 `idle-only` 等条件 → 分派执行器。只有 Skills、插件以及 daemon 版本/能力需要运行时判断，命令属于哪个 surface 不在运行时猜测。

## `/reload`

`/reload` 仍在 Kimi Code 0.33.0 正式命令目录中，但 daemon 的公开 REST API 尚无会话重载端点。因此 GUI 会显示准确的限制提示，不会把它误发成普通消息或 `reload` Skill，也不会用“重启整个 daemon”冒充会话重载。

`/fork` 从 0.33.0 起创建分叉后保持原会话活动。GUI 同样只把新会话加入侧栏，不再自动跳转，避免打断原会话及其后台任务。

daemon 将来开放相应 capability/REST 路由后，只需把 `reload` 映射的执行器接到 API；菜单和别名无需再次修改。

## 0.33 GUI 适配状态

GUI 不以“把每条终端命令做成按钮”为目标。适合可视化、高频且能由稳定契约支撑的能力进入 GUI；依赖终端编辑器或 TUI 生命周期的能力保留为 TUI-only。

| 能力 | GUI 行为 | 契约说明 |
|---|---|---|
| `/init` | 二次确认后作为正常项目任务生成或完善 `AGENTS.md` | daemon REST 没有 SDK 的 `generateAgentsMd()`；可见任务比静默改文件更易审计 |
| `/add-dir` | 无参数直达“工作区目录”；带路径时确认后持久化到项目 `.kimi-code/local.toml` | 0.33 REST 没有会话级 `addAdditionalDir()`，因此只承诺新会话生效 |
| `/export-md` | 客户端导出当前可见对话 Markdown；与 `/export` 诊断 ZIP 明确分开 | 不依赖 daemon 私有导出 API |
| MCP OAuth | 收到 `mcp.oauth.authorization_url` 后校验 HTTP(S) 并打开系统浏览器 | 不接受 `javascript:` 等非 Web 协议 |
| `/undo` | 弹出用户提示词选择器，预览撤销轮数和压缩边界 | 最终仍调用 daemon 的 undo 接口 |
| `/help`、`/feedback` | 可搜索完整命令索引；反馈打开官方 issue 页面 | `/bug` 同样映射到 feedback |
| Plugins | 展示 daemon 当前会话实际加载的 Skills、MCP 和内置工具；桌面版应用内承载官方 `/plugins` 完整交互 | 0.33 REST 没有安装、启停、重载端点，因此由固定 CLI + 内嵌 PTY 执行官方流程，不维护影子插件状态 |
| Experiments | `micro_compaction`、`tool-select` 可持久化切换；其他运行时 flag 只读 | 防止把 daemon 报告的临时 flag 误写进配置 |
| Provider | 通过 daemon 0.33+ 官方 REST 浏览并导入 models.dev 目录/Registry，同时提供非敏感配置编辑 | daemon 负责推断 wire、端点和模型能力；API Key 可选且导入无需重启 |

仍然存在两个上游契约边界：`/reload` 和 Goal 的后续队列只暴露在 Node SDK/内部 session RPC，没有公开 daemon REST。GUI 会给出准确说明，不会以重启 daemon 冒充 reload，也不会维护一份可能与 TUI 冲突的影子目标队列。插件管理是特殊桥接：GUI 不解析或改写插件状态，只在应用内托管固定的官方 `/plugins` TUI，并复用当前已登记工作区；未信任目录仍由官方提示让用户决定。`/editor`、`/reload-tui` 和 `/web` 依赖更广的终端/TUI 生命周期，属于有意保留的 TUI-only 能力。

## 跟随上游

```bash
# 校验当前固定发布版快照
pnpm --filter @moonshot-ai/kimi-web commands:check

# 比较 Kimi Code main；发现新增/删除命令时返回非零
pnpm --filter @moonshot-ai/kimi-web commands:check-latest

# 更新到 main 当前提交并固定其 commit SHA（随后必须给每个新增命令补分类）
pnpm --filter @moonshot-ai/kimi-web commands:sync-latest
```

`commandRegistry.test.ts` 要求每条上游命令恰好有一项映射，并检查菜单 token 不重复。更新快照后如果漏分类，测试/模块初始化会立即失败，命令不能再静默消失。
