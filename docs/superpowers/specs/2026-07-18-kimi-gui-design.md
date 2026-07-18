# Kimi GUI 设计文档

> Fork 官方 `apps/kimi-web`(Vue 3)+ Tauri 壳,以 Codex 交互为目标的 Kimi Code 原生桌面客户端。

- **状态**:设计已确认,待用户审阅
- **日期**:2026-07-18
- **项目位置**:`/Users/liujun/project/kimi-gui`
- **分工**:用户定需求与体验验收;ZCode 负责技术决策与代码实现

---

## 1. 背景与动机

用户当前用 Kimi Code(`kimi` CLI 0.27)+ 官方 Web UI 工作。痛点:

- 官方 Web UI 在浏览器里使用不舒服(无全局快捷键/托盘/原生通知/Cmd-Tab 直达等)
- 用户自建了 `kimi-ui`(Tauri 2 + WKWebView 包装官方 SPA 编译产物),引入了额外卡顿 —— 为了给官方 SPA 打补丁,挂了 MutationObserver 盯整个 DOM,官方 SPA 的虚拟列表在滚动和流式输出时不停改 DOM,Observer 被高频触发,每次跑 5 个全文档 `querySelectorAll`,是 kimi-ui 卡顿的主因
- 包装方案的卡顿 + 官方 UI 本身的小毛病(思考流爬屏、列表序号裁切等),共同造成了"不丝滑"的感觉

目标:做一个**体验明显超越官方 Web、向 Codex 看齐**的原生桌面客户端。

---

## 2. 关键决策(均经用户确认)

| # | 决策 | 依据 |
|---|------|------|
| 1 | 项目位置 `/Users/liujun/project/kimi-gui`,全新项目 | 用户指定 |
| 2 | 成功标准:**体验优先**,交互明显超越官方 Web | 用户定 |
| 3 | 痛点范围:聊天流 + 输入 + 审批(都做,不分先后) | 用户定 |
| 4 | 使用姿势:**看着 agent 做**,实时跟进 → 聊天流是主线 | 用户定 |
| 5 | 平台:**Mac 优先,Windows 可选** | 用户定 |
| 6 | 主力 CLI:**kimi-code 0.27**(不切 Python kimi-cli / 不用 kimi-agent-rs) | 用户定 |
| 7 | 交互目标:**向 Codex 看齐** | 用户定 |
| 8 | 协议:**官方 daemon `/api/v1` REST + WebSocket** | 实测,klient 暂不可用 |
| 9 | **方案:fork 官方 `apps/kimi-web`(Vue 3)+ Tauri 壳** | 基于源码调研 + 痛点拆解 |
| 10 | 分工:用户定需求与验收,ZCode 改代码 | 用户前端不熟(Vue/React 都不熟) |
| 11 | 退路:Vue 不够丝滑再考虑 React(不并行) | 用户策略 |

### 排除的方案及原因

- **kimi-cli (Python) + `--wire`**:协议官方、文档全,但要切到 Python 产品线,放弃 kimi-code 0.27。用户明确"主力是 0.27 分支",排除。
- **kimi-agent-rs**:对应 Python kimi-cli 的 Rust 重写,但**停滞 5 个月,版本停在 1.8 而 kimi-cli 已 1.49**,无预编译 release,违背"跟随官方升级"约束。排除。
- **`@moonshot-ai/klient` SDK**:源码在 `packages/klient`,设计精良且 Browser-safe,但只走 `/api/v2`,**当前 daemon 0.27 不支持 `/api/v2`**(实测全部 404)。等 v2 上线后可作为协议层替换项。
- **自己写 React 客户端**:用户 Vue/React 都不熟,React 重写要数月才能追平官方 web 现水平,且无法 git merge 跟随官方升级。fork Vue 改现成代码成本远低。
- **纯原生 SwiftUI**:macOS 独占 + Markdown/diff/虚拟滚动全自造,工作量爆炸。

---

## 3. 方案可行性依据(实测)

### 3.1 官方 daemon(`/api/v1`)能力完整

