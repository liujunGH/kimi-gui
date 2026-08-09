# Kimi Code(kimi-gui)

Kimi Code 的桌面客户端:把 Kimi Code CLI 的能力装进一个原生桌面壳。
Tauri 2(Rust 壳)+ Vue 3(codex UI,fork 自官方 kimi-web)+ 本地 daemon(REST + WebSocket)。

**前置条件**:安装 **Kimi Code CLI 0.33.0+** 并 `kimi login`——本应用只使用 agent-core-v2 契约，不再连接旧版或 legacy backend。检测到旧 daemon 时会停止加载聊天，并提供“更新 CLI → 迁移 0.33 配置 → 重启 daemon”的桌面升级入口。

当前版本:**1.0.16**

## 主要能力

- 完整桌面对话体验:流式 Markdown/思考、工具调用、审批、队列/插话、图片与文件引用、完整 Diff/Review、Inspect 和侧边任务
- 任务上下文体验:工作区与 Agent 集中在顶部任务栏,新任务可切换、已有任务明确锁定;进入长对话默认定位到底部,上翻后可一键返回
- Agent 工作流:Agent 配置、主/次模型、Skills/插件、Capabilities、MCP、Hooks、权限与附加工作目录;桌面版内嵌 Kimi 0.33 官方 `/plugins` 交互，支持安装、市场、启停、MCP 开关、删除与重载；子智能体工作台支持主/次模型和后台筛选、父调用关系、完整活动/回复、时间线、长输出展开及当前任务产物视图
- Provider 管理:查看并编辑非敏感配置；通过 Kimi Engine 0.33+ 官方 REST 从 models.dev 目录导入完整模型能力，或批量导入自定义 Registry（api.json），无需重启；API Key 不回显且不写入 GUI 存储或日志
- 会话与数据:多工作区、搜索/置顶/归档、任务中心表格筛选与批量处理、归档恢复后的 Engine 重连引导、归档对话逐条/批量永久删除、失效 worktree 任务和空工作区一键检测清理、失效任务可选择直接清理或备份后清理、历史导入、配置备份与恢复、草稿和界面状态持久化
- 运行状态:5 小时/周额度、上下文用量、CLI/daemon 版本诊断、更新 CLI 与无降级重启 daemon
- 长会话性能:服务端缓存过期提示、可配置 Agent 步数/后台并发/超时/上下文与图像预算、侧栏渐进渲染、daemon 全文搜索防抖、消息窗口化、Markdown/KaTeX/Mermaid 延迟加载与 worker 解析；全局任务面板只在打开时轮询
- 契约跟踪:固定 Kimi Code 0.33.0+ daemon/Wire 契约和完整命令目录,按通用/GUI/TUI 分类映射;`/help` 可查看完整索引，GUI 类命令直接导航到对应设置/面板，新增上游命令会触发完整性检查

---

## 仓库结构

```
web/            前端(fork 自 kimi-web)
  src/components/codex/   自研桌面 UI 组件(契约见 ARCHITECTURE.md)
  src/codex-app/          桌面应用入口(app.html)
  src/codex-demo/         组件沙箱(codex.html)
src-tauri/      Rust 壳(窗口/daemon 拉起/托盘/全局快捷键/原生对话框/用量抓取)
prototype/      交互与视觉契约(静态原型,UI 决策的源头)
docs/           设计 spec / 命令映射 / 上游能力矩阵
AGENTS.md       开发规范(接手迭代怎么写代码、功能怎么落地、提交门槛)
ARCHITECTURE.md 组件契约 / 数据流 / 文件分工
CHANGELOG.md    发行说明
ROADMAP.md      迭代待办
```

## 开发

```bash
pnpm install

pnpm dev              # tauri dev(web dev server + 桌面壳,热更新)
pnpm web:dev          # 只起前端 dev server(:5175,浏览器调试)
pnpm web:typecheck    # vue-tsc --noEmit
pnpm --filter @moonshot-ai/kimi-web test
pnpm --filter @moonshot-ai/kimi-web check:style
pnpm --filter @moonshot-ai/kimi-web commands:check # 校验 Kimi 0.33.0 命令快照与 GUI 映射
pnpm web:build        # vite build(产出 web/dist)
cargo test --manifest-path src-tauri/Cargo.toml
```

沙箱页面(不连 daemon 的组件验收):`pnpm web:dev` 后开
`http://localhost:5175/codex.html?scene=index|running|steer|approval|multi-agent|diff|settings`
(可加 `&theme=dark`)。

## 构建与发行

```bash
pnpm build            # web build → postbuild → Rust release → .app + DMG
```

产物:
- `src-tauri/target/release/bundle/macos/Kimi Code.app`
- `src-tauri/target/release/bundle/dmg/Kimi Code_<version>_aarch64.dmg`

**版本规则**:单一版本源是 `src-tauri/tauri.conf.json` 的 `version`,发版时同步根 `package.json` / `web/package.json` / `Cargo.toml` 保持一致。当前版本:**1.0.16**。

**完整发版流程**(tag 触发 → CI 四阶段:质量门禁 / 创建 Release / 双平台构建 / 签名入仓)与签名约定见 [`AGENTS.md`](./AGENTS.md) 第 4 节。

**分享给别人(M 系列 Mac,adhoc 自签名)**:
1. 对方先装 Kimi Code CLI 并 `kimi login`
2. 拖入「应用程序」
3. 首次打开若提示"无法验证开发者":右键 app →「打开」;仍不行执行
   `xattr -dr com.apple.quarantine /Applications/Kimi\ Code.app`

正式对外发行需 Apple 开发者账号签名 + 公证(`tauri build` 支持配置后自动完成),未配置。

## 常用入口

| 想干什么 | 去哪 |
|---|---|
| 看 UI 组件怎么约定 | `ARCHITECTURE.md` |
| 看交互为什么长这样 | `prototype/`(配 `prototype/README.md`) |
| 接手开发怎么写代码 | `AGENTS.md` |
| 看发行说明 | `CHANGELOG.md` |
| 看接下来做什么 | `ROADMAP.md` |
| 添加工作区 / 登录 / 设置 | app 内:左下角账号行 / 侧栏「工作区」+ / 左下齿轮 |
| 检查 CLI/daemon 或更新引擎 | app 内:设置 → Kimi Engine |
| 查看或修改模型供应商 | app 内:设置 → 模型与 Provider → 管理 Provider |
| 批量管理任务与归档 | app 内:设置 → 任务中心 |
| 调整并发、超时与上下文预算 | app 内:设置 → 运行与性能 |
| 安装或管理官方 Capabilities | app 内:设置 → Capabilities → 在应用内管理 |
| 看斜杠命令如何分类/同步 | `docs/commands.md` |
| 看官方 TUI / Web / daemon 能力整合状态 | `docs/upstream-capabilities.md` |

## 键盘速查

`⌘K` 命令面板 · `⌘I` Inspect · `⌥⌘S` 侧边任务 · `⌥⌘P` 置顶 · `Esc` 分层关闭 · 审批 `y/a/n/p` · 双击顶栏 放大/还原
