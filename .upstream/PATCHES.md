# PATCHES.md —— 改过的官方文件清单

> fork 维护命脉。每次改官方文件必须在这里记一笔,merge 上游时照着解决冲突。

## 官方 commit 基准

```
3086e47 2026-07-18 02:09:31 +0800 fix: unify YOLO and Auto permission mode descriptions across surfaces (#1867)
```

详见 `.upstream/UPSTREAM_BASELINE.txt`。

## 0.33 后的维护方式

Kimi Code 0.33.0 已从公开仓库移除 `apps/kimi-web` 源码，官方脚本说明 Web UI 改由独立 `code-app` 仓库构建，只把预编译 `dist-web` 同步回来。因此：

- `.upstream/kimi-code-src` 继续作为历史 Web 源码与本地 patch 的参考镜像，不再假设能机械合并新版官方 Web 源码。
- daemon/REST/Wire/配置契约基线从本项目代码和测试中固定为 `@moonshot-ai/kimi-code@0.33.0`。
- Slash 命令通过 `web/src/lib/upstreamSlashCommands.json` 跟踪发布版；交互行为按发布说明和公开 daemon 源码逐项移植。
- `main` 上未发布的 `/api/v2` 等契约不得提前作为稳定能力接入。

## 改动清单

### `web/vite.config.ts`(2026-07-19 · ZCode · 轮次 1)

**改动**:`server.strictPort: false` → `true`

**原因**:Tauri 的 `devUrl` 锁 5175(`src-tauri/tauri.conf.json`)。strictPort=false 时,vite 在 5175 被占会静默换 5176,导致 Tauri 窗口加载空白(指向 5175)。改成 true 让端口冲突立即暴露。

**冲突风险**:低。官方用 `pnpm dev:server` 在 5175 起 vite,我们自己管理启动顺序,不会冲突。

---

### `.upstream/sync.sh`(2026-07-19 · ZCode · 轮次 1.2 重写)

**改动**:整文件重写

**原因**:轮次 1 版本两个 bug:
1. `fetch` 只 `git fetch --all` 不推进 HEAD,`diff`/`merge` 用 `$baseline..HEAD` → 上游更新永远不可见
2. `git apply -p3 --directory=''` 前缀映射错,会写到根 `src/` 或静默失败

修法:
- `fetch` 改 `git reset --hard origin/<默认分支>` 推进 HEAD
- `merge` 改 `git apply -p3 --directory=web`(patch 内 `a/apps/kimi-web/src/...` → `web/src/...`)
- 实际跑通验证:fetch 推进 HEAD `3086e47 → 4f3c7240`,diff 正确显示空

**这是 sync 工具自己,不是官方文件**,记这里是为了让维护者知道它经历过一次重写。

### `web/src/composables/codex/useHotkeys.ts`(2026-07-19 · ZCode · 轮次 1.2)

**改动**:
1. 加 `e.isComposing` + `e.keyCode === 229` 检查(CJK 输入法 composing 期间不触发)
2. **契约变更**:移除 `HotkeySpec.preventDefault` 字段;handler 必须**显式 `return true`** 才阻止默认行为(原来 `handled !== false` 把 void 当 true 跟注释不符)

**原因**:#1 防 CJK 误触(spec A7);#2 跟 kimi3 应修 5 对齐

**这是 codex 新代码,不是官方文件**,记这里是因为**契约变了**,kimi3 写 handler 要注意"显式 return true"。

---

### `web/src/main.ts`(2026-07-19 · ZCode · 轮次 3)

**改动**:启动时 bootstrapTauriToken(invoke daemon_info 拿 token → setCredential)

**原因**:Tauri 环境下免用户手输 server token(官方 ServerAuthDialog)。浏览器环境跳过,走官方 fragment/手输流程。

**冲突风险**:中。main.ts 是入口,官方改动较多。token 注入逻辑独立,merge 时保留即可。

### `web/package.json`(2026-07-19 · ZCode · 轮次 3 阶段 B)

**改动**:`dependencies` 加 `"@tauri-apps/api": "^2"`

**原因**:web 是独立包(根的 @tauri-apps/api 装不到 web)。codex UI 要调 Tauri 命令(`invoke('daemon_info')` 拿 daemon base+token),web 必须依赖 @tauri-apps/api。

**冲突风险**:低。这是纯 additive(加依赖,不改现有依赖版本)。官方将来若也加 @tauri-apps/api,我们 merge 时合并即可。

---

## 未改但需关注的官方文件

以下文件 fork 时**没改**,但轮次 1 阶段引入了新的引用关系:

