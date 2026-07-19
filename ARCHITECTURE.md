# ARCHITECTURE.md —— kimi-gui 技术架构

> **必读**:本文档定义 kimi-gui 的代码架构。HANDOFF.md 定义分工,本文档定义**怎么写代码**。ZCode 和 kimi3 都必须遵守。动手前读完。
>
> **方法论**:架构不是发明,是**继承 + 最小偏离**。官方 Kimi web 的架构已被生产验证,我们 fork 后继承 90%,只在 UI 层做必要偏离。

---

## 0. 架构总览(一张图)

```
┌────────────────────────────────────────────────────────────────┐
│                    Tauri 2 Shell(Rust)                         │
│  daemon 启动 / token / 全局快捷键 / 托盘 / 通知 / 窗口管理       │
└──────────────────────────┬─────────────────────────────────────┘
                           │ Tauri API(window/shortcut/notification)
┌──────────────────────────▼─────────────────────────────────────┐
│                    Vue 3 Application                            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────┐       │
│  │  🔒 协议层(fork 官方,不动)                          │       │
│  │  web/src/api/daemon/*  (8 文件,纯 TS,零 Vue)        │       │
│  │  web/src/lib/slashCommands.ts (纯 TS)               │       │
│  └─────────────────────────────────────────────────────┘       │
│                          ↑ 只读调用                              │
│  ┌─────────────────────────────────────────────────────┐       │
│  │  🟡 状态层(继承官方 + 扩展)                          │       │
│  │  web/src/composables/useKimiWebClient.ts (3024 行)   │       │
│  │   ↳ 唯一能 import api/* 的地方                       │       │
│  │   ↳ 8 个子 composable 在 composables/client/         │       │
│  │  web/src/composables/codex/useUIState.ts 等(新增)   │       │
│  │   ↳ 我们的 UI 状态(右栏/侧边任务/模式/快捷键)       │       │
│  └─────────────────────────────────────────────────────┘       │
│                          ↑ props / provide                       │
│  ┌─────────────────────────────────────────────────────┐       │
│  │  🟢 视觉层(按 Codex 风格重做)                       │       │
│  │  web/src/components/codex/*.vue                      │       │
│  │   ↳ template + style 来自 prototype/                │       │
│  │   ↳ 数据从 props / inject 拿,不直接调 API          │       │
│  │  web/src/styles/*  (token + 全局样式)                │       │
│  └─────────────────────────────────────────────────────┘       │
└────────────────────────────────────────────────────────────────┘
```

**铁律**:
- 🔒 协议层**绝不改**(git merge 命脉)
- 🟡 状态层**唯一**能 import `api/*`;组件**不能**直接 import `api/*`
- 🟢 视觉层组件**不碰协议层**;数据走 props 或 inject

---

## 1. 完整目录结构(文件级)

