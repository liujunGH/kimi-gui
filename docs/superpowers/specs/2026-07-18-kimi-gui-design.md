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
| 12 | **新增高优痛点:运行中的引导(steer)和任务排队**,官方有功能但体验差(详见 6.6) | 用户反馈,代码实证确认 |
| 13 | **对标对象明确为 Codex 桌面 App**(Electron,2026-02 发布,后并入 ChatGPT 桌面),不是 CLI/IDE 扩展 | 用户澄清,第 2 轮调研确认 |
| 14 | **per-hunk stage/revert 砍掉**(事后 git 操作也砍)—— 用户姿势是"整体重做",不需要逐块保留/撤销 | 用户确认(基于桌面 App Review pane 调研) |
| 15 | **功能 vs 交互分离**:产品 = Kimi 功能集(全保留,不丢)+ Codex 交互形态(重做,不照抄 Kimi web)。fork 真正得到的资产是协议层 + slash 系统 + markstream(代码实证),UI 按 Codex 重做。详见 6.0 | 用户澄清 + 源码实证 |
| 16 | **UI 不走"最小侵入官方组件"路线**:官方 `.vue` 文件只读参考,新 UI 放 `components/codex/` 独立重做。架构纪律见第 7 章 | 由决策 15 推导 |
| 17 | **斜杠命令分两类数据源**:内置命令(15 个,前端写死,跟官方一致)+ Skills(daemon 动态拉取,不能写死)。详见 6.2.1 | 用户澄清 + 源码实证 `client.ts:869/881` |
| 18 | **动态数据必须标注**:模型/工作区/Threads/思考深度/权限模式/token 用量,真实都从 daemon 拉。原型 mock 可以,但代码必须注释"动态"/"待 M0 验证",Vue 落地时走真实 daemon 调用,不允许搬 mock。详见 6.4.5 | 用户澄清 |
| 19 | **状态管理用纯 composables,不用 Pinia**:跟官方 Kimi web 一致(`useKimiWebClient.ts` 3024 行 + 8 个子 composable)。Pinia 会偏离官方架构、破坏 fork merge 命脉、违背"跟随官方升级"硬约束。Devtools 调试用 console.trace 弥补。详见 ARCHITECTURE.md 第 3 节 | 用户拍板 + 源码实证 |

### 排除的方案及原因

- **kimi-cli (Python) + `--wire`**:协议官方、文档全,但要切到 Python 产品线,放弃 kimi-code 0.27。用户明确"主力是 0.27 分支",排除。
- **kimi-agent-rs**:对应 Python kimi-cli 的 Rust 重写,但**停滞 5 个月,版本停在 1.8 而 kimi-cli 已 1.49**,无预编译 release,违背"跟随官方升级"约束。排除。
- **`@moonshot-ai/klient` SDK**:源码在 `packages/klient`,设计精良且 Browser-safe,但只走 `/api/v2`,**当前 daemon 0.27 不支持 `/api/v2`**(实测全部 404)。等 v2 上线后可作为协议层替换项。
- **自己写 React 客户端**:用户 Vue/React 都不熟,React 重写要数月才能追平官方 web 现水平,且无法 git merge 跟随官方升级。fork Vue 改现成代码成本远低。
- **纯原生 SwiftUI**:macOS 独占 + Markdown/diff/虚拟滚动全自造,工作量爆炸。
- **diff per-hunk accept/reject**:社区称赞但用户使用姿势("看着做、有问题直接让 AI 改")不需要逐块接受/拒绝。砍掉,改为 diff 展示打磨。

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
| 🟡 官方 UI 小毛病(思考爬屏、序号裁切等) | ~30% | ✅ fork 后按 Codex 重做 UI,比补丁干净 |

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
│   │   ├── api/daemon/            🔒 协议层 (8 文件,纯 TS,零 Vue,不动)
│   │   ├── lib/slashCommands.ts   🔒 slash 系统 (纯 TS,不动)
│   │   ├── components/            🟡 官方 UI 层 (只读参考,理解功能)
│   │   │   ├── chat/              ← 官方组件,只读
│   │   │   └── codex/             ← 🟢 新增,我们按 Codex 重做的 UI
│   │   ├── composables/           🟡 官方逻辑层 (只读参考)
│   │   │   └── codex/             ← 🟢 新增,我们的交互逻辑
│   │   ├── views/                 🟢 布局层 (Codex 风格重做)
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

### 5.3 改造边界(三层文件隔离,详见第 7 章)

| 层 | 文件 | 策略 | 原因 |
|----|------|------|------|
| 🔒 **协议层** | `web/src/api/daemon/*`、`lib/slashCommands.ts` | **绝不改** | git merge 命脉,实证纯 TS 零 Vue |
| 🟡 **官方资产(只读)** | `web/src/components/chat/*`、`composables/*` | **只读参考**,不在原文件改 | 理解功能/数据结构;新逻辑放 `components/codex/`、`composables/codex/` |
| 🟢 **我们的 UI(重做)** | `web/src/components/codex/*`、`composables/codex/*`、`views/*` | **自由,单一职责** | 按 Codex 重做,主战场 |
| 🔧 **构建层** | `vite.config.ts`、`index.html` | 集中改 | 对接 Tauri |

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

### 6.0 判断框架(方法论锚点)

> **核心理解**:我们的产品 = **Kimi 功能集 + Codex 交互形态**。
> - **功能**(做什么):全部保留 Kimi,不丢任何一个
> - **交互**(怎么呈现/怎么操作):**按 Codex 重做**,不是照抄 Kimi web
>
> 之前版本误把"fork 官方 web"理解为"UI 即得",错。fork 真正得到的资产是**协议层和逻辑层**,UI 交互层基本要按 Codex 重写。

#### 6.0.1 功能 vs 交互(必须分清)

| | 功能(做什么) | 交互(怎么做) |
|--|--------------|-------------|
| 来源 | Kimi web | **Codex 桌面 App** |
| 处理 | **全保留** | **重做** |
| 例子 | `/fork` 命令存在、审批能 y/n/p/a、多 agent 能并行 | `/fork` 入口放哪怎么触发、审批卡内联还是弹窗、agent 卡片化还是列表 |

**官方 Kimi web = Kimi 功能 + Kimi 交互**(交互不丝滑)
**旧 kimi-ui = Kimi 功能 + Kimi 交互**(套个 Tauri 壳,交互没变 → 所以不丝滑)
**本项目 = Kimi 功能 + Codex 交互**(重构交互层)

#### 6.0.2 fork 官方 web 真正得到的资产(代码实证)

| 层 | 位置 | Vue 依赖 | fork 价值 | 用法 |
|----|------|---------|----------|------|
| **协议层** | `api/daemon/`(8 文件:client/ws/http/wire/eventReducer/agentEventProjector/mappers/serverAuth) | ❌ 零(纯 TS) | ⭐⭐⭐ | **git merge 持续受益**,跟随官方升级的命脉 |
| **slash 系统** | `lib/slashCommands.ts` | ❌ 零(纯 TS,文件头注释明说) | ⭐⭐⭐ | 15 个命令元数据,直接用 |
| **markstream-vue** | npm 包 | ✅ Vue 专属 | ⭐⭐⭐ | 流式 markdown 渲染,锁定 Vue 选型 |
| **逻辑层 composables** | `composables/`(22 文件) | 🟡 19/22 用 Vue ref/computed | ⭐⭐ | 逻辑可参考,**响应式要按新 UI 重写** |
| **UI 组件** | `components/**/*.vue` | ✅ 强绑定 Vue + markstream-vue | ⭐ | **交互代码不复用**,按 Codex 重做 |

