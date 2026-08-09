# AGENTS.md —— kimi-gui 开发规范

> 本文件是接手 kimi-gui 迭代时的**开发规范**,定义代码怎么写、功能怎么落地、提交前过什么门槛。动手前先读完。
>
> 配套文档:`ARCHITECTURE.md`(代码架构权威,目录/数据流/组件契约/主题)、`CHANGELOG.md`(发行说明)、`ROADMAP.md`(迭代待办)、`docs/upstream-capabilities.md`(官方能力整合矩阵)。

---

## 1. 项目定位

Kimi Code(Moonshot CLI agent)的**原生桌面客户端**,体验对齐 Codex 桌面 App。
公式:**Kimi 功能集(全保留)+ Codex 交互形态**。fork 官方 `apps/kimi-web`,UI 按 Codex 风格重做。

- 栈:Tauri 2(Rust 壳)+ Vue 3 + Vite + TypeScript + 本地 daemon(REST + WebSocket)
- 平台:Mac 优先,Windows 可选
- 契约基线:Kimi Code CLI **0.33.0+**(只接 agent-core-v2,旧 daemon 进入升级拦截页)

---

## 2. 架构铁律(违反必回退)

完整架构见 `ARCHITECTURE.md`,这里只列**不可逾越的约束**:

1. **🔒 协议层绝不改** —— 这些目录是 fork 官方源码,git merge 命脉,改了就再也合不回上游:
   - `web/src/api/daemon/*`(8 文件,纯 TS,零 Vue)
   - `web/src/lib/slashCommands.ts`、`commandRegistry.ts`(命令 surface/执行器)
   - `web/src/types.ts`(官方 App 类型)
   - `web/src/composables/useKimiWebClient.ts` 及 `composables/client/*`(fork 官方状态层)
   - `web/src/i18n/`、`web/src/debug/`
   - 需要新 daemon 能力 → 在 `composables/codex/` 包一层调用,**不在协议层目录加东西**

2. **数据单向流** —— daemon → `api/*` → `useKimiWebClient` → 组件。组件**不能**直接 import `api/*`,只能调 client 暴露的 action 或读 props/inject

3. **新代码进 codex/ 子目录**:
   - 新 UI 组件 → `web/src/components/codex/`(不进 `components/chat/`,那是官方只读目录)
   - 新逻辑 → `web/src/composables/codex/`(不进 `composables/` 根)
   - 新类型 → `web/src/types/codex.ts`(不混进 fork 的 `types.ts`)
   - 新样式 → `web/src/styles/`(对应 prototype 的 CSS 文件)

4. **数据全走 daemon,禁止写死** —— 模型/工作区/命令/Skills/思考深度/权限模式全部动态拉取。Vue 组件里**不允许出现 mock 常量数组**,数据必须从 props 或 composable 传入。原型期允许 props 传空 + TODO 注释,接手后补真实数据

5. **改过官方文件记 `.upstream/PATCHES.md`** —— 🔒 协议层原则上不应该有改动,任何被动过的官方文件都要登记

---

## 3. 常见迭代场景怎么落地

### 3.1 接一个新 daemon 能力 / 官方命令
1. 先查 `docs/upstream-capabilities.md` 看标记(✅ 已整合 / 🟡 可用不完整 / ⬜ 待整合 / 🧪 等上游发布)
2. **不改协议层**。在 `composables/codex/` 新增/扩展 composable 调用 `api/daemon/*` 的公共契约
3. 若是新斜杠命令:更新 `web/src/lib/commandRegistry.ts` 的 GUI/TUI/通用分类,并跑 `commands:check` 防漏
4. 同步 `docs/commands.md` 与 `docs/upstream-capabilities.md` 的状态标记