实测可用端点:
```
GET    /api/v1/meta                          能力声明
GET    /api/v1/workspaces                    工作区(含 git 分支)
GET    /api/v1/sessions?page_size&workspace_id
GET    /api/v1/sessions/{id}                 会话详情
GET    /api/v1/sessions/{id}/messages?limit  消息历史
POST   /api/v1/sessions/{id}/prompts         发消息
POST   /api/v1/sessions/{id}/prompts:steer   中途追加输入(实测 200)
POST   /api/v1/sessions/{id}/prompts/{pid}:abort  中断
GET    /api/v1/sessions/{id}/tasks           后台任务
GET    /api/v1/sessions/{id}/fs:git_status
POST   /api/v1/files                         文件上传
GET    /api/v1/models  /tools  /providers  /config
```

WebSocket `/api/v1/ws`,鉴权用子协议 `kimi-code.bearer.<token>`(已从 kimi-ui status.html 验证)。

官方 SPA 实际处理的 **32 种事件类型**(从 bundle 反编译 + 官方 web 源码双重确认),覆盖:流式文本(`assistant.delta`)、思考流式(`thinking.delta`)、工具调用(`tool.call.*`)、轮次边界(`turn.*`)、审批(`event.approval.*`)、结构化问答(`event.question.*`)、子代理(`subagent.*`)、后台任务(`task.*`/`background.task.*`)、上下文压缩(`context.spliced`)、错误等。

### 3.2 官方 `apps/kimi-web` 源码质量与可 fork 性

- **MIT License**,可自由 fork/修改/商用/分发
- **对 monorepo 内部包零依赖**(实测 `package.json` 无 `@moonshot-ai/*` 内部包引用,无 `workspace:` 引用)→ 可独立抽出
- **无 Node 内置模块依赖** → 浏览器/WebView 兼容,可直接跑在 Tauri WebView
- **协议层 `src/api/daemon/` 共 7020 行,自包含**:
  - `agentEventProjector.ts`(1576 行)—— 32 种事件 reducer
  - `client.ts`(1562 行)—— REST 客户端
  - `eventReducer.ts`(816 行)—— 状态聚合
  - `wire.ts`(875 行)—— 协议类型
  - `ws.ts`/`http.ts`/`mappers.ts`/`serverAuth.ts`
- **核心组件实现质量不低**(非"从烂 UI 改起"):
  - `Composer.vue`(2246 行)已有 slash 命令、@提及、输入历史、附件上传、上下文环、模型快切
  - `ThinkingBlock.vue`(152 行)已有流式滚动窗 + 折叠 teaser
  - `DiffView` + `DiffLines` 已有逐行 unified diff + 文件树
  - `ApprovalCard.vue`(582 行)已有 plan_review、minimized、三档审批(approve/session/reject)+ inline feedback

### 3.3 痛点根因拆解(基于 kimi-ui 补丁证据)

| 类别 | 占比 | fork + Tauri 是否解决 |
|------|------|---------------------|
| 🟢 浏览器形态(无快捷键/托盘/原生通知/Cmd-Tab) | ~40% | ✅ Tauri 原生支持 |
| 🔵 kimi-ui 包装引入的卡顿(MutationObserver 反射 DOM) | ~30% | ✅ 不再反射,彻底消失 |
| 🟡 官方 UI 小毛病(思考爬屏、序号裁切等) | ~30% | ✅ fork 后改 Vue 文件,比补丁干净 |

---

## 4. 整体架构

```
┌──────────────────────────────────────────────────┐
│  壳层:Tauri 2 (Rust)                             │
│  • daemon 启动 + token 读取 (复用 kimi-ui)       │
│  • 窗口/系统集成/通知/Dock 角标                   │
│  • 全局快捷键、托盘、文件下载、外链处理           │
├──────────────────────────────────────────────────┤
│  UI 层:fork 官方 apps/kimi-web (Vue 3 + Vite)   │
│  • 协议对接:零成本(官方源码 7020 行)           │
│  • 32 种事件处理:官方 agentEventProjector 现成   │
│  • 交互改进:向 Codex 看齐(本项目增量)         │
├──────────────────────────────────────────────────┤
│  官方 daemon (kimi-code 0.27, /api/v1)           │
└──────────────────────────────────────────────────┘
```