```
kimi-gui/
├── src-tauri/                              Rust 壳(ZCode 负责)
│   ├── src/
│   │   ├── main.rs                         入口 + tauri::Builder 装配
│   │   ├── daemon.rs                       connect_daemon / kimi_home / find_kimi(复用 kimi-ui)
│   │   ├── window.rs                       窗口管理(单窗/多窗/全局快捷键唤起)
│   │   ├── shortcut.rs                     全局快捷键(⌘⌥N 唤起 / ⌘K 等)
│   │   └── tray.rs                         托盘 + Dock badge
│   ├── Cargo.toml                          tauri 2 + tauri-plugin-notification
│   ├── tauri.conf.json                     窗口配置 / bundle id / 协议白名单
│   └── capabilities/default.json           权限声明
│
├── web/                                    Vue 应用(fork 自 apps/kimi-web)
│   ├── src/
│   │   ├── api/                            🔒 fork 官方,不动
│   │   │   └── daemon/
│   │   │       ├── client.ts               1562 行,REST + WS 客户端
│   │   │       ├── ws.ts                    556 行,WebSocket 管理
│   │   │       ├── http.ts                  555 行,fetch 封装
│   │   │       ├── wire.ts                  875 行,协议类型
│   │   │       ├── eventReducer.ts          816 行,事件 → state
│   │   │       ├── agentEventProjector.ts  1576 行,32 事件 → snapshot
│   │   │       ├── mappers.ts               wire → app 类型映射
│   │   │       └── serverAuth.ts            token / auth
│   │   │
│   │   ├── lib/                            🔒 fork 官方,不动
│   │   │   ├── slashCommands.ts            内置命令元数据(15 条)
│   │   │   ├── workspaceOrder.ts           工作区排序
│   │   │   └── ...                         其他纯 TS 工具
│   │   │
│   │   ├── types.ts                        🔒 fork 官方,373 行,协议层的 App 类型
│   │   ├── i18n/                           🔒 fork 官方(zh/en locale)
│   │   ├── debug/                          🔒 fork 官方(trace 工具)
│   │   │
│   │   ├── composables/                    🟡 继承官方 + 扩展
│   │   │   ├── useKimiWebClient.ts         🔒 fork 官方,3024 行,状态层核心
│   │   │   ├── client/                     🔒 fork 官方,8 个子 composable
│   │   │   │   ├── useAppearance.ts
│   │   │   │   ├── useWorkspaceState.ts
│   │   │   │   ├── useModelProviderState.ts
│   │   │   │   ├── useNotification.ts
│   │   │   │   ├── useSideChat.ts
│   │   │   │   ├── useTaskPoller.ts
│   │   │   │   ├── useSoundNotification.ts
│   │   │   │   └── eventBatcher.ts         (Q4 流式节奏复用它,不新写)
│   │   │   ├── useConfirmDialog.ts         🔒 fork 官方
│   │   │   ├── useAuthGate.ts              🔒 fork 官方
│   │   │   ├── useSlashMenu.ts             🟡 fork 官方(参考逻辑,扩展 Skills 动态拉取)
│   │   │   ├── useMentionMenu.ts           🟡 fork 官方
│   │   │   └── codex/                      🟢 新增,UI 状态(ZCode 写)
│   │   │       ├── useUIState.ts           右栏/侧边任务/Review pane(独立布尔,共存制 Q5)
│   │   │       ├── useHotkeys.ts           全局快捷键注册表(组件级处理函数由 kimi3 注册)
│   │   │       ├── useComposerMode.ts      steer/queue 意图方法:queue() / steer() / 队列操作
│   │   │       ├── useThinkingToggle.ts    思考全局开关状态
│   │   │       ├── useContextMeter.ts      token 用量环(读 client.snapshot)
│   │   │       └── useModelPicker.ts       模型/思考深度(读 client.models,持久化)
│   │   │
│   │   ├── components/
│   │   │   ├── chat/                       🔒 fork 官方,只读参考(不直接用)
│   │   │   ├── ui/                         🔒 fork 官方通用组件(Button/Icon/Tooltip)
│   │   │   └── codex/                      🟢 新增,我们的 UI(kimi3 负责)
│   │   │       ├── AppShell.vue            两栏布局骨架
│   │   │       ├── layout/
│   │   │       │   ├── SideTask.vue        真分栏容器(props + 默认 slot,⌥⌘S)
│   │   │       │   ├── ThreadMenu.vue      标题 ⋯ 任务菜单
│   │   │       │   ├── FileMenu.vue        文件右键菜单(IDE 打开/复制路径/自动换行)
│   │   │       │   └── Toast.vue           轻提示(全局单例)
│   │   │       ├── sidebar/
│   │   │       │   ├── Sidebar.vue
│   │   │       │   ├── WorkspaceGroup.vue
│   │   │       │   ├── ThreadRow.vue
│   │   │       │   └── StatusFilter.vue
│   │   │       ├── chat/
│   │   │       │   ├── ConversationPane.vue  渲染 ChatTurn[].blocks(有序)
│   │   │       │   ├── MessageUser.vue
│   │   │       │   ├── MessageAssistant.vue
│   │   │       │   ├── ThinkingBlock.vue
│   │   │       │   ├── TodoCard.vue
│   │   │       │   ├── TurnProgress.vue    轮次进度条(第 N/M 步 + 文件改动)
│   │   │       │   └── ToolCallCard.vue
│   │   │       ├── composer/
│   │   │       │   ├── Composer.vue
│   │   │       │   ├── ComposerModes.vue
│   │   │       │   ├── QueuePanel.vue
│   │   │       │   ├── SlashMenu.vue
│   │   │       │   ├── MentionMenu.vue
│   │   │       │   ├── ModelPicker.vue     弹层簇,全独立 ↓
│   │   │       │   ├── PermPicker.vue
│   │   │       │   ├── ModePicker.vue
│   │   │       │   └── ContextMeter.vue
│   │   │       ├── approval/
│   │   │       │   └── ApprovalCard.vue    支持 shell/diff/plan 等 kind;深组件,inject client 调 action
│   │   │       ├── diff/
│   │   │       │   ├── DiffView.vue
│   │   │       │   ├── DiffLines.vue
│   │   │       │   └── ReviewPane.vue
│   │   │       ├── detail/
│   │   │       │   └── DetailPane.vue      Inspect 右栏,4 tab
│   │   │       ├── agents/
│   │   │       │   ├── AgentPanel.vue      子智能体面板(已开启/完成历史)
│   │   │       │   ├── SubagentCard.vue
│   │   │       │   └── AgentTranscript.vue transcript 内容组件(放进 SideTask slot)
│   │   │       └── settings/
│   │   │           └── SettingsPage.vue
│   │   │
│   │   ├── styles/                         🟢 kimi3 负责(10 文件,对应 prototype v2)
│   │   │   ├── tokens.css                  设计 token(浅色 :root + 深色 [data-theme="dark"] 块)
│   │   │   ├── base.css                    重置 + 骨架 + 滚动条 + 通用组件 + 菜单/toast
│   │   │   ├── sidebar.css                 左栏
│   │   │   ├── conversation.css            对话流 + TodoCard + TurnProgress + 子Agent卡/面板
│   │   │   ├── thinking.css                思考折叠/流式/全局开关
│   │   │   ├── composer.css                Composer + 弹层簇 + 队列 + 补全浮层
│   │   │   ├── approval.css                审批卡
│   │   │   ├── diff.css                    Diff + Review pane
│   │   │   ├── detail.css                  Inspect 右栏
│   │   │   └── settings.css                设置页
│   │   │
│   │   ├── App.vue                         🟡 根组件(装配 client + provide)
│   │   ├── main.ts                         🟡 入口(createApp + i18n)
│   │   └── vue-shim.d.ts                   Vue TS 声明
│   │
│   ├── public/                             静态资源
│   ├── index.html                          入口 HTML
│   ├── vite.config.ts                      🟡 ZCode(去 dev proxy,对接 Tauri)
│   ├── tsconfig.json
│   └── package.json                        🟡 ZCode(依赖管理)
│
├── prototype/                              视觉契约(kimi3 v2,只读参考)
│   ├── *.html                              7 个场景
│   ├── styles/*.css                        10 个 CSS(kimi3 搬到 web/src/styles/)
│   └── mock/shared.js                      交互逻辑(kimi3 搬到 components/codex/)
│
├── docs/
│   └── superpowers/specs/
│       └── 2026-07-18-kimi-gui-design.md   设计文档(权威)
│
├── .upstream/                              fork 同步(ZCode)
│   ├── sync.sh                             pull apps/kimi-web 更新
│   └── PATCHES.md                          改过的官方文件清单
│
├── HANDOFF.md                              协作交接
├── ARCHITECTURE.md                         本文档
├── package.json                            根(管理 Tauri + web 协作)
└── README.md
```