**结论**:fork 价值集中在**前三行**(协议层 + slash + markstream),这三块共同决定了**选 Vue**(因为 React 要重建 markstream,且协议层虽纯 TS 但 git merge 路径更顺)。UI 组件层的交互代码不在复用范围。

#### 6.0.3 三层判断框架

| 层 | 范围 | 决策 |
|----|------|------|
| **① 功能集** | Kimi 所有原生功能(15 个 slash 命令、TodoCard、ConversationToc、多 agent、@提及、附件、审批、思考块、diff……) | **全保留,不讨论取舍**。丢了任何一个都是 bug。功能"做什么"由协议层+slash 系统保证(代码实证已确认) |
| **② 交互层** | 所有 UI 组件的呈现和操作方式 | **按 Codex 重做**,不是小改官方组件。这是本项目主体工作(6.2/6.3/6.4/6.6/6.7)。工作量按"重做"估,不是"改" |
| **③ Codex 独有功能增量** | Kimi 协议没有的能力(全局快捷键、Appshots、/side 临时分支……) | **看 Kimi server 支不支持**。支持就加,不支持评估造轮子 |

**核心原则**:
- **第①层无取舍**:Kimi 所有功能必须先 100% 跑通,这是验收底线
- **第②层是主体**:P0/P1/P2 主要针对交互层重做,工作量按"重做"估
- **第③层是增量**:只有 Codex 独有且 Kimi 协议没有的,才按 server 支持度判
- **"最小侵入官方组件"原则作废**:UI 按 Codex 重做,官方 .vue 文件只是"功能参考",不是"小改对象"。**架构纪律(第 7 章)随之调整为:协议层不动 + 新 UI 独立成层**

### 6.1 官方 web vs Codex 交互差距(基于代码实证)

> 注意:本表对比的是**交互形态**,不是功能。功能 Kimi 全有(第①层),差距全在交互层(第②层)。

| 维度 | 官方 web 交互(要重做) | Codex 交互(目标) | 重做工作量 |
|------|---------------------|------------------|----------|
| 思考折叠 | 滚动窗 + teaser | 内联 + 单行摘要 + 全局开关 + 流式 | 🟡 中 |
| 流式打字 | markstream-vue(复用) | 流畅 + 可中断 | 🟢 小(markstream 直接用) |
| **diff 展示** | 逐行纯文本无高亮全展开 | 语法高亮 + 词级 + 折叠 + Review pane | 🔴 大 |
| 子代理展示 | SwarmTool/AgentDetailPanel 列表式 | 卡片化 + 父子树 + 状态指示 | 🟡 中 |
| 审批 | ApprovalCard 已内联,但无单键 | 内联 + 单键 y/n/p/a + mini diff | 🟡 中 |
| 输入框 | 功能全但 steer 隐式 | 显式 steer/queue + 自适应 + 命令面板 | 🔴 大 |
| 滚动节奏 | 有爬屏问题 | 稳定视口 | 🟡 中 |
| **多 agent** | 列表式 | 卡片侧栏 + Project 分组 + 系统通知 | 🔴 大 |
| **系统集成** | 无(是 web) | 全局唤起 + 多窗口 + 快捷键 | 🔴 大 |
| 视觉克制 | 信息密度高 | 留白多、聚焦 | 🟡 中 |

**已排除(用户反馈)**:per-hunk accept/reject。用户姿势是"看着做、有问题直接让 AI 改",不需要逐块接受/拒绝。

### 6.2 交互重做优先级与文件映射

> **方法论修正**:以下不是"改官方组件",而是**在 `components/codex/` 下重写 Codex 风格组件**。官方 `.vue` 只读参考,理解功能。工作量按"重做"估。

**🔴 P0(决定"像不像 Codex",MVP 必做)**

| # | 重做项 | 新文件(`components/codex/`) | 参考官方(只读) | 工作量 |
|---|-------|----------------------------|---------------|-------|
| 1 | **对话流主框架**(思考/正文/工具调用/审批内联混排) | `ConversationPane.vue` | `chat/ConversationPane.vue`(1864 行) | 大 |
| 2 | **思考块**(内联 + 单行摘要 + 流式 + 全局开关 + Esc 中断) | `ThinkingBlock.vue` | `chat/ThinkingBlock.vue`/`ThinkingPanel.vue` | 中 |
| 3 | **输入框 Composer**(显式 steer/queue 按钮 + 模式区分 + 反馈 + Cmd+Enter + 运行态自适应) | `Composer.vue` + `composables/codex/useSteer.ts` | `chat/Composer.vue`(2246 行,只参考功能) | 大 |
| 4 | **任务队列面板**(可见化 + 重排 + 模式区分) | `QueuePanel.vue` | `chat/QueuedPromptView` | 中 |
| 5 | **diff 展示**(语法高亮 + 折叠 + 文件聚合) | `DiffView.vue` + `composables/codex/useDiff.ts` | `chat/DiffLines.vue`/`DiffView.vue`(只参考数据结构) | 中 |
| 6 | **审批卡**(单键 y/n/p/a + **mini diff 预览:必须支持 shell + diff 两种 kind**,diff kind 复用 DiffView 高亮样式) | `ApprovalCard.vue` | `chat/ApprovalCard.vue`(582 行) | 中 |
| 7 | **多 Thread 侧栏**(卡片化 + Project 分组 + 父子 Subagent + 状态) | `ThreadSidebar.vue` | `chat/SwarmTool`/`AgentDetailPanel` | 大 |
| 8 | Tauri 系统集成(全局快捷键/托盘/通知) | `src-tauri/src/*` | kimi-ui `main.rs` | 大 |
| 9 | **斜杠命令菜单**(打 `/` 触发,**两类数据源**,详见 6.2.1) | `SlashMenu.vue` + `composables/codex/useSlashMenu.ts` | `chat/SlashMenu.vue` + `lib/slashCommands.ts` | 中 |
| 10 | **`@` 文件提及菜单**(打 `@` 触发文件模糊搜索 + 插入) | `MentionMenu.vue` + `composables/codex/useMentionMenu.ts` | `chat/MentionMenu.vue` | 小 |

**P0 排序理由**:思考/steer/queue 是"看着 agent 做"姿势的核心链路 —— **看思考(过程)→ 发现问题 → steer 纠正 → 看输出 → 看对比(结果)**。这条链路必须一起重做,不能割裂。diff/多 agent 是特定场景,系统集成是基础体验。**斜杠/@ 是 Kimi 功能基线必备**(官方 web 全有,fork 后不能丢)。

**核心链路说明(用户反馈澄清)**:用户"看 AI 输出"不只是看 diff(结果),更是看**思考链路(过程)**,验证 AI 推理对不对。结果错了要重做,过程错了要立即 steer 纠正。所以思考(P0-2)与 steer(P0-3)是紧耦合的,必须联动设计。

#### 6.2.1 斜杠命令菜单的两类数据源(关键约束,不能写死成一坨)