核心原则:**薄壳厚客户端**。壳只做系统级的事(daemon 启动/窗口/通知),所有 UI 和业务逻辑在 Vue 层。这是与 kimi-ui "壳+官方SPA" 的根本区别。

---

## 5. Fork 策略与项目结构

### 5.1 Fork 方式:子目录 vendor(非整库 fork)

只把 `apps/kimi-web` 作为 `web/` 子目录 vendor 进 `kimi-gui`,不拿整个 monorepo(15 个 package + 5 个 app)。理由:只管需要的部分,merge 上游只关注 `apps/kimi-web` 改动,符合 YAGNI。

### 5.2 目录结构

```
kimi-gui/                          项目根
├── src-tauri/                     Tauri 壳 (Rust)
│   ├── src/main.rs                daemon 启动、token、系统集成 (复用 kimi-ui)
│   ├── Cargo.toml
│   └── tauri.conf.json
├── web/                           fork 自官方 apps/kimi-web (Vue 3)
│   ├── src/
│   │   ├── api/daemon/            🔒 协议层 (7020 行,尽量不动)
│   │   ├── components/            🟢 表现层 (改造主战场)
│   │   ├── composables/           🟡 业务层 (少改)
│   │   ├── views/                 🟢 布局层
│   │   └── main.ts
│   ├── package.json               独立,无 monorepo 依赖
│   ├── vite.config.ts             改造:对接 Tauri(去 dev proxy)
│   └── public/
├── .upstream/                     上游同步脚本 + patch 记录
│   ├── sync.sh                    从官方 repo 拉 apps/kimi-web 更新
│   └── PATCHES.md                 改过哪些官方文件的清单
├── package.json                   根 (管理 Tauri + web 协作)
└── README.md
```

### 5.3 改造边界(三层 + 颜色编码)

| 层 | 文件 | 策略 | 原因 |
|----|------|------|------|
| 🔒 协议层 | `web/src/api/daemon/*` | **绝不直接改** | 对接 daemon 命脉,官方改了跟着 merge |
| 🟡 业务层 | `web/src/composables/*` | 谨慎改,改前在 PATCHES.md 记原因 | 含状态管理/事件处理,改了 merge 易冲突 |
| 🟢 表现层 | `web/src/components/*`、`views/*` | 随便改,保持单一职责 | 打磨"丝滑感"主战场,不影响协议 |
| 🔧 构建层 | `vite.config.ts`、`index.html` | 集中改 | 对接 Tauri |

### 5.4 上游同步机制

- `.upstream/sync.sh fetch` 拉 `apps/kimi-web` 最新
- `.upstream/sync.sh diff` 看官方改了哪些文件
- `.upstream/sync.sh merge` 合并到 `web/`
- 手动解决冲突(主要在 `components/` 改过的文件)
- 更新 `PATCHES.md`

**PATCHES.md 的作用**:记录"我改过哪些官方文件、改了什么"。merge 冲突时,清单告诉你哪些冲突是我们的改造、哪些是官方的改动。是 fork 维护的命脉。

### 5.5 Tauri 接 Vue 的方式

```
开发时:
  vite dev server (5197) ← Tauri WebView 导航到这里
  Tauri Rust 进程 (启动 daemon,注入 Tauri API)

生产构建:
  vite build → web/dist/
  Tauri 打包时把 web/dist/ 嵌入 .app
  运行时 WebView 加载 embedded 资源 (custom-protocol)
```

关键改造点:`vite.config.ts` 去掉官方的 dev proxy(`/api/v1` 转发),WebView 直连 `127.0.0.1:58627`。

---

## 6. 改造路线图(以 Codex 为目标)

### 6.1 官方 web vs Codex 真实差距(基于代码实证)