**关键约定**:
- 🔒 = fork 官方,**不改**(改了记 PATCHES.md)
- 🟡 = fork 官方,**改造**(记 PATCHES.md)
- 🟢 = **新增**(我们的代码)

---

## 2. 数据流(单向)

```
                  ┌─────────────────────┐
                  │   Kimi daemon       │
                  │   127.0.0.1:58627   │
                  └──────────┬──────────┘
                             │
                  REST(POST/GET) + WebSocket(32 事件)
                             │
                  ┌──────────▼──────────┐
                  │  api/daemon/*       │  🔒 不动
                  │  (纯 TS,零 Vue)    │
                  └──────────┬──────────┘
                             │
                             │  唯一调用方
                  ┌──────────▼──────────┐
                  │  useKimiWebClient   │  🟡 状态层核心
                  │  (composables/)     │
                  │                     │
                  │  ref<Snapshot>      │  ← agentEventProjector 投影
                  │  ref<Session[]>     │
                  │  ref<Workspace[]>   │
                  │  ref<Model[]>       │
                  │  ref<Skill[]>       │
                  │  ...                │
                  └──────────┬──────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
        provide('client')  props         inject('client')
              │              │              │
    ┌─────────▼─────┐  ┌────▼─────┐  ┌──────▼──────┐
    │ AppShell.vue  │  │ 子组件   │  │ DetailPane  │
    │ (顶层消费)    │  │ (props)  │  │ (inject)    │
    └───────────────┘  └──────────┘  └─────────────┘
```