> **用户明确指出**:斜杠命令不应该全部写死,有一部分要跟 Kimi Code daemon 拿。源码实证确认。

斜杠菜单的真实数据 = **内置命令(写死)+ Skills(daemon 动态拉取)**:

| 类型 | 来源 | 字段特征 | 实证 |
|------|------|---------|------|
| **内置命令** | 前端 hardcode(`lib/slashCommands.ts`,纯 TS 零 Vue) | `desc` 是 **i18n key**(`commands.new.desc` 等) | 官方 web 也写死,直接用 |
| **Skills**(用户/项目自定义) | daemon 动态拉取,不能写死 | `desc` 是 **raw text**;`isSkill: true` | `client.ts:869` `GET /sessions/{id}/skills` + `:881` `GET /workspaces/{id}/skills` |

**内置命令清单**(写死,跟官方一致):
`/new` `/clear` `/login` `/plan` `/swarm` `/goal` `/btw` `/auto` `/yolo` `/thinking` `/compact` `/undo` `/fork` `/export` `/status`

**字段定义**(源码 `lib/slashCommands.ts`):
```ts
interface SlashCommand {
  name: string;
  desc: string;        // 内置 = i18n key;Skill = raw text
  isSkill?: boolean;   // true = Skill(daemon 拉),省略 = 内置
  acceptsInput?: boolean;  // true = 选中后留输入框继续打参数(如 /swarm /goal /btw /compact)
}
```

**UI 必须区分两类**:
- 内置命令:显示 i18n 解析后的描述,无特殊标记
- Skill:显示 raw description + `skill` 小标签或图标,明确告诉用户"这是扩展命令"
- 两类在同一菜单里按分組显示(内置在上,Skill 在下,中间分隔线)

**Skills API**:
- `GET /sessions/{sessionId}/skills` → `{ skills: WireSkillDescriptor[] }`(session 级)
- `GET /workspaces/{workspaceId}/skills` → 同上(workspace 级,无 session 时用)
- `POST /sessions/{id}/skills/{name}:activate` body `{ args? }` → `{ activated: true, skillName }`(选中 Skill 时调用)
- `AppSkill` 字段:`{ name, description, source }`

**交互**:
- 输入框打 `/` 触发浮层
- 模糊搜索过滤(打 `/th` 过滤出 `/thinking`)
- ↑↓ 选择,Enter 选中
- 有 `acceptsInput` 的命令选中后**留在输入框**让用户继续打参数;其他命令选中直接执行
- Esc 关闭
- 跟 `@` 文件菜单用同一个浮层组件骨架,换数据源

**🟡 P1(决定"丝不丝滑")**

| # | 重做项 | 新文件 | 工作量 |
|---|-------|-------|-------|
| 9 | 思考长文导航(搜索/大纲/虚拟滚动) | `ThinkingBlock.vue` 扩展 | 中 |
| 10 | 命令面板(Cmd+K) | `CommandPalette.vue` | 中 |
| 11 | Review pane(右侧独立 diff 工作区) | `ReviewPane.vue` | 大 |
| 12 | effort 档位下拉 | `Composer.vue` 扩展 | 小 |
| 13 | Context 指示条 + `/compact` 可视化 | `Composer.vue` 扩展 | 小 |
| 14 | 失败 agent 置顶/高亮 | `ThreadSidebar.vue` 扩展 | 小 |
| 15 | 视觉克制化(向 Codex 留白靠拢) | 全局样式 | 中 |

**🟢 P2(锦上添花)**

| # | 重做项 | 新文件 |
|---|-------|-------|
| 16 | split diff / 词级 diff | `DiffView.vue` 扩展 |
| 17 | Appshots(截屏发 agent) | 新增 |
| 18 | `/side` 临时分支会话(M0 验证 server 后定) | 新增 |

### 6.3 diff 展示重做候选点(待 M0 后用户确认优先)

官方 `DiffLines.vue`(129 行)只参考其数据结构(unified diff 格式、行号、+/- 符号)。我们重做的方向:

| 候选点 | 官方现状 | 改造方向 | 备注 |
|--------|---------|---------|------|
| 语法高亮 | 纯文本 | diff 行内代码接 shiki 高亮 | 用户高频看代码,价值高 |
| 词级 diff | 整行红绿 | 同行内高亮变化的词 | 小改动行也清晰 |
| 大文件折叠 | 全展开 | 默认折叠 hunk,点击展开 | 长 diff 不刷屏 |
| 快速跳转 | 无 | 快捷键跳到下一个改动 | 长文件浏览 |
| split view | 单栏 | 旧/新并排同步滚 | 可选,看用户偏好 |

**M0 验收时让用户实际跑 diff,从这 5 个里挑出真痛的**,而不是全做。

### 6.4 子代理展示重做候选点(待 M0 后用户确认)

官方只读参考:`SwarmTool.vue`(swarm 工具卡,484 行)、`AgentDetailPanel.vue`(详情面板,266 行)、`TasksPane.vue`(任务列表,333 行)。官方的 phase 标签/手风琴/跟随底部可借鉴布局思路,但 UI 按 Codex 卡片化重做。

可能重做方向(待用户反馈):
- 多子代理并排对比(grid vs 手风琴)
- token 消耗对比可见性
- 失败子代理置顶/高亮
- 实时输出节奏(是否爬屏)

### 6.4.5 动态数据来源约束(防止 Vue 落地时把动态数据写死)

> **用户明确指出**:有些数据不能写死,要跟 Kimi Code daemon 拿。原型用 mock 没问题,但代码/注释必须标注"动态",否则 Vue 落地时会误以为 hardcode 就行。

| 数据 | 真实来源 | 写死风险 | 原型处理 |
|------|---------|---------|---------|
| **斜杠命令 - Skills 部分** | `GET /sessions/{id}/skills` + `/workspaces/{id}/skills`(详见 6.2.1) | 🔴 高(用户指出过) | mock 2-3 条 + 注释"动态" |
| **斜杠命令 - 内置部分** | 前端 hardcode 是对的(官方也这么干) | ➖ 无 | 直接用官方清单 |
| **模型列表** | daemon 返回,不同账号能用的模型不同 | 🟡 中 | mock K2.7/K3 + 注释 |
| **思考深度档位** | daemon 支持度待验证(M0 盲点,见 6.7.4) | 🟡 中 | Low/High/Max 是猜测 + 注释"待验证" |
| **工作区列表** | `GET /workspaces` | 🟡 中 | mock + 注释 |
| **Threads 列表** | `GET /sessions` | 🟡 中 | mock + 注释 |
| **权限模式三档** | daemon `set_mode` 是否存在待验证(M0 盲点) | 🟡 中 | mock + 注释"待验证" |
| **上下文 token 用量** | `turn.completed` 的 usage 字段(M0 盲点) | 🟡 中 | mock + 注释 |

**约束**:
- 原型阶段所有动态数据可以 mock,但**必须在代码里注释标注 `// 动态:从 daemon 拉` 或 `// 待 M0 验证`**
- Vue 落地时,这些数据必须走 `composables/codex/` 的真实 daemon 调用,**不允许把 mock 数据搬进 Vue 组件当写死值**
- M0 阶段优先验证 3 个盲点(思考深度档位 / 权限模式 / token usage),验证后回填此处