- `web/src/types.ts`:被 `web/src/types/codex.ts` import 类型(`ChatTurn` / `TurnBlock` / `ToolCall` / `TodoView` / `PermissionMode` / `Session` / `Workspace`)。只读引用。
- `web/src/composables/useKimiWebClient.ts`:被 `web/src/composables/codex/useKimiClient.ts` import 类型(`ReturnType<typeof useKimiWebClient>`)。只读引用。
- `web/src/lib/slashCommands.ts`:菜单投影层；自 2026-08-03 起从本地 `commandRegistry.ts` 的完整分类映射生成，不再独立维护精简白名单。

### `web/src/lib/slashCommands.ts`（2026-08-03 · Codex · 命令分类改造）

**改动**：移除独立硬编码的 16 条 GUI 白名单，改为从 `commandRegistry.ts` 生成菜单；增加完整上游 built-in 识别，使隐藏命令手输时也进入分类分发而不是普通消息。

**原因**：官方 TUI 0.33.0 有 40 个主命令，官方 Web 没有公开可合并的分类元数据，GUI 需要额外的 surface/执行器适配层。0.33.0 同步加入 `/bug` 别名，并采用“不自动切换”的 `/fork` 行为。

**冲突风险**：中。上游若新增 daemon command manifest/capabilities，应优先改为消费官方元数据；在此之前保留本地映射与同步脚本。

### Provider 目录与 Registry 导入

**上游能力**：Kimi Code 0.33 的 `kimi provider catalog list/add` 与 `kimi provider add` 负责 models.dev 协议推断、完整模型元数据和自定义 Registry 来源同步。

**GUI 适配**：Provider 管理页通过窄化的 Tauri allow-list 调用这些官方子命令，API Key 仅作为子进程环境变量传入；成功后重启当前 GUI Engine，使 daemon 立即加载新配置。手工 Provider 编辑仍走公开 REST 契约。

**原因**：手工表单无法可靠复刻 catalog 的 wire 推断、每模型协议/端点覆盖、上下文边界和能力过滤；复用官方 CLI 可避免 GUI 与 TUI 再次漂移。

**冲突风险**：中。0.33+ Provider CLI 参数变化时要同步窄化命令；daemon 将来开放等价 REST 导入端点后应优先改走 REST。

### GUI 命令闭环与子智能体详情

**改动**：完整命令分类增加可搜索帮助页；GUI 类命令直接导航到对应设置或任务面板；补齐 `/init`、`/add-dir`、`/export-md`、MCP OAuth、Undo 选择器、可持久化实验开关和反馈入口。子智能体面板增加状态筛选、搜索、运行时模型来源、时间线、活动统计以及 20,000 字符以上按需展开。

**边界**：0.33 daemon REST 未暴露插件管理、session reload 和 Goal 后续队列 RPC。GUI 只展示 daemon 实际加载的插件能力；管理入口以内嵌 PTY 承载固定的官方 `/plugins` 流程，不扫描或直接改写插件状态。PTY 仅允许已安装 Kimi CLI 和已登记工作区，目录信任仍交给官方界面确认，关闭弹窗即终止子进程。

**冲突风险**：中。daemon 若公开 capability manifest、插件或 Goal 队列 REST，应删除相应本地适配与限制提示，改为消费官方契约。

### `web/src/components/chat/Markdown.vue`(2026-07-20 · kimi3 · 轮次 7+)

**改动**:本地图片解析完成后的写回改为同帧批量提交(`resolvedBatch` + rAF flush),不再每张图 `resolvedImages.set` 一次。

**原因**:`segments` computed 依赖 `resolvedImages`,N 张本地图 = N 次整条消息 rewriteImageSrcs + markstream 重解析(图片多的会话流式/加载时明显卡顿)。批量后同帧 resolve 只触发 1 次重算,行为不变(未 flush 前仍是 placeholder,与原"in-flight 占位"一致)。

**冲突风险**:低。改动只在 `resolvedImages` 声明块和 `queueImageResolution` 的两个 promise 回调里,上游同区域改动时按"批量写回"语义手工合。

### `web/src/api/daemon/client.ts` + `web/src/api/types.ts` + `web/src/composables/useKimiWebClient.ts`（2026-07-24 · ZCode · 0.29 新端点接入）

**改动**：加 `getOAuthUsage()` + `getFsContent(path)` 方法到 KimiWebApi 接口

**原因**：daemon 0.29 新增 `GET /api/v1/oauth/usage`（REST 额度，替代 PTY 抓取）+ `GET /api/v1/fs:content`（读宿主机文件，替代 readFileContent 的 workspace 限制）

**冲突风险**：低。纯 additive（新方法），不修改现有方法。