**铁律**:
- 数据从 daemon → api → useKimiWebClient → 组件,**单向**
- 组件**不能**反向调 api(只能调 client 的 action,action 内部调 api)
- 状态变更是 client 的责任,组件只读

---

## 3. 状态管理选型(决策)

### 决策:**纯 composables,不用 Pinia**

**理由**(已和用户讨论确认):
1. **跟随官方**:官方 Kimi web 就是纯 composables(`useKimiWebClient.ts` + 8 个子 composable),我们继承
2. **fork merge 命脉**:用 Pinia = 偏离官方 = 持续手工 port 官方 composables 改动,违背"跟随官方升级"硬约束
3. **规模够用**:本项目全局状态约 10-15 切片,composables 完全 hold 得住
4. **Devtools 缺失用 console.trace 弥补**:开发期在 `useKimiWebClient` 的事件流加 trace,比 Pinia Devtools 还精细

### 实现约定

```ts
// composables/codex/useUIState.ts —— 模块级单例模式
import { ref } from 'vue';

// 模块作用域 = 单例(所有组件 import 拿到同一个 ref)
// 独立布尔 = 共存制(Q5 结论):SideTask 真分栏,DetailPane/ReviewPane 更高
// z-index 覆盖其上,Esc 分层关闭(先关最上层覆盖物,再关分栏)
const detailPaneOpen = ref(false);
const detailPaneTab = ref<'thread' | 'thinking' | 'tools' | 'tasks'>('thread');
const sideTaskOpen = ref(false);
const reviewPaneOpen = ref(false);

export function useUIState() {
  return {
    detailPaneOpen,         // ref<boolean>
    detailPaneTab,
    sideTaskOpen,
    reviewPaneOpen,
    openDetail(tab?: string) { /* ... */ },
    closeDetail() { /* ... */ },
    // ...
  };
}
```

**约束**:
- 所有跨组件状态用**模块级 ref 单例**(像上面这样)
- 组件**不能**自己 `ref()` 一个全局状态,必须从 composable 拿
- composable 文件**只暴露 use 函数**,不直接 export ref(防止绕过 action 改)
- 全局快捷键:注册表在 `composables/codex/useHotkeys.ts`;**组件级处理函数由 kimi3 写并注册**(SlashMenu 的 ↑↓/Enter、审批卡的 y/a/n/p 等)

### client(协议状态)怎么给组件

`useKimiWebClient` 在 **App.vue 顶层调一次**,通过 `provide('client', client)` 注入:

```vue
<!-- App.vue -->
<script setup lang="ts">
import { provide } from 'vue';
import { useKimiWebClient } from './composables/useKimiWebClient';

const client = useKimiWebClient();
provide('client', client);
</script>

<template>
  <AppShell :client="client" />
</template>
```

```vue
<!-- 任意深层组件 -->
<script setup lang="ts">
import { inject } from 'vue';
const client = inject('client')!;  // 拿到同一个实例
const currentModel = computed(() => client.models.value.current);
</script>
```

**或** 通过 props 一层层传(官方做法,类型更清晰)。两种都允许,**优先 props,跨 3 层以上用 inject**。

---

## 4. 组件契约(每个组件的 props/emit)

> 这些是 ZCode 写的 `types/codex.ts` 里会定义的接口,kimi3 写组件时**必须按这些 props 接数据**,不能自己造字段。
>
> **动作路径约定**:深组件(嵌套 3 层以上,如 ApprovalCard)直接 `inject('client')` 调 action(`client.approve()` 等);**emit 只用于纯 UI 事件**(toggle / close / select-tab / select-item),不走 emit 链穿透。
>
> **消息模型**:直接用官方 `ChatTurn` / `TurnBlock`(`web/src/types.ts:226/243`,import type)。`TurnBlock = text | thinking | tool`,**按调用顺序排列**(官方注释:nothing is hoisted)。~~AppMessage~~ 名字作废。

### 4.1 AppShell.vue(根布局)

```ts
interface AppShellProps {
  client: KimiWebClient;  // 顶层 client 实例
}
// 不 emit,纯布局
```

### 4.2 sidebar/