### 6.5 验收标准(可观察行为)

| 重做项 | 验收行为 |
|-------|---------|
| steer 重做 | 运行时输入框有明显"插话"按钮;steer 后有可见反馈(如临时气泡"已引导");不再依赖 Ctrl+S |
| 任务队列重做 | 队列条数/内容/顺序随时可见;能重排;能区分"立即引导"vs"排队下轮" |
| diff 重做 | M0 后用户从候选点中挑出的真痛点被解决 |
| 子代理重做 | 同上 |
| 系统集成 | Cmd+Option+N 全局唤起;关窗后台;托盘图标 |
| 滚动爬屏 | 思考流输出时主对话视口不上下跳动 |
| 输入快捷键 | Cmd+Enter 发送、↑↓ 历史、Esc 清空、Cmd+K 命令面板 |
| 视觉克制 | 截图和 Codex 并排,信息密度/留白接近 |
| **斜杠命令菜单** | 打 `/` 弹出;**内置命令 + Skills 两类分组可见**;模糊搜索 + ↑↓ + Enter 都能用;`acceptsInput` 命令留输入框继续打参数 |
| **`@` 文件提及菜单** | 打 `@` 弹出文件搜索;模糊匹配;Enter 选中后插入 |
| **审批 mini diff** | `approval` 页能看 shell + diff 两种审批卡,diff 卡复用 DiffView 高亮样式 |
| **功能完整性(第①层)** | Kimi 所有 15 个 slash 命令 + TodoCard + ConversationToc + 多 agent + 审批 + @提及 + 附件全部可用,丢一个就是 bug |

### 6.6 steer 与任务队列(基于代码实证,已确认痛点)

**用户反馈**:运行过程中的引导(steer)和排队很重要,官方不好用。这是**每次用 agent 都遇到**的高频痛点,优先级高于 diff/子代理。

**官方现状(代码实证,只读参考)**:
- steer 功能存在:`Composer.vue:494` 的 Ctrl+S/Cmd+S 快捷键;`handleSteer()`(370-397 行)发 `steer` 事件
- queue 功能存在:`QueuedPromptView` 类型(`types.ts:333`);运行时发送自动入队(`Composer.vue:550` 注释:"Send is always send — while running it enqueues")
- queue 管理有限:`ConversationPane.vue` 只有 `unqueue`(取消)和 `editQueued`(编辑),**无重排**

**实证的"不好用"根因**:

| 痛点 | 代码证据 | 影响 |
|------|---------|------|
| steer 唯一入口是 Ctrl+S,无按钮 | `Composer.vue:494` 只有快捷键 | 用户不知道有这功能;Ctrl+S 与浏览器保存冲突,易误触 |
| steer 后反馈不清晰 | `handleSteer()` 只 emit + 清空输入 | 不知道"插话进没进""agent 收到没" |
| 运行时输入框没区分提示 | 注释"Send is always send — while running it enqueues" | 用户以为发送会引导,结果默默入队,无提示 |
| 队列可见性差 | `queued` props 在 ConversationPane 某处渲染 | 不知道"排了几条""下一条是什么" |
| 队列不能重排 | 只有 unqueue/editQueued | 想插队/改优先级做不到 |
| steer 与 queue 混淆 | steer 会"合并队列"一起塞 | 分不清"立即引导"vs"排队下轮" |

**重做方向**(具体设计待实施计划阶段):

1. **steer 显式化**:
   - 运行时输入框旁加显式"插话/引导"按钮(不依赖快捷键)
   - 换掉 Ctrl+S(改成不冲突的键,如 Cmd+J 或 Cmd+Enter 在运行态变 steer)
   - steer 成功后有可见反馈(临时气泡/输入框高亮/agent 状态指示"已收到引导")

2. **队列可见化与管理**:
   - 输入框附近常驻队列指示器(如"3 条排队中",点击展开)
   - 队列面板显示每条内容 + 顺序,支持拖拽重排
   - 明确区分两个动作:**"立即引导当前轮"(steer)** vs **"排队等下轮"(queue)**,UI 上颜色/图标/位置区分

3. **运行态输入框自适应**:
   - agent 运行时,输入框默认动作从"发送"变为明确的"排队"或"引导"(可切换)
   - 不再让用户在不知情情况下"发送"变"入队"

### 6.7 Codex 桌面端完整交互清单 → Kimi 可实现性对照(第 2 轮,基于桌面 App)

> **重要修正**:第 1 版(基于 CLI 调研)已废弃。本版基于**第 2 轮调研,专注 Codex 桌面 App**(2026-02-02 macOS 发布,后并入 ChatGPT 桌面应用的 Codex/Work 模式,**技术栈是 Electron**)。
> **方法论**:按用户要求"先梳理 Codex 完整交互 → 对照 Kimi 能不能实现 → 排优先级清单"。
> **三道筛子**:① Kimi daemon 协议是否支持 ② Tauri 壳层是否能实现 ③ 优先级(频率 × 严重度)。
> **来源**:3 个子 agent 桌面 App 专研(思考+对话流 / 多 agent+系统 / 输入+审批+diff),官方文档 + Macaron 博客 + GitHub Issues + 社区评测。
>
> **与 6.0 框架的关系**:6.7.1 只回答"能不能实现",**不含取舍**;取舍由 6.7.2 的三层判断(① Kimi 已有改交互 / ② Codex 类似参考改造 / ③ Codex 独有看 server)决定;最终实施清单见 6.7.5。

#### 6.7.0 关键背景(影响所有判断)

- **对标对象是 Codex 桌面 App**(Electron),不是 CLI(终端 TUI)、不是 IDE 扩展(VS Code 插件)
- **桌面 App 的核心定位**:"command center for agents",多 agent 并行 + 长任务是灵魂
- **桌面 App 在思考展示上其实很弱**(默认折叠、不实时流式、无全局开关、社区广泛批评)—— Kimi 有机会做得比它好
- **桌面 App 用 Electron**(为跨平台);Kimi 用 **Tauri** 在内存/启动上可反超

#### 6.7.1 Codex 桌面 App 设计点 × Kimi 可实现性(48 项,7 类)

> **本表只判断"能不能实现",不含取舍**。优先级标注仅为粗排序,最终取舍见 6.7.2 三层判断,实施清单见 6.7.5。

**图例**:
- Kimi 协议:🟢 现成支持 | 🟡 部分支持需补 | 🔴 不支持需造轮子 | ➖ 不依赖
- Tauri:✅ 原生/插件 | ⚠️ 需 Rust 侧开发
- 优先级:**P0** 高频核心 | **P1** 体验提升 | **P2** 锦上添花
- 超越点:⭐ 表示 Kimi 可做得比 Codex 桌面 App 更好
- 工作量:**S** 小 | **M** 中 | **L** 大

##### A. 思考链路展示(你的核心需求,看 AI 推理对不对)

