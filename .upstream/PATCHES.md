# PATCHES.md —— 改过的官方文件清单

> fork 维护命脉。每次改官方文件必须在这里记一笔,merge 上游时照着解决冲突。

## 官方 commit 基准

```
3086e47 2026-07-18 02:09:31 +0800 fix: unify YOLO and Auto permission mode descriptions across surfaces (#1867)
```

详见 `.upstream/UPSTREAM_BASELINE.txt`。

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
- `web/src/lib/slashCommands.ts`:内置命令元数据,`composables/codex/useSlashMenu`(轮次 3 实现)会读取。只读引用。