```ts
// Sidebar.vue
interface SidebarProps {
  workspaces: Workspace[];        // ref<Workspace[]> 解包后传入
  currentWorkspaceId: string;
  sessions: Session[];            // 当前 workspace 的 sessions
  currentSessionId: string;
  filter: 'all' | 'running' | 'pending_approval';
}
interface SidebarEmits {
  (e: 'select-session', id: string): void;
  (e: 'new-task'): void;
  (e: 'set-filter', f: SidebarProps['filter']): void;
  (e: 'collapse'): void;
}

// WorkspaceGroup.vue
interface WorkspaceGroupProps {
  workspace: Workspace;
  sessions: Session[];
  currentSessionId: string;
  sortMode: 'recent' | 'manual' | 'created';
}

// ThreadRow.vue
interface ThreadRowProps {
  session: Session;
  active: boolean;
  status: 'idle' | 'running' | 'needs_input' | 'done' | 'failed';
}
interface ThreadRowEmits {
  (e: 'select'): void;
  (e: 'pin'): void;
  (e: 'archive'): void;
}
```

### 4.3 chat/

```ts
// ConversationPane.vue(对话流容器)
// 渲染 turns[].blocks —— 有序混合(text/thinking/tool 按调用序)
interface ConversationPaneProps {
  turns: ChatTurn[];               // 来自 client.snapshot
  todos: Todo[];                   // turn 级任务状态(TodoCard)
  turnProgress?: { current: number; total: number; additions: number; deletions: number };
  subagents: Subagent[];           // turn 级子 agent
  running: boolean;
}
// 注意:todo / subagents / turnProgress 是 turn 级状态,不进 blocks。
// 官方设计:subagent 在对话流里是 Agent 工具卡,live progress 走右侧 detail panel
// (types.ts:219-225 注释),我们的 AgentPanel/钻取遵循同一数据来源
interface ConversationPaneEmits {
  (e: 'cancel-turn'): void;
}

// ThinkingBlock.vue
interface ThinkingBlockProps {
  segments: ThinkingSegment[];     // 从所在 turn 的 blocks 过滤 kind:'thinking'
  streaming: boolean;              // 流式中
  globalShow: boolean;             // 全局思考开关(useThinkingToggle)
  steerMark?: { text: string; at: number };  // 用户引导标记
}
interface ThinkingBlockEmits {
  (e: 'toggle'): void;             // 折叠/展开
  (e: 'inspect'): void;            // 开右栏看全文
}

// TodoCard.vue(Kimi 独有)
interface TodoCardProps {
  todos: Todo[];                   // { title, status: 'pending'|'in_progress'|'done' }
}

// TurnProgress.vue(轮次进度条,对齐 Codex)
interface TurnProgressProps {
  current: number;                 // 第 N 步
  total: number;                   // 共 M 步
  additions: number;
  deletions: number;
}

// ToolCallCard.vue
interface ToolCallCardProps {
  call: ToolCall;                  // { name, args, output, status }
}
interface ToolCallCardEmits {
  (e: 'inspect'): void;            // 开右栏看完整输出
}
```

### 4.4 composer/