### 3.2 加一个 UI 组件
1. 视觉契约源头是 `prototype/`(v2,7 个 HTML + 10 个 CSS + `mock/shared.js`)—— 先看原型
2. 组件放 `web/src/components/codex/{chat,sidebar,diff,composer,approval,detail,agents,layout,settings}/`,PascalCase.vue
3. props 用 `defineProps<Type>()`,Type 放 `web/src/types/codex.ts`;emit 用 `defineEmits<{...}>()`
4. **深组件**(嵌套 3 层以上,如 `ApprovalCard`)直接 `inject('client')` 调 action;`emit` 只用于纯 UI 事件(toggle/close/select),不走 emit 链穿透
5. 交互行为(键盘导航/过滤/动画状态)放组件 `<script setup>` 的本地 ref;全局状态必须从 composable 拿,不自己 `ref()` 全局态
6. 浅色 + 深色双主题验证(`[data-theme="dark"]` 不破)

### 3.3 样式约定
- 全局样式为主:`styles/` 下 10 个 CSS 承担绝大部分,组件 template 用 class 名引用
- `<style scoped>` 只放组件独有的局部微调;通用样式回 `styles/*.css`
- 只用 `var(--xxx)`,**不写死 hex**(深浅主题都由 token 覆盖)
- 深色集中在 `tokens.css` 的 `[data-theme="dark"]` 块,不散落到组件
- SVG 内联,不用 `<img>`/字体图标

### 3.4 状态管理
- **纯 composables,不用 Pinia**(跟随官方 + fork merge 命脉)。跨组件状态用模块级 ref 单例(`composables/codex/useUIState.ts` 模式)
- composable 文件只暴露 `use` 函数,不直接 export ref(防绕过 action 改)
- 全局快捷键注册表在 `composables/codex/useHotkeys.ts`,组件级键位处理函数在组件里写并注册进去
- `useKimiWebClient` 在 `App.vue` 顶层调一次,`provide('client', client)` 注入;优先 props 传,跨 3 层以上用 inject

---

## 4. 版本与发版

**单一版本源**:`src-tauri/tauri.conf.json` 的 `version`。发版时同步这 4 处保持一致:
- `src-tauri/tauri.conf.json`(权威)
- 根 `package.json`
- `web/package.json`
- `src-tauri/Cargo.toml`

语义化小步迭代:功能合入后递增 patch;每次发版同步 `CHANGELOG.md`(对应版本下记录新增/改进/修复)。

### 发版流程(tag 触发,CI 全自动)

**发版前(本地):**
1. 递增 patch 版本,同步上述 4 处保持一致
2. 更新 `CHANGELOG.md`:在对应版本号下记录新增/改进/修复(CI 会自动提取该段落作为 GitHub Release 说明)
3. 更新 `docs/upstream-capabilities.md`:能力状态标记有变动(✅/🟡/⬜/🧪)就同步
4. 提交这些文档变更到 main

**触发构建(二选一):**
- `git tag vX.Y.Z && git push origin vX.Y.Z`(常规)
- 或 Actions →「发行构建」→ Run workflow,填版本号(不带 v)

**CI 四阶段(`.github/workflows/release.yml`):**
1. `quality` —— 质量门禁(Ubuntu):typecheck + 单测 + 样式 + `web:build` + `cargo fmt --check` + `cargo test --locked`。**不通过则中止,不创建 Release**
2. `prepare` —— 创建 GitHub Release(空壳,防双平台抢建)
3. `build` —— macOS + Windows 矩阵并行:tauri-action 构建 → macOS 完整 adhoc 重签 + 重打 DMG → 上传资产到 Release
4. `manifest` —— 下载双平台包 → tauri signer 重签名 → 更新包入仓 `updates/` → 生成 `latest.json`(从 CHANGELOG 提取说明) → 上传 Release + 回传 main 分支(`[skip ci]`)+ 回填 Release 正文

产物落点:
- GitHub Release:macOS DMG / Windows NSIS exe(手动下载)
- 仓库 `updates/`:`latest.json`(双平台自动更新清单)+ 双平台更新包(raw.githubusercontent 主端点,jsDelivr 备;入仓是因为本机直连 github 下载链不通)

