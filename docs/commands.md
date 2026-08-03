# 斜杠命令架构

Kimi GUI 不再维护一份与上游无关联的精简命令白名单。命令由三层组成：

1. `web/src/lib/upstreamSlashCommands.json`：Kimi Code 发布版命令名称与别名快照。
2. `web/src/lib/commandRegistry.ts`：GUI 自己维护的 surface、可用条件和执行器映射。
3. `web/src/lib/slashCommands.ts`：从映射生成菜单项，并在其后追加 daemon 动态返回的 Skills。

当前快照对应 `@moonshot-ai/kimi-code@0.31.1`，共 40 个主命令（包括实验命令 `secondary_model`）。上游目前只提供名称、别名、描述、参数补全和空闲条件，没有提供 `TUI / GUI / 通用` 的机器可读分类，因此 surface 映射由本项目显式维护。

## 分类

| kind | 含义 | 例子 | GUI 行为 |
|---|---|---|---|
| `command` | 已接入 GUI 执行器 | `/compact`、`/settings`、`/title` | 执行 app/daemon 动作 |
| `native-ui` | 已有更合适的 GUI 入口 | `/model`、`/provider`、`/usage` | 不重复塞入菜单；手输时提示入口位置 |
| `tui-only` | 语义依赖终端 TUI | `/reload-tui`、`/editor`、`/web` | 不执行，并明确说明 |
| `unavailable` | 通用能力但 Web API/GUI 尚未实现 | `/init`、`/add-dir` | 明确提示限制，不当作消息或 Skill |

命令执行路径为：解析 token → 解析官方别名 → 查询 GUI 映射 → 校验 `idle-only` 等条件 → 分派执行器。只有 Skills、插件以及 daemon 版本/能力需要运行时判断，命令属于哪个 surface 不在运行时猜测。

## `/reload`

`/reload` 已被识别并显示在 GUI 菜单中，但 Kimi Code 0.31.1 只在 Node SDK 暴露 `reloadSession()`，daemon 的公开 REST API 尚无会话重载端点。因此 GUI 会显示准确的限制提示，不会把它误发成普通消息或 `reload` Skill，也不会用“重启整个 daemon”冒充会话重载。

daemon 将来开放相应 capability/REST 路由后，只需把 `reload` 映射的执行器接到 API；菜单和别名无需再次修改。

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