```ts
// Composer.vue
interface ComposerProps {
  running: boolean;
  mode: 'queue' | 'steer';         // 当前模式(运行态)
  permission: PermissionMode;      // 官方枚举 'manual' | 'auto' | 'yolo'(types.ts:373)
                                   // UI 标签映射:yolo → 「完全自主」(标签层,不进协议)
  modes: { plan: boolean; swarm: boolean; goal: boolean };  // 模式开关
  models: ModelInfo[];             // daemon 拉取,不写死
  currentModel: string;
  effort: 'Low' | 'High' | 'Max' | null;  // 档位待 M0 验证(spec 6.7.4)
  context: ContextInfo;            // { used, total, pct }
  quota: QuotaInfo;                // { q5h, q5hReset, qWeek, qWeekReset }
}
interface ComposerEmits {
  (e: 'send', text: string, mode: 'queue' | 'steer'): void;
  (e: 'set-mode', m: 'queue' | 'steer'): void;
  (e: 'toggle-mode', m: 'plan' | 'swarm' | 'goal'): void;   // 模式开关
  (e: 'cancel'): void;
  (e: 'set-model', id: string): void;
  (e: 'set-effort', e: 'Low' | 'High' | 'Max'): void;
  (e: 'set-permission', p: PermissionMode): void;
  (e: 'open-context-detail'): void;
}

// 弹层簇(全独立组件,各有各的弹层逻辑与持久化):
//   ModelPicker.vue  模型列表 + 思考深度 Low/High/Max
//   PermPicker.vue   权限三档(逐条确认/自动通过/完全自主=yolo)
//   ModePicker.vue   计划/Swarm/目标 开关行,激活态回显 pill 标签
//   ContextMeter.vue 用量环 + 详情卡(会话/模型/思考/权限/上下文/状态/额度)

// SlashMenu.vue(/ 触发)
interface SlashMenuProps {
  builtin: BuiltinCommand[];       // 15 条写死,来自 lib/slashCommands.ts
  skills: Skill[];                 // 动态,来自 /sessions/{id}/skills,标 isSkill
  query: string;                   // 当前过滤词(v-model 传入)
}
// cursorIndex 是组件内部 ref(kimi3 的键盘导航行为),不是 prop
interface SlashMenuEmits {
  (e: 'select', cmd: BuiltinCommand | Skill, args?: string): void;  // acceptsInput 留参,其余直接执行
  (e: 'close'): void;
}

// MentionMenu.vue(@ 触发,同骨架换数据源)
interface MentionMenuProps {
  files: FileEntry[];              // 来自 /workspaces/{id} 文件树
  query: string;
}
// cursorIndex 同样是内部 ref
interface MentionMenuEmits {
  (e: 'select', file: FileEntry): void;
  (e: 'close'): void;
}

// QueuePanel.vue
interface QueuePanelProps {
  queuedPrompts: QueuedPrompt[];
}
interface QueuePanelEmits {
  (e: 'reorder', from: number, to: number): void;
  (e: 'promote-to-steer', id: string): void;  // 队列转插话(引导)
  (e: 'edit', id: string): void;
  (e: 'remove', id: string): void;
}
```

### 4.5 approval/

```ts
// ApprovalCard.vue(支持 shell/diff/plan 等 kind)
interface ApprovalCardProps {
  kind: 'shell' | 'diff' | 'file' | 'fileop' | 'url' | 'search' | 'invocation' | 'todo' | 'plan_review' | 'generic';
  title: string;
  path?: string;                   // 文件路径
  command?: string;                // shell 命令
  diff?: DiffHunk[];               // diff kind 的改动
  plan?: string;                   // plan kind 的内容
  subagent?: string;               // 来自哪个子 agent
}
// 深组件:inject('client') 直接调 client.approve() / client.reject() 等;
// emit 只留纯 UI(展开反馈框等本地行为)
interface ApprovalCardEmits {
  (e: 'approve'): void;
  (e: 'approve-session'): void;
  (e: 'reject'): void;
  (e: 'feedback', text: string): void;
}
```

### 4.6 diff/ + detail/

```ts
// DiffView.vue
interface DiffViewProps {
  files: ChangedFile[];            // git_status
  hunks: DiffHunk[];               // 当前文件的 hunks
  syntaxHighlight: boolean;
}

// DetailPane.vue(Inspect 右栏,4 tab)
interface DetailPaneProps {
  open: boolean;
  tab: 'thread' | 'thinking' | 'tools' | 'tasks';
  threadInfo: ThreadMeta;
  thinkingFullText: string;
  toolCalls: ToolCall[];
  tasks: Todo[];
}
interface DetailPaneEmits {
  (e: 'set-tab', t: DetailPaneProps['tab']): void;
  (e: 'close'): void;
}
```

### 4.7 agents/

```ts
// AgentPanel.vue(子智能体管理面板:已开启/完成历史)
interface AgentPanelProps {
  active: Subagent[];
  completed: Subagent[];
}
interface AgentPanelEmits {
  (e: 'inspect', id: string): void;  // 钻取 transcript(SideTask 填入 AgentTranscript)
}

// SubagentCard.vue
interface SubagentCardProps {
  subagent: Subagent;              // { id, name, status, progress, summary }
}
interface SubagentCardEmits {
  (e: 'inspect'): void;            // 打开完整 transcript
}

// AgentTranscript.vue(子 agent transcript,SideTask slot 的内容组件,非独立分栏)
interface AgentTranscriptProps {
  subagentId: string;
  turns: ChatTurn[];
}
```

### 4.8 layout/