| 维度 | 官方 web 现状 | Codex 标杆 | 差距 |
|------|-------------|----------|------|
| 思考折叠 | 滚动窗 + teaser | 不打扰主对话 | 🟢 小 |
| 流式打字 | markstream-vue 自研 | 流畅 + 可中断 | 🟢 小 |
| **diff 展示** | 逐行 unified diff,**只读** | **per-hunk accept/reject**(杀手锏) | 🔴 大 |
| 审批 | 三档 + feedback | 同 | 🟢 持平 |
| 输入框 | 功能全 | + 快捷键体系、命令面板 | 🟡 中 |
| 滚动节奏 | 有爬屏问题 | 稳定视口 | 🟡 中 |
| **系统集成** | 无(是 web) | 全局唤起、多窗口、快捷键 | 🔴 大 |
| 视觉克制 | 信息密度高 | 留白多、聚焦 | 🟡 中 |

### 6.2 优先级与文件映射

**🔴 P0(决定"像不像 Codex")**

| # | 改造点 | 涉及文件 | 工作量 |
|---|--------|---------|-------|
| 1 | diff per-hunk accept/reject | 新增 `DiffHunkReviewer.vue` + `diffHunks.ts`;官方 `DiffLines.vue` 仅加一个调用点 | 大 |
| 2 | Tauri 系统集成(全局快捷键/托盘/多窗口) | `src-tauri/src/main.rs` + Vue 调 Tauri API | 大 |
| 3 | 滚动爬屏修复 | `ConversationPane.vue`(1864 行,定位爬屏逻辑) | 中 |

**🟡 P1(决定"丝不丝滑")**

| # | 改造点 | 涉及文件 | 工作量 |
|---|--------|---------|-------|
| 4 | 思考折叠节奏微调 | `ThinkingBlock.vue` | 小 |
| 5 | 输入快捷键体系 | 新增 `useComposerShortcuts.ts`;`Composer.vue` 最小侵入 | 中 |
| 6 | 命令面板(Cmd+K) | 新组件 | 中 |
| 7 | 视觉克制化 | 全局样式 | 中 |

**🟢 P2(锦上添花)**

| # | 改造点 | 涉及文件 |
|---|--------|---------|
| 8 | 状态/进度可视化打磨 | `StatusPanel.vue`、`TasksPane.vue` |
| 9 | 蜂群面板优化 | `AgentDetailPanel.vue` |
| 10 | 深浅色/主题 | 全局 |

### 6.3 diff per-hunk 技术路线

**场景**:agent 改文件有 3 处 hunk,官方只能全有全无;Codex 能逐 hunk accept/reject。

**路线甲(起步)**:纯 UI 层改造
- 新增 `DiffHunkReviewer.vue`(hunk 分组 + 每 hunk 独立 accept/reject 按钮)
- 新增 `diffHunks.ts`(把整文件 diff 解析成 hunk 数组)
- accept → 调 daemon 文件写入接口落实改动
- reject → 调 daemon 撤销该 hunk
- **风险**:daemon 是否支持"部分应用"待验证,不够则降级为"接受全部→手动撤"

**路线乙(深改)**:审批流改造,需协议层支持 hunk 级审批信号。仅在甲不足时考虑。

### 6.4 验收标准(可观察行为)

| 改造点 | 验收行为 |
|--------|---------|
| diff per-hunk | 能在 diff 视图点某 hunk 单独接受/拒绝,其余不动 |
| 系统集成 | Cmd+Shift+K 全局唤起;关窗后台;托盘图标 |
| 滚动爬屏 | 思考流输出时主对话视口不上下跳动 |
| 输入快捷键 | Cmd+Enter 发送、↑↓ 历史、Esc 清空、Cmd+K 命令面板 |
| 视觉克制 | 截图和 Codex 并排,信息密度/留白接近 |

---

## 7. 架构纪律(防止代码腐烂)

### 7.1 改造边界红线

- 🔒 `web/src/api/daemon/*` → **任何修改必须先讨论**,这是跟随官方升级的命脉
- 🟡 `web/src/composables/*` → 改前在 `PATCHES.md` 记原因
- 🟢 `web/src/components/*` → 随便改,保持单一职责

### 7.2 新增代码独立成层,不污染 fork

