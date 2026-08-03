# Kimi Code(kimi-gui)

Kimi Code 的桌面客户端:把 Kimi Code CLI 的能力装进一个原生桌面壳。
Tauri 2(Rust 壳)+ Vue 3(codex UI,fork 自官方 kimi-web)+ 本地 daemon(REST + WebSocket)。

**前置条件**:先安装 [Kimi Code CLI](https://github.com/MoonshotAI/kimi-code) 并 `kimi login`——本应用是它的桌面前端,daemon 由 CLI 提供,不内置。应用可在「设置 → Kimi Engine」检查 CLI/daemon 版本、更新 CLI，并用新版 CLI 重启本机 daemon。

当前版本:**1.0.13**

## 主要能力

- 完整桌面对话体验:流式 Markdown/思考、工具调用、审批、队列/插话、图片与文件引用、Diff/Review、Inspect 和侧边任务
- 任务上下文体验:工作区与 Agent 集中在顶部任务栏,新任务可切换、已有任务明确锁定;长对话上翻后可一键回到底部
- Agent 工作流:Agent 配置、主/次模型、Skills/插件、MCP、Hooks、权限与附加工作目录
- 会话与数据:多工作区、搜索/置顶/归档、历史导入、配置备份与恢复、草稿和界面状态持久化
- 运行状态:5 小时/周额度、上下文用量、CLI/daemon 版本诊断、更新 CLI 与无降级重启 daemon
- 长会话性能:侧栏渐进渲染、daemon 全文搜索防抖、消息窗口化、Markdown/KaTeX/Mermaid 延迟加载与 worker 解析

---

## 仓库结构

```
web/            前端(fork 自 kimi-web)
  src/components/codex/   自研桌面 UI 组件(契约见 ARCHITECTURE.md)
  src/codex-app/          桌面应用入口(app.html)
  src/codex-demo/         组件沙箱(codex.html)
src-tauri/      Rust 壳(窗口/daemon 拉起/托盘/全局快捷键/原生对话框/用量抓取)
prototype/      交互与视觉契约(静态原型,UI 决策的源头)
docs/           设计 spec
HANDOFF.md      开发日志(事实上的 CHANGELOG)
ARCHITECTURE.md 组件契约 / 数据流 / 文件分工
ROADMAP.md      功能路线图
```

## 开发

```bash
pnpm install

pnpm dev              # tauri dev(web dev server + 桌面壳,热更新)
pnpm web:dev          # 只起前端 dev server(:5175,浏览器调试)
pnpm web:typecheck    # vue-tsc --noEmit
pnpm --filter @moonshot-ai/kimi-web test
pnpm --filter @moonshot-ai/kimi-web check:style
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

**版本规则**(小版本迭代,不追大):
- **单一版本源**:`src-tauri/tauri.conf.json` 的 `version`(DMG 文件名、.app 版本、关于页展示都由它驱动;发版时同步根 `package.json` / `web/package.json` / `Cargo.toml`——脚本/手动都行,但必须一致)
- 语义化小步:功能合入后递增 patch 版本;每次发版同步 `CHANGELOG.md` 和 `HANDOFF.md`
- 推送 `v*` tag 后,GitHub Actions 先跑类型检查、测试、样式检查、前端构建和 Rust 校验,再构建 macOS/Windows 产物与自动更新清单
- 当前版本:**1.0.13**

**签名现状**:adhoc 自签名。分享给别人(M 系列 Mac):
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
| 看最近改了什么 | `HANDOFF.md`(按轮次) |
| 看发行说明 | `CHANGELOG.md` |
| 看接下来做什么 | `ROADMAP.md` |
| 添加工作区 / 登录 / 设置 | app 内:左下角账号行 / 侧栏「工作区」+ / 左下齿轮 |
| 检查 CLI/daemon 或更新引擎 | app 内:设置 → Kimi Engine |

## 键盘速查

`⌘K` 命令面板 · `⌘I` Inspect · `⌥⌘S` 侧边任务 · `⌥⌘P` 置顶 · `Esc` 分层关闭 · 审批 `y/a/n/p` · 双击顶栏 放大/还原