> **Codex 桌面 App 在思考展示上其实很弱**:默认折叠成单行摘要、不实时流式、无全局展开开关、无长思考导航(社区广泛批评 #10472/#10723/#16415/#22334)。Kimi 的 `thinking.delta` 协议天生支持流式,**有机会做得比 Codex 桌面 App 好**。

| # | Codex 桌面 App 设计点 | Kimi 协议 | Tauri | 优先级 | 量 | 备注 |
|---|---------------------|---------|-------|-------|---|------|
| A1 | 思考块**内联在对话流**,收拢在"Working"区段内,与正文/命令/工具调用按时间线混排 | 🟢 `thinking`/`turn.*` 事件 | ➖ | P0 | M | 抄骨架 |
| A2 | 思考**默认折叠成单行摘要**(类似 "Thought for Ns"),点击 disclosure 展开 | 🟢 `thinking.close` 后 UI 折叠 | ➖ | P0 | S | 抄交互 |
| A3 | ⭐ **思考实时流式**(thinking.delta) | 🟢 协议现成 | ➖ | P0 | M | **桌面 App 没有,只有 CLI 有 Ctrl-T**;Kimi 抢先做即超越 |
| A4 | ⭐ **"是否显示思考"全局开关**(展开全部 / 隐藏全部) | 🟢 纯 UI | ➖ | P0 | S | 桌面 App 社区在求(#10472),没做;Kimi 补上即超越 |
| A5 | ⭐ **长思考导航**(搜索/大纲/虚拟滚动) | 🟢 纯 UI | ➖ | P1 | M | 桌面 App 没有;Kimi 可做 |
| A6 | **reasoning effort 档位**(composer 下方下拉,Light/Medium/...,底层 none/minimal/low/medium/high/xhigh) | 🟡 daemon 是否支持 effort 参数待验证 | ➖ | P1 | M | UI 位置直接抄 |
| A7 | Esc 中断当前 turn,中断后思考块按已结束折叠 | 🟢 `turn.cancel` | ➖ | P0 | S | 注意规避 CJK 输入法误触 Esc(#20767) |
| A8 | 多段思考按 Turn 内时间线内联(无全局时间线/Tab) | 🟢 `turn.*` 天然分轮 | ➖ | P1 | S | 抄 |

##### B. Steer + 任务队列(你的核心需求,运行中插话/排队)

> **桌面 App 确认有 steer/queue 双模**(Tab 排队下一轮 / Enter 注入当前轮 steer),Settings 可切默认。Kimi 有 `/prompts:steer` 独有端点,协议层天然支持。

| # | Codex 桌面 App 设计点 | Kimi 协议 | Tauri | 优先级 | 量 | 备注 |
|---|---------------------|---------|-------|-------|---|------|
| B1 | **运行态 steer/queue 双模**(Tab 排队 / Enter steer,Settings 切默认) | 🟢 `prompts:steer` + `prompts` | ➖ | P0 | M | 协议天生支持,见 6.6 |
| B2 | 任务队列可见化(数量/顺序/内容)+ 重排 | 🟢 `QueuedPromptView` + 客户端补重排 | ➖ | P0 | M | 见 6.6 |
| B3 | steer vs queue 模式 UI 区分 | 🟢 协议支持两动作 | ➖ | P0 | S | 见 6.6 |
| B4 | ⭐ **steer 后清晰反馈** | 🟢 协议可加状态反馈 | ➖ | P0 | S | 超越点 |

##### C. 多 Agent 并行(桌面 App 灵魂,比 CLI 重要得多)

> **桌面 App 核心 = 多 Thread + Git Worktree 隔离 + Pets 状态指示器 + 父子 Subagent**。这是第 1 轮我没当重点的,实际是桌面 App 最大卖点。

| # | Codex 桌面 App 设计点 | Kimi 协议 | Tauri | 优先级 | 量 | 备注 |
|---|---------------------|---------|-------|-------|---|------|
| C1 | **多 Thread 并行 + 卡片化侧边栏**(每 agent 一张卡,显示标题/状态/所属 project) | 🟢 `subagent.spawned/started/completed/failed/suspended` + `task.*` | ✅ | P0 | L | 协议零改动可直接落地 |
| C2 | **Project 作为顶层分组**(thread 归属 project,共享文件/instructions) | 🟢 `/workspaces` 对应 project | ✅ 侧边栏树 | P0 | M | 复用 workspaces |
| C3 | **侧边栏 Pinned + 状态过滤 + 搜索** | 🟢 `/sessions` + 状态过滤 | ✅ | P1 | M | 易实现 |
| C4 | **线程自动标题生成** | 🟡 `task.created` 时触发 LLM 生成 | ✅ | P1 | S | 低成本高体验 |
| C5 | ~~Pets 像素宠物状态指示器~~ | 🟢 状态由 `subagent.*`+`task.*` 推导 | ⚠️ 需透明置顶窗口 | **不做** | L | **用户已砍**(没必要);状态指示改用 C9 失败高亮 + Dock badge 替代 |
| C6 | **父子 Subagent 可视化**(父 spawn 子,子用父工具,结果汇总) | 🟢 `subagent.spawned` 由父触发 | ✅ UI 父子树 | P0 | M | Kimi 协议比 Codex 更原生 |
| C7 | **macOS 系统通知**(Needs input / Ready 触发) | 🟢 `subagent.suspended`/`completed` 映射 | ✅ `tauri-plugin-notification` | P0 | S | 低成本必做 |
| C8 | **Git Worktree 隔离并行 agent**(防多 agent 互改代码) | 🟡 需 Kimi 在 session 加 worktree 语义 | ✅ Rust 调 `git worktree` | P1 | L | 多 agent 必备 |
| C9 | **失败 agent 置顶/红色高亮** | 🟢 `subagent.failed` 事件 | ✅ | P1 | S | |
| C10 | **Auto-reviewer 自动评审**(独立 reviewer agent,99% 自动批准) | 🟡 需扩展 review 状态机 | ✅ | P2 | L | 工程复杂,二期 |

##### D. 输入框(Composer)

| # | Codex 桌面 App 设计点 | Kimi 协议 | Tauri | 优先级 | 量 | 备注 |
|---|---------------------|---------|-------|-------|---|------|
| D1 | Cmd+Enter 发送 + Shift+Enter 换行 | ➖ 纯 UI | ➖ | P0 | S | 桌面 App 原生支持(非超越点,纠正第 1 版错误) |
| D2 | **斜杠命令菜单**(`/feedback /goal /init /mcp /plan /review /status` + 自定义 .md) | 🟡 客户端实现 | ➖ | P1 | M | SlashMenu 已有,补命令 |
| D3 | **`@` 模糊文件搜索 attach** + `/auto-context` 自动喂最近文件 | 🟢 `/workspaces` 拿文件树 | ➖ | P1 | S | MentionMenu 已有 |
| D4 | **附件上传**(图片客户端压缩 + 文件) | 🟡 `/files` 端点 | ✅ | P1 | S | |
| D5 | **Appshots**(双 Cmd 截当前 App 窗口发 agent) | ➖ | ✅ OS 截屏 | P2 | M | 桌面 App 特色,选抄 |
| D6 | **Context Window 指示条**(70%/90% 变色) | 🟡 需 daemon token 用量 | ➖ | P1 | S | 配合 `/compact`(Kimi 已有,第①层);D6 是给 `/compact` 加可视化条 |
| D7 | **运行态输入框自适应**(steer/queue 模式切换提示) | 🟢 同 B1 | ➖ | P0 | S | 见 6.6 |

##### E. 审批流

| # | Codex 桌面 App 设计点 | Kimi 协议 | Tauri | 优先级 | 量 | 备注 |
|---|---------------------|---------|-------|-------|---|------|
| E1 | **对话流内联审批卡**(显示命令/patch mini diff) | 🟢 `permission.approval.*` + `fs:diff` | ➖ | P0 | S | ApprovalCard 已有,增强 |
| E2 | **单键快捷审批 y/n/p/a**(无需回车,#11762) | 🟢 事件直接映射 | ➖ | P0 | S | 注意防误触 |
| E3 | **三档权限**(read-only / ask 默认 / full-auto YOLO)+ `/permissions` 切换 | 🟡 是否有 set_mode 待验证 | ➖ | P1 | M | |
| E4 | **审批卡 mini diff 预览** | 🟢 `fs:diff` | ➖ | P1 | S | |
| E5 | Windows toast 通知带 Approve 按钮 | ➖ | ✅ | P2 | S | Mac 无原生,选抄 |

##### F. Diff 展示(注意:per-hunk 已被用户砍掉)

| # | Codex 桌面 App 设计点 | Kimi 协议 | Tauri | 优先级 | 量 | 备注 |
|---|---------------------|---------|-------|-------|---|------|
| F1 | **右侧 Review pane**(Cmd+Option+B 打开,持久 git-integrated 工作区) | 🟢 `fs:diff` + `fs:git_status` | ✅ | P1 | L | 桌面 App 杀手锏 |
| F2 | Unified diff + 语法高亮 | 🟢 Shiki 渲染 | ➖ | P0 | M | DiffLines 接 Shiki |
| F3 | 文件列表聚合(点文件名展开/折叠) | 🟢 `fs:git_status` | ➖ | P1 | S | DiffView 已有 |
| F4 | 大 diff 折叠("Large diff — one file at a time") | ➖ 纯 UI | ➖ | P1 | S | 性能必需 |
| F5 | ~~per-hunk stage/revert~~ | — | — | **不做** | — | **用户已确认砍掉**(整体重做姿势) |
| F6 | ⭐ **split 视图**(左右并排) | 🟢 纯 UI | ➖ | P2 | M | 桌面 App 没有(社区在求),Kimi 可反超 |
| F7 | ⭐ **词级 diff** | 🟢 纯 UI | ➖ | P2 | M | 桌面 App 没有,Kimi 可反超 |
| F8 | `/review` 独立 turn | 🟢 协议支持 | ➖ | P1 | M | 补 slash 命令 |

##### G. 系统集成与快捷键

| # | Codex 桌面 App 设计点 | Kimi 协议 | Tauri | 优先级 | 量 | 备注 |
|---|---------------------|---------|-------|-------|---|------|
| G1 | **全局快捷键 Cmd+Option+N Quick chat 唤起** | ➖ | ✅ `global-shortcut` | P0 | M | 高频入口 |
| G2 | **Cmd+K Command Palette**(不是 Cmd+Shift+P!纠正第 1 版错误) | ➖ 纯 UI | ➖ | P1 | M | |
| G3 | **Dock 集成**(Pet Docked 态 / 未读提示) | 🟢 事件驱动 | ✅ Dock badge | P1 | S | |
| G4 | **/side 临时分支会话**(从当前 thread fork,transcript 分离) | 🔴 需 session fork | ✅ | P2 | L | 桌面 App 特色 |
| G5 | **Background tasks / Automations** | 🟢 `background.task.*` | ✅ Rust 定时器 | P1 | M | ⭐ Kimi 可超越:daemon 常驻,Codex 必须开 App |
| G6 | **⭐ Electron → Tauri 反超**(更轻量、启动快、Rust 原生 git 集成) | — | ✅ | — | — | 架构层面优势 |

#### 6.7.2 三层判断:Codex 交互点 → 归入哪一层(取舍依据)

> 按 6.0 的三层框架,把 6.7.1 的 Codex 设计点逐个归类,明确"这是 UI 重做还是功能增量"。

**① 层 — Kimi 功能保留 + UI 按 Codex 重做**(功能不丢,交互重写):

| Kimi 功能 | 官方 UI 现状(要替换) | Codex 风格重做方向 | 归入 |
|----------|---------------------|------------------|------|
| 思考块(`ThinkingBlock`/`ThinkingPanel`) | 滚动窗 + teaser | 流式 + 折叠节奏 + 全局开关 | 6.2/6.7.1 A |
| steer(`Composer` Ctrl+S) | 隐式快捷键 + 无反馈 | 显式按钮 + 反馈 + 模式区分 | 6.6 |
| 任务队列(`QueuedPromptView`) | 只能取消/编辑 | 可见化 + 重排 + 模式区分 | 6.6 |
| diff(`DiffLines`) | 纯文本无高亮 | 语法高亮 + 词级 + 折叠 | 6.3 |
| 子代理(`SwarmTool`/`AgentDetailPanel`) | 列表式 | 卡片化 + 父子树 + 状态指示 | 6.4 |
| 审批卡(`ApprovalCard`) | 已内联但无单键 | 单键 y/n/p/a + mini diff | 6.7.1 E |
| TodoCard、ConversationToc、@提及、附件、slash 菜单 | 官方已有 UI | 按 Codex 风格重做 UI(功能不丢) | 不单列 |

**② 层 — Codex 类似功能,Kimi 也有 → UI 重做**(不是"要不要做",是"按 Codex 重做交互"):

| Codex 交互形态 | Kimi 官方 UI(要替换) | 重做方向 | 归入 |
|---------------|---------------------|---------|------|
| 多 Thread 卡片侧边栏 | Kimi 多 agent(列表式) | 重做卡片式 + 状态指示 | 6.7.1 C1/C2 |
| Project 顶层分组 | Kimi workspaces | 重做侧边栏树 | 6.7.1 C2 |
| 父子 Subagent 可视化 | Kimi subagent.* | 重做父子树 UI | 6.7.1 C6 |
| 右侧 Review pane | Kimi DiffView(流内) | 重做独立 Review pane | 6.7.1 F1 |
| effort 档位下拉 | Kimi 模型快切 | 抄 UI 位置 | 6.7.1 A6 |
| Context 指示条 + `/compact` | Kimi `/compact` 已有 | 重做可视化条 | 6.7.1 D6 |
| 命令面板 Cmd+K | Kimi SlashMenu | 重做 Cmd+K 全局入口 | 6.7.1 G2 |

**③ 层 — Codex 独有,看 server 支不支持**(Kimi 没有,要新加的):

| Codex 独有 | Kimi server 是否支持 | 决策 | 归入 |
|-----------|-------------------|------|------|
| 全局快捷键唤起(Cmd+Option+N) | ➖ 纯 Tauri | ✅ 加(P0) | 6.7.1 G1 |
| Appshots(截屏发 agent) | ➖ 纯 Tauri | ✅ 加(P2) | 6.7.1 D5 |
| `/side` 临时分支会话 | 🔴 需 session fork | 🟡 M0 验证后定 | 6.7.1 G4 |
| Pets 像素宠物 | ➖ 纯 UI | ❌ 已砍(用户决策) | — |
| per-hunk stage/revert | 🟢 fs 支持 | ❌ 已砍(用户姿势不匹配) | — |

**关键结论**:
- **6.7.1 的表是"能做性"判断,不含取舍**。取舍由本节三层归类决定
- **第①层零取舍**:Kimi 功能能力全部保留;但 UI 全部按 Codex 重做(见 6.2/6.3/6.4/6.6)
- **第②层无"要不要"问题**:Codex 类似功能 Kimi 都有,UI 也都按 Codex 重做
- **只有第③层有真正取舍**:Codex 独有的增量,按 server 支持度判要不要加

#### 6.7.3 ⭐ Kimi 可超越 Codex 桌面 App 的点(项目差异化亮点)

| 超越点 | 依据 | 优先级 |
|--------|------|-------|
| **思考实时流式** | 桌面 App 没有(只有 CLI 有 Ctrl-T),社区在求;Kimi `thinking.delta` 天生支持 | P0 |
| **"是否显示思考"全局开关** | 桌面 App 没有(#10472/#10723 活跃请求);Kimi 纯 UI 即可 | P0 |
| **steer 显式化 + 反馈** | Codex 用 Tab/Enter 隐式,Kimi 有 `/prompts:steer` 独有端点 | P0 |
| **长思考导航**(搜索/大纲/虚拟滚动) | 桌面 App 没有,Kimi 纯 UI 可做 | P1 |
| **Tauri 比 Electron 更轻** | 桌面 App 用 Electron(重);Kimi 用 Tauri(内存/启动/原生 git) | 架构优势 |
| **Background task 不依赖 App 开着** | Codex 本地 automations 必须 App 开着;Kimi daemon 常驻天然解决 | P1 |
| **多线程原生 + 协议开放** | Codex 是闭源一体化;Kimi 协议开放,subagent.* 事件天生支撑 | P0 |
| **split diff / 词级 diff** | 桌面 App 没有(社区在求),Kimi 可做 | P2 |
| **线程时间分组/置顶/搜索** | 桌面 App 只有 project 分组,社区在求更多组织方式 | P1 |

#### 6.7.4 待验证的 Kimi 协议盲点(M0 阶段优先验证)

| 盲点 | 影响的设计点 | 验证方式 |
|------|------------|---------|
| daemon 是否支持 reasoning `effort` 参数 | A6 effort 档位 | 读 client.ts + 抓 turn payload |
| `permission.set_mode` 端点是否存在 | E3 三档权限切换 | 抓 daemon 路由 |
| client 能否主动触发 `context.spliced`(compact) | D6 Context 指示 + `/compact` | 读 client.ts |
| `turn.completed` 的 usage 字段完整性 | D6 token 用量 | 抓事件 payload |
| session fork 端点是否存在 | G4 /side 临时分支 | 抓 daemon 路由 |
| Git Worktree 操作端点 | C8 多 agent 隔离 | 抓 daemon 路由 |

#### 6.7.5 实施清单(按 6.0 三层框架重排)

> **不再按"独有/非独有"分**,而是按 6.0 的三层框架。**关键区分:功能(第①层)全保留,交互(第②层)全重做**。

**第①层 — 功能集(全保留,验收底线,不讨论优先级)**:
- **功能 = 做什么**,由协议层 + slash 系统 + markstream 保证:
  - 全部 15 个 slash 命令(`/auto` `/btw` `/clear` `/compact` `/export` `/fork` `/goal` `/login` `/new` `/plan` `/status` `/swarm` `/thinking` `/undo` `/yolo`)—— `lib/slashCommands.ts` 直接用
  - TodoCard、ConversationToc、DiffView、多 agent、@提及、附件、审批、思考块等功能能力 —— 由协议层 `api/daemon/*` 事件驱动
- **验收标准**:M0 完成 = 这些功能的能力都跑通(用官方 UI 验证),丢了任何一个都是 bug
- **注意**:功能能力保留 ≠ 官方 UI 保留。UI 随后按 Codex 重做(第②层),但功能能力不能丢

**第②层 — 交互层(全重做,我们的主体工作,P0/P1/P2)**:

> 所有项都是在 `components/codex/` 下重写 Codex 风格组件,不是改官方组件。

| 优先级 | 重做项 | 对应 Codex 设计点 | 归属 |
|-------|-------|-----------------|------|
| **P0** | 对话流主框架(思考/正文/工具/审批内联混排) | A1 | 6.2 |
| **P0** | 思考实时流式 + 全局开关 + Esc 中断 | A2/A3/A4/A7 | 6.2 |
| **P0** | steer 显式化 + 反馈 + 模式区分 | B1/B3/B4 | 6.6 |
| **P0** | 队列可见化 + 重排 | B2 | 6.6 |
| **P0** | 多 Thread 卡片 + Project 分组 + 父子 Subagent + 系统通知 | C1/C2/C6/C7 | 6.7.1 C |
| **P0** | 审批单键 y/n/p/a + 内联卡 | E1/E2 | 6.7.1 E |
| **P0** | diff 语法高亮 + 折叠 | F2/F4 | 6.3/6.7.1 F |
| **P0** | Composer 重做(steer/queue 显式 + Cmd+Enter + 运行态自适应) | D1/D7 | 6.6 |
| P1 | 思考长文导航 / effort 档位 / 多段思考时间线 | A5/A6/A8 | 6.7.1 A |
| P1 | 侧边栏 Pinned/过滤/搜索 / 自动标题 / 失败高亮 | C3/C4/C9 | 6.7.1 C |
| P1 | Git Worktree 隔离 | C8 | 6.7.1 C |
| P1 | 斜杠命令菜单补全 / @模糊搜索 / 附件压缩 | D2/D3/D4 | 6.7.1 D |
| P1 | Context 指示条 + `/compact` 可视化 | D6 | 6.7.1 D |
| P1 | 三档权限 / 审批 mini diff | E3/E4 | 6.7.1 E |
| P1 | Review pane / 文件聚合 / `/review` | F1/F3/F8 | 6.7.1 F |
| P1 | 命令面板 Cmd+K / Dock / cron 自动化 | G2/G3/G5 | 6.7.1 G |
| P2 | split diff / 词级 diff | F6/F7 | 6.3/6.7.1 F |

**第③层 — Codex 独有增量(按 server 支持度)**:

| 优先级 | 增量 | server 支持度 | 决策 |
|-------|------|-------------|------|
| **P0** | 全局快捷键唤起(Cmd+Option+N) | ➖ 纯 Tauri | ✅ 加 |
| P2 | Appshots(截屏发 agent) | ➖ 纯 Tauri | ✅ 加 |
| P2 | `/side` 临时分支会话 | 🔴 需 session fork | 🟡 M0 验证后定 |
| P2 | Windows toast 带 Approve | ➖ 纯 Tauri | ✅ 加 |
| ❌ | Pets 像素宠物 | ➖ 纯 UI | 不做(用户决策) |
| ❌ | per-hunk stage/revert | 🟢 fs 支持 | 不做(用户姿势不匹配) |
| ❌ | Auto-review 自动评审 | 🟡 需扩展状态机 | 不做(直接 yolo) |

**关键结论**:
- **第①层是验收底线**:fork 官方 web 必须 100% 跑通所有功能,这是 M0 的硬指标
- **第②层是主体工作**:所有"P0/P1/P2"都针对交互重构,Kimi 功能改不改、怎么改
- **第③层是增量**:只有 Codex 独有且 Kimi 没的,才按 server 支持度判要不要加

---

## 7. 架构纪律(防止代码腐烂)

> **框架修正**:上一版基于"小改官方组件"思路,已作废。新框架下 UI 按 Codex 重做,架构纪律的核心是**分层隔离**:fork 来的协议层不动,我们的 Codex 风格 UI 独立成层,互不污染。

### 7.1 三层文件边界

| 层 | 位置 | 红线 | 理由 |
|----|------|------|------|
| 🔒 **协议层**(fork 资产) | `web/src/api/daemon/*`、`web/src/lib/slashCommands.ts` | **任何修改必须先讨论** | git merge 跟随官方升级的命脉,实证纯 TS 零 Vue 依赖 |
| 🟡 **逻辑层**(fork 资产,部分 Vue 化) | `web/src/composables/*`(22 文件,19 个用 Vue) | 改前在 `PATCHES.md` 记原因 | 逻辑可参考,响应式要按新 UI 重写。**优先新增独立 composable,不在官方文件里改** |
| 🟢 **UI 层**(我们重做) | `web/src/components/codex/*`(新增目录) | 自由,保持单一职责 | 按 Codex 重做,官方 `components/**/*.vue` 只作功能参考,不直接改 |

### 7.2 新 UI 独立成层,不混进官方组件目录

**错误做法**(旧版思路,已作废):在官方 `DiffLines.vue` 里加 `<DiffEnhancer>` 调用点 → 暗示官方组件是主体,我们小改。这跟"UI 按 Codex 重做"矛盾。

**正确做法**(新框架):我们的 UI 放在独立目录,官方组件目录基本只读(只读代码理解功能,不改代码)。

```
web/src/
├── api/daemon/              ← 🔒 fork 资产,不动
├── lib/slashCommands.ts     ← 🔒 fork 资产,不动
├── composables/             ← 🟡 fork 资产,只读参考;新增放 composables/codex/
├── components/
│   ├── chat/                ← 官方组件,只读参考(理解功能做什么)
│   └── codex/               ← 🟢 新增,我们按 Codex 重做的 UI
│       ├── ConversationPane.vue    ← Codex 风格对话流
│       ├── Composer.vue            ← Codex 风格输入框(steer/queue 显式化)
│       ├── ThinkingBlock.vue       ← Codex 风格思考折叠 + 流式
│       ├── DiffView.vue            ← Codex 风格 diff(高亮/Review pane)
│       ├── ApprovalCard.vue        ← Codex 风格审批(单键 y/n/p/a)
│       ├── ThreadSidebar.vue       ← Codex 风格多 agent 卡片侧栏
│       └── ...
└── composables/codex/       ← 🟢 新增,我们的交互逻辑(状态机、快捷键等)
```

**为什么这样分**:官方升级时,`api/daemon/` 和 `lib/` 自动 git merge 拿到协议更新;我们的 `components/codex/` 完全独立,不受官方 UI 改动影响,也不会污染 fork 的 merge 路径。

### 7.3 架构看门狗(每次提交前自查)

1. **协议层动了没?** → 动了必须回退或特批(`api/daemon/`、`lib/slashCommands.ts`)
2. **新 UI 在独立目录吗?** → 不在 `components/codex/` 要重构,别混进官方 `components/chat/`
3. **官方组件目录改了吗?** → 改了要在 `PATCHES.md` 记原因(原则上不改,只读参考)
4. **功能有没有丢?** → 对照 6.0.1,Kimi 任何一个功能不能丢,丢了是 bug

每个改造完成后主动汇报这四项检查结果。

---

## 8. 资产复用(分两类)

### 8.1 从 kimi-ui(旧项目)复用

| kimi-ui 资产 | 决定 | 理由 |
|-------------|------|------|
| `connect_daemon` / token 读取 / `find_kimi` / `kimi_home` | ✅ 复用 | 协议层无关,纯基础 |
| Tauri 窗口装饰代码 | ⚠️ 复用骨架,重做样式 | Codex 视觉更克制 |
| 打包/签名/LaunchAgent | ✅ 复用 | 系统集成无关 |
| `INIT_SCRIPT`(MutationObserver 补丁) | ❌ 丢弃 | UI 重做后不需要(核心收益) |
| `status.html` 状态栏 | ❌ 不用 | 重做 |
| PTY 额度抓屏 | ❌ 不用 | 这是 kimi-ui 时代 hack |
| 蜂群面板 | ❌ 不用 | 重做 |

### 8.2 从官方 kimi-web fork 复用

| 官方资产 | 决定 | 理由(代码实证) |
|---------|------|---------------|
| `api/daemon/*`(协议层) | ✅ **直接用,不动** | 纯 TS 零 Vue,git merge 命脉 |
| `lib/slashCommands.ts` | ✅ **直接用,不动** | 纯 TS,文件头注释明说 "no Vue" |
| `markstream-vue`(npm) | ✅ 直接用 | Vue 专属,流式 markdown,锁定 Vue 选型 |
| `composables/*`(逻辑层) | 🟡 **只读参考** | 19/22 Vue 化,响应式按新 UI 重写 |
| `components/**/*.vue`(UI 层) | 🟡 **只读参考** | 理解功能做什么,交互按 Codex 重做 |

**原则**:fork 真正值钱的是前三行(协议层 + slash + markstream),这三块共同锁定 Vue 选型。UI 组件不复用代码,只参考功能。

---

## 9. 里程碑(粗略,实施计划阶段细化;共 6 个 M0–M5)

> 基于第 2 轮调研(对标 Codex 桌面 App),里程碑重新排序:思考展示/steer/多 agent 是桌面 App 的三大灵魂,优先做。

1. **M0 项目骨架 + 协议验证**:`kimi-gui` 初始化,Tauri 壳搭起来,vendor `apps/kimi-web`,**先跑通官方 UI**(作为协议验证基座,确认 daemon 连接/slash/markstream 全通);**验证 6.7.4 的 6 个协议盲点**(effort/set_mode/compact/usage/fork/worktree);用户实际跑 agent 任务反馈痛点。**注意:M0 交付的官方 UI 不是最终产品,只是协议验证,UI 随后按 Codex 重做**
2. **M1 基础丝滑 + 系统集成**:全局快捷键唤起(G1)、系统通知(C7)、Dock 集成(G3)、滚动爬屏修复、丢弃 MutationObserver
3. **M2 思考 + steer 改造**(桌面 App 弱项,Kimi 超越点):思考实时流式 + 全局开关(A3/A4)、steer 显式化 + 队列可见(B1-B4,见 6.6)
4. **M3 多 agent 并行**(桌面 App 灵魂):多 Thread 卡片 + Project 分组 + 父子 Subagent 可视化(C1/C2/C6)、失败 agent 置顶高亮(C9)
5. **M4 审批 + diff + 输入**:单键审批(E1/E2)、diff 语法高亮(F2)、Cmd+K 命令面板(G2)、斜杠命令(D2)、@提及增强(D3)
6. **M5 视觉打磨 + P2**:向 Codex 视觉克制靠拢、split/词级 diff(F6/F7)、Appshots(D5)

---

## 10. 风险与未决项

| 风险 | 应对 |
|------|------|
| diff/子代理打磨点选错(如 per-hunk 教训) | **M0 跑起来后让用户看实物反馈,再定具体打磨点**,不预设 |
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