```ts
// SideTask.vue(真分栏容器,⌥⌘S;默认 slot 接内容)
interface SideTaskProps {
  title: string;
  status: { text: string; kind: 'accent' | 'success' | 'warning' };
  thread: { name: string; ws: string; dot: 'running' | 'waiting' | 'done' };
}
// 用法 1:侧边线程视图(任务菜单「打开侧边任务」)
// 用法 2:AgentTranscript 作为 slot 内容(子 agent 钻取)

// ThreadMenu.vue:标题 ⋯ 菜单(置顶 ⌥⌘P / 重命名 / 归档 / 打开侧边任务 ⌥⌘S /
//   复制 › / 在…中继续 › / 添加计划任务 / 新窗口打开)
// FileMenu.vue:diff 右键(在 IDE 打开 / 打开方式 › / 复制所选 / 复制路径 /
//   复制相对路径 / 切换自动换行)
// Toast.vue:轻提示,toast(text) 全局单例,自动消散
```

### 完整类型定义位置

所有上面的 interface 放在 **`web/src/types/codex.ts`**(ZCode 写)。fork 的官方类型在 `web/src/types.ts`(不动)。两者通过 `import type` 引用,不混。

---

## 5. 主题系统

### 5.1 token 定义

`web/src/styles/tokens.css` 直接搬 `prototype/styles/tokens.css`(kimi3 负责):
- 浅色:`:root { --bg: #ffffff; ... }`
- 深色:同文件内 `[data-theme="dark"] { ... }` 块(**不单独建 themes.css**)

### 5.2 主题切换

```ts
// composables/codex/useTheme.ts
export function useTheme() {
  const theme = ref<'light' | 'dark'>(localStorage.getItem('kimi-theme') || 'light');
  watch(theme, t => {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('kimi-theme', t);
  }, { immediate: true });
  return { theme, toggle: () => theme.value = theme.value === 'light' ? 'dark' : 'light' };
}
```

### 5.3 组件样式规则

- **全局样式为主**:`web/src/styles/` 下 10 个 CSS 文件(prototype v2 原样搬)承担绝大部分样式,组件 template 用 class 名引用
- **`<style scoped>` 只放组件独有的局部规则**(一次性微调/布局特例);通用样式一律回 `styles/*.css`
- **CSS 变量**:样式里只引用 `var(--xxx)`,**不写死 hex**(深浅主题都由 token 覆盖)
- **图标**:SVG 内联(沿用 v2 体系),不放 `<img>`,不放字体图标
- **字体**:`--font-ui` / `--font-mono` 由 token 控制,组件不指定字体
- **深色**:集中在 `tokens.css` 的 `[data-theme="dark"]` 块,不散落到组件

### 5.4 主题影响的所有组件

**所有组件必须浅+深双主题测试**。kimi3 写完一个组件,必须验证 `[data-theme="dark"]` 下不破。

---

## 6. Tauri 壳(ZCode 负责)

### 6.1 复用 kimi-ui 的 Rust 代码

| 函数 | 用途 | 复用 |
|------|------|------|
| `connect_daemon` | 启动 daemon + token 读取 | ✅ |
| `kimi_home` / `find_kimi` | 定位 `~/.kimi-code/` | ✅ |
| `notify` / `set_dock_badge` | 通知 + Dock 角标 | ✅ |
| `main_webview_builder` | WebView 配置 | ⚠️ 改(对接 vite dev) |
| `INIT_SCRIPT` | MutationObserver 补丁 | ❌ 丢弃(fork 后不需要) |

### 6.2 新增

- **全局快捷键**:`Cmd+Option+N` 唤起主窗口(tauri-plugin-global-shortcut)
- **多窗口**:每个 SideTask 可弹独立窗口(可选,P1)
- **Tauri 命令**:`open_external(url)` / `set_overlay` / `focus_window` 等

### 6.3 dev / prod 模式

```
dev:vite dev server (5197) ← Tauri WebView 导航
     Tauri Rust 进程(启动 daemon + 注入 Tauri API)

prod:vite build → web/dist/
     Tauri 打包时把 web/dist/ 嵌入 .app
     运行时 WebView 加载 embedded 资源
```

---

## 7. 已拍板的问题(Q1-Q5 结论)

> 本节原为 ZCode 提问,kimi3 复核 + ZCode 轮次 0.2 回应后全部定案,结论如下。

### Q1. 组件粒度:ConversationPane 是大组件还是拆?

**【结论】拆 5 个组件**(ConversationPane / MessageUser / MessageAssistant / ThinkingBlock / TodoCard + ToolCallCard),但消息数据必须用官方 `ChatTurn.blocks: TurnBlock[]` **有序混合数组**(text/thinking/tool 按调用序),**不允许**把 thinking/todos/subagents 拆成平行数组各自渲染——顺序就是语义。todo/subagents/turnProgress 是 turn 级状态,单独传 props,不进 blocks。