**错误做法**:把新逻辑直接塞进官方组件(如把 hunk 逻辑塞进 `DiffLines.vue`)→ 官方升级时 merge 必冲突。

**正确做法**:新增独立文件,官方文件只做最小侵入(如加一个 `<DiffHunkReviewer>` 调用点)。

```
web/src/components/chat/DiffLines.vue        ← 官方,几乎不动
web/src/components/chat/DiffHunkReviewer.vue ← 新增,我们的 per-hunk UI
web/src/lib/diffHunks.ts                     ← 新增,hunk 解析逻辑
```

适用于所有改造(per-hunk、快捷键、命令面板、视觉调整)。

### 7.3 架构看门狗(每次提交前自查)

1. 这次改动有没有碰协议层? → 碰了必须回退或特批
2. 新增代码是否独立成文件,还是塞进官方组件了? → 塞进了要重构
3. PATCHES.md 是否更新? → 改过哪些官方文件必须记录

每个改造完成后主动汇报这三项检查结果。

---

## 8. 资产复用(以 Codex 为标准)

| kimi-ui 资产 | 决定 | 理由 |
|-------------|------|------|
| `connect_daemon` / token 读取 / `find_kimi` / `kimi_home` | ✅ 复用 | 协议层无关,纯基础 |
| Tauri 窗口装饰代码 | ⚠️ 复用骨架,重做样式 | Codex 视觉更克制 |
| 打包/签名/LaunchAgent | ✅ 复用 | 系统集成无关 |
| `INIT_SCRIPT`(MutationObserver 补丁) | ❌ 丢弃 | fork 后不需要(核心收益) |
| `status.html` 状态栏 | ❌ 不用 | 官方 web 自带 |
| PTY 额度抓屏 | ❌ 不用 | 官方 web 自带,这是 kimi-ui 时代 hack |
| 蜂群面板 | ❌ 不用 | 官方 `AgentDetailPanel` 已有 |

原则:只带"启动 daemon + 打包"这种纯基础设施。所有 UI 相关以官方 web 为起点往 Codex 方向改,不污染 fork。

---

## 9. 里程碑(粗略,实施计划阶段细化;共 6 个 M0–M5)

1. **M0 项目骨架**:`kimi-gui` 初始化,Tauri 壳搭起来,vendor `apps/kimi-web`,能跑通"启动 → 连 daemon → 看到官方 UI"
2. **M1 基础丝滑**:Tauri 系统集成(快捷键/托盘/通知),滚动爬屏修复,丢弃 MutationObserver
3. **M2 Codex 级 diff**:per-hunk accept/reject
4. **M3 输入与命令体系**:快捷键、命令面板
5. **M4 视觉打磨**:向 Codex 视觉克制靠拢
6. **M5 P2 项**:状态/蜂群/主题

---

## 10. 风险与未决项

| 风险 | 应对 |
|------|------|
| daemon 是否支持 hunk 级文件操作 | M2 起步前先验证 `fs:` 系列端点,不够则降级 |
| 官方 web 升级导致 merge 冲突 | 架构纪律(7.1/7.2)保证冲突集中在表现层 |
| Vue 学习曲线(用户不熟) | 分工:ZCode 写代码,用户验收 |
| `klient` / `/api/v2` 未来上线 | daemon 升级支持 v2 后,可替换协议层(`api/daemon/*` 整体换成 klient) |
| 官方 web UI 结构性大改 | `.upstream/sync.sh diff` 提前发现,PATCHES.md 辅助解决 |

---

## 11. 参考资料

- 官方 web 源码:`github.com/MoonshotAI/kimi-code` 的 `apps/kimi-web`(MIT)
- 官方协议类型:`packages/protocol`(TS 类型 + 测试)
- 官方客户端 SDK:`packages/klient`(面向 `/api/v2`,当前不可用)
- daemon 实测端点:见本文 3.1
- kimi-ui 补丁证据:`/Users/liujun/project/kimi-ui/src/main.rs` 的 `INIT_SCRIPT`
- Wire 模式文档(参考,本项目不用):`moonshotai.github.io/kimi-cli/zh/customization/wire-mode.html`