### 签名约定(无证书下的现状)

adhoc 自签名(`codesign --deep --force --sign -`)。几个**不能踩的坑**(release.yml 注释里的血泪经验):
- macOS 26 会把不完整签名判为「已损坏」,所以构建后**必须 `--deep --force` 重签整个 bundle**——CI 的 build 阶段已自动做
- **不要剥签名**:无签名 app 在 macOS 26 直接被 SIGKILL,adhoc 反而能跑(v1.0.5 试过剥签名,是方向性错误已回滚)
- 用户端「已损坏」提示用 `xattr -dr com.apple.quarantine /Applications/Kimi\ Code.app` 一次即可解
- tauri-action 重打包会使 bundler 签名失效,manifest 阶段对最终资产重新 tauri signer sign

正式对外发行需 Apple 开发者账号签名 + 公证(`tauri build` 配置后自动完成),**未配置**。

### `updates/` 回传 main 的冲突处理

manifest 阶段回传时,updates/ 的二进制必然和远端冲突(两版都改了同文件),CI 用 `git rebase -X theirs origin/main` 让本次新构建胜出。若发版期间 main 有更新,文档/代码提交会被 rebase 在 updates 提交之上。

---

## 5. 提交前质量门槛

按需跑(改哪层跑哪层):

```bash
pnpm web:typecheck                                      # vue-tsc,改了前端必跑
pnpm --filter @moonshot-ai/kimi-web check:style         # 改了样式
pnpm --filter @moonshot-ai/kimi-web commands:check      # 改了命令/分类必跑,防 GUI 映射漏
pnpm --filter @moonshot-ai/kimi-web test                # 改了 composable/逻辑
cargo test --manifest-path src-tauri/Cargo.toml         # 改了 Rust 壳
```

> 发版时 CI 的 `quality` 阶段会跑 typecheck + 单测 + 样式 + `web:build` + `cargo fmt --check` + `cargo test --locked`。发 tag 前本地预跑这些可避免 CI 门禁挂掉、Release 建一半中止。

**架构看门狗自查**(每次提交前过一遍,见 `ARCHITECTURE.md` 附录 A):
1. 协议层动了没?(动了回退)
2. 组件直接调 api 了没?(调了改走 client action)
3. 新代码在 codex/ 子目录吗?
4. 组件里写了 mock 常量吗?(写了改 props 传入)
5. 样式用了硬编码 hex 吗?(用了改 var(--xxx))
6. 改过的官方文件记 PATCHES.md 了吗?
7. 深色主题下验证了吗?

---

## 6. 开发与构建命令

```bash
pnpm install
pnpm dev              # tauri dev(web dev server + 桌面壳,热更新)
pnpm web:dev          # 只起前端 dev server(:5175,浏览器调试)
pnpm web:build        # vite build
pnpm build            # web build → postbuild → Rust release → .app + DMG
```

组件沙箱(不连 daemon 的纯 UI 验收):`pnpm web:dev` 后开
`http://localhost:5175/codex.html?scene=index|running|steer|approval|multi-agent|diff|settings`(可加 `&theme=dark`)

---

## 7. 文档导航

| 想干什么 | 看哪 |
|---|---|
| 代码怎么写(目录/数据流/组件契约/主题) | `ARCHITECTURE.md` |
| 视觉契约 / 组件结构源头 | `prototype/`(配 `prototype/README.md`) |
| 发行说明 | `CHANGELOG.md` |
| 接下来做什么 | `ROADMAP.md` |
| 官方能力整合状态 / 契约边界 | `docs/upstream-capabilities.md` |
| 斜杠命令分类映射 | `docs/commands.md` |
| 原始设计决策(19 条 Q&A) | `docs/superpowers/specs/2026-07-18-kimi-gui-design.md` |