### Q2. CSS 写在 `<style scoped>` 还是独立 `.css`?

**【结论】B 为主**:`prototype/styles/` 10 个 CSS 原样搬入 `web/src/styles/`,组件 template 用 class 名引用;`<style scoped>` 只放组件独有的局部规则(5.3 已同步改写)。`themes.css` 删除,深色变量留 `tokens.css` 的 `[data-theme="dark"]` 块。

### Q3. 模型/思考深度 pill 是组件还是 inline?

**【结论】弹层簇 4 个全独立**:`ModelPicker.vue` / `PermPicker.vue` / `ModePicker.vue` / `ContextMeter.vue`。各自的弹层逻辑(列表 + 分段 + 持久化)足够复杂,inline 会让 Composer 变成第二个 2246 行的官方 Composer.vue。

### Q4. 思考块流式动画用 CSS 还是 JS?

**【结论】CSS 管视觉,JS 管节奏**:cursor blink、rail pulse、max-height 过渡全在 CSS;流式节奏(批量更新 + 节流)**复用 fork 的 `composables/client/eventBatcher.ts`,不新写**;流式期间的自动跟随滚动(滚锚)是组件行为,归 kimi3,不进 composable。

### Q5. 侧边任务(SideTask)和 Inspect 右栏会不会同时开?

**【结论】共存,不互斥**:SideTask 真分栏(主区 padding 让位),DetailPane / ReviewPane 以更高 z-index **覆盖**在其上;**Esc 分层关闭**——先关最上层覆盖物,再关分栏。覆盖是瞬态(看完 Esc 即回),不构成持久三栏。ZCode 原互斥建议撤回(与其 `useUIState` 草图的两个独立布尔自相矛盾)。

---

## 8. 开工前还要做的事(ZCode 的 TODO)

- [x] 把本文档 + HANDOFF.md 丢给用户转 kimi3 核对(轮次 0.2/0.3 完成)
- [x] kimi3 确认 Q1-Q5 + 契约异议(结论见第 7 节与附录 B)
- [x] 在设计文档追加决策 19(状态管理:纯 composables)—— 2026-07-19
- [x] 在 HANDOFF.md 追加 ARCHITECTURE.md 引用 —— 2026-07-19 轮次 1.2
- [x] 开始轮次 1(搭骨架)—— 2026-07-19 完成,详见 HANDOFF 轮次 1 / 1.1 / 1.2

---

## 附录 A:架构看门狗(每次提交前自查)

1. **协议层动了没?** → 动了回退(`api/daemon/` / `lib/slashCommands.ts` / `types.ts`)
2. **组件直接调 api 了没?** → 调了必须改走 client action
3. **新代码在 codex/ 子目录吗?** → 不在要重构
4. **组件里写了 mock 常量吗?** → 写了要改 props 传入
5. **样式用了硬编码 hex 吗?** → 用了要改 `var(--xxx)`
6. **改过的官方文件记 PATCHES.md 了吗?** → 没记要补
7. **深色主题下验证了吗?** → 没验证要补

## 附录 B:修订记录

- **2026-07-19 轮次 0.2(ZCode)**:接受 kimi3 复核 8 处契约异议中的 7 处;唯一反驳 —— permission 维持官方 `yolo`(types.ts:314/373 实证,kimi3 验证后认账);Q1-Q5 全部按 kimi3 立场定案。
- **2026-07-19 轮次 0.3(kimi3)**:落地全部修订 —— 契约改用官方 `ChatTurn` / `TurnBlock`(AppMessage 作废);`ComposerProps` 补 `modes` + `toggle-mode`;permission 回 `yolo`(UI 标签层映射「完全自主」);SlashMenu / MentionMenu 的 cursor 改内部 ref;弹层簇 4 个全独立;组件树补 AgentPanel / TurnProgress / ThreadMenu / FileMenu / Toast;SideTask 挪 `codex/layout/` 并 slot 化(AgentTranscript 为内容组件);5.3 改写 + styles 列 10 文件 + 删 themes.css;Q5 定共存(覆盖 + 分层 Esc);`useKeyboardShortcuts` 统一改名 `useHotkeys`;Q4 节奏控制明确复用 `eventBatcher.ts`。
