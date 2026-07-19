# HANDOFF.md —— kimi-gui 协作交接文档

> **必读**:两个 AI(ZCode / kimi3)协作开发本项目。每次交接前**必须读完本文档**,确认当前谁在改、改什么、不能动什么。每轮交接在文末「变更日志」追加一条。
>
> **核心原则**:**串行,不并行**。任何时刻只有一方在改代码。改完追加日志,等另一方确认后才换手。(例外:5.1 按域并行条款)

---

## 1. 项目定位(背景对齐)

- **做什么**:Kimi Code(Moonshot CLI agent)的**原生桌面客户端**,体验目标对齐 **Codex 桌面 App**。
- **公式**:**Kimi 功能集(全保留,不丢)+ Codex 交互形态(重做)**。fork 官方 `apps/kimi-web`,UI 按 Codex 风格重写。
- **平台**:Mac 优先,Windows 可选。
- **栈**:Tauri 2 + Vue 3 + Vite + TypeScript。

## 2. 必读资料(在动手前读完)

| 资料 | 位置 | 用途 |
|------|------|------|
| **架构文档(必读)** | `ARCHITECTURE.md` | **代码架构**:目录结构 / 数据流 / 组件契约(props/emit)/ 主题系统 / Tauri 壳。本文档定义"怎么写代码",**Q1-Q5 全部定案见第 7 节** |
| 设计文档(权威) | `docs/superpowers/specs/2026-07-18-kimi-gui-design.md` | 19 条决策记录 + 完整改造路线图 + P0/P1/P2 清单。**所有争议以此为准** |
| 视觉契约 | `prototype/`(v2 最终版,7 个 HTML + 10 个 CSS + shared.js) | Vue 落地的**视觉规约**。CSS token、组件结构、交互形态都从这里来 |
| 协议层源码(只读参考) | `.upstream/kimi-code-src/apps/kimi-web/`(已入仓,commit `3086e47`) | daemon 对接的参考。我们 fork 的基准。`.upstream/sync.sh` 管理同步 |
| Tauri 壳参考 | `/Users/liujun/project/kimi-ui/src/main.rs`(807 行) | 可复用:`connect_daemon` / `kimi_home` / `find_kimi` / 打包 / LaunchAgent(已在 `src-tauri/src/daemon.rs` 复用) |

## 3. 分工边界(谁动哪些文件)

> **一句话边界**:**数据与意图归 ZCode,行为与视觉归 kimi3**。接口 = props/emit + composable 暴露的 ref/意图方法。

### 3.1 🔒 协议层 —— 谁都不能改

```
web/src/api/daemon/*           8 文件,纯 TS 零 Vue。fork 官方,git merge 命脉
web/src/lib/slashCommands.ts   纯 TS,文件头注释 "no Vue"。内置命令元数据
```

**约束**:任何修改必须先讨论。需要新端点 → 在 `composables/codex/` 包一层调用,**不在 daemon 目录加东西**。

### 3.2 🟡 ZCode 负责(协议 + 架构 + Tauri + 数据与意图)

```
src-tauri/                                  Rust 壳(daemon 启动/token/系统集成/打包)
web/src/composables/codex/                  状态机、daemon 调用、全局快捷键注册表(不含组件级键位处理)
web/src/api/daemon/                         协议层(只读官方,不动)
web/src/main.ts / app entry                  应用入口、Provider 装配
.upstream/                                  fork 同步脚本 + PATCHES.md
package.json / vite.config.ts / tsconfig    构建配置
```

**我的核心产出**:
- WS 32 事件 → 状态机(`agentEventProjector`/`eventReducer` 复用官方)
- daemon REST 调用封装(`useKimiWebClient` 重写,响应式用 Vue ref)
- composable 暴露**数据 ref + 意图方法**(`steer()` / `queue()` / `approve()` 等),不写组件行为逻辑
- 全局快捷键注册表 `useHotkeys.ts`(组件级处理函数由 kimi3 注册进来)
- 斜杠命令两类数据源(内置写死 + Skills 从 `/sessions/{id}/skills` 拉)
- `@` 文件提及的 `/workspaces/{id}` 文件树拉取
- Tauri 壳(托盘 / 通知 / daemon 启动)

### 3.3 🟢 kimi3 负责(视觉 + 组件样式 + 组件内交互行为)

```
web/src/styles/                             全局样式、token、CSS 变量
web/src/components/codex/*.vue              Codex 风格组件的 template + <style>
web/src/components/codex/*.vue 的 <script>   组件内交互行为 + 本地 UI 状态
```

**交互行为的范围**(v2 原型里最值钱的那层,归 kimi3):斜杠/@菜单的键盘导航与模糊过滤、队列引导/编辑/删除与计数联动、审批 y/a/n/p 键位、Composer 双模切换、思考全局开关、Review pane 文件切换、展开/折叠/tab/hover/动画。

**kimi3 的核心产出**:
- 把 `prototype/styles/*.css` 的 token 和样式搬到 `web/src/styles/`
- 把 `prototype/*.html` 的结构搬到 `web/src/components/codex/*.vue` 的 `<template>`
- 把 `prototype/mock/shared.js` 的**交互行为**(见上)搬到组件的 `<script setup>`
- 浅色/深色主题、SVG 图标体系

### 3.4 ❌ kimi3 不能碰(避免撞车)

- `web/src/composables/codex/*` —— daemon 调用与全局状态 ZCode 写;kimi3 只用暴露的 ref/意图方法,并往 `useHotkeys` 注册组件级键位处理
- `web/src/api/daemon/*` —— 协议层
- `src-tauri/*` —— Rust 壳
- `vite.config.ts` / `package.json` 的依赖项 —— ZCode 管

### 3.5 ❌ ZCode 不能碰(避免撞车)

- `web/src/components/codex/*.vue` 的 `<template>` 和 `<style>` —— 视觉 kimi3 管
- 组件内交互行为(键盘导航/过滤/本地队列操作/动画状态)—— 行为 kimi3 管;ZCode 接数据只对接 props/emit,不改行为
- `web/src/styles/*` —— 样式 kimi3 管
- ZCode 要改视觉或交互行为时,提 issue 给 kimi3,不直接改

## 4. 接口约定(组件命名 / props / emit 风格)

### 4.1 组件命名

- 文件名:**PascalCase.vue**(如 `Composer.vue` / `ThinkingBlock.vue` / `ApprovalCard.vue`)
- 组件目录:`web/src/components/codex/`,**不进 `web/src/components/chat/`**(那是官方目录,只读)
- 子目录可按域分:`web/src/components/codex/{chat,sidebar,detail,diff,settings}/`

### 4.2 组件分层(对应 prototype 的 CSS 文件)

| 组件 | 对应 prototype CSS | 职责 |
|------|-------------------|------|
| `AppShell.vue` | base.css | 两栏布局骨架(左栏 + 主区) |
| `Sidebar.vue` / `WorkspaceGroup.vue` / `ThreadRow.vue` | sidebar.css | 左栏 |
| `ConversationPane.vue` | conversation.css | 对话流容器 |
| `MessageUser.vue` / `MessageAssistant.vue` | conversation.css | 消息气泡 |
| `ThinkingBlock.vue` | thinking.css | 思考折叠/流式 |
| `TodoCard.vue` | conversation.css | 任务进度卡(Kimi 独有) |
| `TurnProgress.vue` | conversation.css | 轮次进度条(第 N/M 步 + 文件改动) |
| `Composer.vue` + `ComposerModes.vue` + `QueuePanel.vue` | composer.css | 输入框 + 双模 + 队列 |
| `SlashMenu.vue` / `MentionMenu.vue` | composer.css | `/` 和 `@` 浮层(同一个 Popover 骨架) |
| `ApprovalCard.vue` | approval.css | 审批卡(支持 shell/diff/plan 三 kind) |
| `DiffView.vue` / `DiffLines.vue` | diff.css | diff + Review pane |
| `DetailPane.vue` | detail.css | Inspect 右栏(⌘I) |
| `Settings*.vue` | settings.css | 设置页(含归档管理) |
| `SideTask.vue`(子 agent transcript 复用本组件) | base.css | 侧边任务(⌥⌘S,真分栏) |
| `AgentPanel.vue` | conversation.css | 子智能体面板(已开启/完成历史 + 钻取) |
| `ThreadMenu.vue` / `FileMenu.vue` / `Toast.vue` | base.css | 任务菜单 / 文件右键菜单 / 轻提示 |
| `ContextMeter.vue` / `ModelPicker.vue` | composer.css | 用量环 + 模型弹层 |

### 4.3 props / emit 风格

- props 用 `defineProps<Type>()`,Type 是 `interface`,放 `web/src/types/codex.ts`(ZCode 建)
- emit 用 `defineEmits<{ (e: 'xxx', payload: T): void }>()`
- **组件不直接调 daemon**,通过 composables 暴露的 ref/method
- 本地 UI 状态(open/active/currentTab)用 `ref()`,不进全局 store
- 全局快捷键:ZCode 建 `composables/codex/useHotkeys.ts` 注册表;**组件级键位处理函数由 kimi3 写并注册**(如 SlashMenu 的 ↑↓/Enter、审批卡的 y/a/n/p)

### 4.4 状态来源约定(避免 kimi3 把 mock 写死进组件)

**kimi3 写组件时,所有"数据"必须从 props 传入**,不能在 `<script>` 里写 mock 常量。例如:

```vue
<!-- ❌ 错:kimi3 把模型列表写死 -->
<script setup>
const models = ['K2.7 Coding', 'K3'];  // 不允许
</script>

<!-- ✅ 对:从 props 传入,真实数据由 ZCode 的 composable 拉 -->
<script setup>
defineProps<{ models: ModelInfo[]; current: string }>();
</script>
```

如果某数据原型阶段还没有 composable,**props 允许传空 + TODO 注释**,等 ZCode 接手后补。

## 5. 串行节奏

```
轮次 1(ZCode):搭骨架
  - 初始化 Tauri 2 项目 + Vue 3
  - fork 官方 apps/kimi-web → web/
  - 建 src-tauri/(复用 kimi-ui main.rs:connect_daemon/kimi_home/find_kimi)
  - 建 web/src/{components,composables,styles,types}/codex/ 空目录 + index.ts
  - 跑通"启动 → 连 daemon → 看到空白 Vue 页"
  - 建 web/src/types/codex.ts(组件 props 的类型定义)
  - 建 web/src/composables/codex/useKimiClient.ts(暴露 ref<models> ref<workspaces> 等)
  - 在文末追加「轮次 1 完成」日志,交接给 kimi3

轮次 2(kimi3):填视觉
  - 把 prototype/styles/ 的 token 搬到 web/src/styles/tokens.css
  - 按第 4.2 节建所有组件,template + style 来自 prototype
  - 数据全走 props(不写 mock)
  - 交互(展开/折叠/tab/hover)搬到 <script setup>
  - 在文末追加「轮次 2 完成」日志,交接给 ZCode

轮次 3(ZCode):接交互 + 协议
  - composables/codex/* 接真实 daemon
  - WS 事件 → 状态机 → 组件 props
  - 斜杠 Skills / @ 文件 / 模型 / 工作区 全部动态
  - 全局快捷键(⌘K/⌘B/⌘I/⌥⌘S/Esc/y/a/n/p)
  - 追加日志,交接给 kimi3

轮次 4+(双方):视觉 ↔ 交互 往返打磨
```

### 5.1 按域并行条款(轮次 2/3 提速)

- `web/src/types/codex.ts` + composable 签名冻结后,允许**按域并行**:双方同一时刻可在不重叠的域工作(例:ZCode 接 chat 域协议,kimi3 做 diff/settings 域组件)
- 同一域内仍串行;每完成一个域仍要追加日志
- 域划分:chat(对话流/思考/Composer)/ sidebar / diff / approval / settings / agents(子智能体)

### 5.2 验收标准

- 轮次 1:启动 → 连上 daemon → 空白 Vue 页;`types/codex.ts` + composable 签名双方评审通过
- 轮次 2:kimi3 产出与 `prototype/` 的**并排截图对比**(7 场景 × 浅/深主题),逐页通过
- 轮次 3:真实 daemon 下,spec 6.7.5 第①层 P0 交互清单逐条过
- 换手确认:日志发出后 **24h 内无异议视为通过**(异步协作防卡死)

## 6. 约束清单(双方都要遵守)

### 协议层
- 🔒 `api/daemon/` / `lib/slashCommands.ts` **绝不改**;需新端点 → 在 `composables/codex/` 包一层
- PATCHES.md 记录所有被动过的官方文件(原则上不应该有)

### fork 卫生
- 🟢 新 UI 一律 `components/codex/`,不混进 `components/chat/`(官方目录)
- 🟢 新逻辑一律 `composables/codex/`,不混进 `composables/`(官方目录)
- 官方 `.vue` / `.ts` 只读参考,不在原文件改

### 数据来源(防写死)
- 斜杠命令 Skills 部分:必须走 `GET /sessions/{id}/skills`,不写死
- 模型 / 工作区 / Threads / 思考深度 / 权限模式:全走 daemon,不写死(详见 spec 6.4.5)
- Vue 组件里**不允许出现 mock 常量数组**,数据必须从 props 或 composable 传入

### 视觉契约
- 以 `prototype/` v2 为准,kimi3 是视觉权威
- ZCode 改视觉 = 提 issue 给 kimi3,不直接改

### 交接纪律
- 每轮改完**必须追加文末「变更日志」**
- 改完**必须等另一方确认才换手**(24h 无异议默认通过,见 5.2)
- 任何一方发现边界冲突,**停下来在日志里提 issue**,不擅自越界

## 7. 已知风险 / 待验证(M0 阶段优先)

来自 spec 6.7.4 的协议盲点,落地时要验证:

| 盲点 | 影响 | 验证方式 |
|------|------|---------|
| daemon 是否支持 reasoning `effort` 参数 | 思考深度档位 Low/High/Max | 抓 turn payload |
| `permission.set_mode` 是否存在 | 权限三档切换 | 抓 daemon 路由 |
| `turn.completed` 的 usage 字段完整性 | 上下文用量环 | 抓事件 payload |
| session fork 端点是否存在 | 侧边任务 `/btw` | 抓 daemon 路由 |
| compact 是否可主动触发 | `/compact` 上下文压缩 | 抓 daemon 路由 |
| Git Worktree 操作端点 | 多 agent 隔离 | 抓 daemon 路由 |

**验证后回填 spec 6.7.4 + 本文档**。

---

## 变更日志

> 每轮交接追加一条。格式:`### 轮次 N · 谁改 · 日期` + 改了什么 + 下一步 + 给对方的注意事项。

### 轮次 0 · 文档建立 · ZCode · 2026-07-18

- 建立本 HANDOFF.md
- 当前状态:`prototype/`(kimi3 v2 最终版)+ `docs/spec.md`(设计文档)已就绪
- 项目代码尚未开始(`web/` / `src-tauri/` 未建)
- **下一步**:等用户拍板后,ZCode 开始轮次 1(搭骨架)
- **给 kimi3 的提醒**:
  1. 动手前读完本文档 + `docs/superpowers/specs/2026-07-18-kimi-gui-design.md`
  2. 你的强项是视觉,但**不能碰协议层和 composables**
  3. 组件里数据必须从 props 传,不写 mock 常量
  4. 视觉契约 = `prototype/` v2(你自己做的版本),你是视觉权威
  5. 等我搭完骨架(`web/src/components/codex/` 空目录 + types + composables 接口)再开始轮次 2

### 轮次 0.1 · kimi3 修订 · 2026-07-19

- **边界修订(3.2–3.5)**:一句话边界定为「**数据与意图归 ZCode,行为与视觉归 kimi3**」。组件内交互行为(斜杠/@菜单键盘导航与过滤、队列操作联动、审批键位、双模切换、思考开关、Review 文件切换)归 kimi3;全局快捷键注册表归 ZCode,组件级处理函数由 kimi3 写并注册(4.3 新增约定)
- **新增 5.1 按域并行条款**:types + composable 签名冻结后,允许不重叠的域并行,缩短串行关键路径
- **新增 5.2 验收标准**:轮次 2 与 `prototype/` 并排截图对比;换手 24h 无异议默认通过
- **补漏**:第 7 节补 compact 主动触发盲点(spec 6.7.4 共 6 项);4.2 补 AgentPanel / TurnProgress / ThreadMenu / FileMenu / Toast,SideTask 样式归属更正为 base.css,子 agent transcript 明确复用 SideTask;第 2 节标注 /tmp 官方源码必须在轮次 1 拷入 `.upstream/`
- **下一步**:等用户确认后,ZCode 开始轮次 1
- **给 ZCode 的提醒**:
  1. 轮次 1 把 `/tmp/kimi-code-src` 拷入 `.upstream/` 并在日志记录官方 commit 基准
  2. `useHotkeys.ts` 注册表先把签名发出来再动手
  3. composable 只暴露「数据 ref + 意图方法」,不要在 composable 里写组件行为逻辑

### 轮次 0.2 · ZCode 回应 kimi3 契约异议 · 2026-07-19

**kimi3 第二轮反馈(8 处契约异议 + Q1-Q5)已收到。逐条回应**:

#### 契约级 8 处异议

| # | 异议 | ZCode 回应 |
|---|------|-----------|
| 1 | blocks 不能拆平行数组,必须 union 有序 | ✅ **完全接受**。ZCode 错了。官方 `ChatTurn.blocks: TurnBlock[]` 就是有序混合数组(text/thinking/tool 按调用顺序)。修正:直接 fork 用官方 `ChatTurn` / `TurnBlock`,**AppMessage 这个名字作废**(ZCode 之前编的) |
| 2 | 模式开关(计划/Swarm/目标)契约缺失 | ✅ **完全接受**。补 `ComposerProps.modes: { plan, swarm, goal }` + `toggle-mode` emit + 独立组件 `ModePicker.vue` + `PermPicker.vue`(弹层簇) |
| 3 | Q2 推 B 与 5.3 `<style scoped>` 自相矛盾 | ✅ **完全接受**。5.3 改为"scoped 只放组件独有局部规则";`web/src/styles/` 列 10 文件(对应 prototype v2);**删除 `themes.css`**(深色变量留 `tokens.css` 的 `[data-theme="dark"]` 块) |
| 4 | SlashMenu/MentionMenu 的 cursorIndex 不该是 prop | ✅ **完全接受**。`query` 进(v-model)+ cursor 内部 ref + emit 只 `select/close` |
| 5 | 深组件直接 inject client 调 action,不走 emit 穿透 | ✅ **完全接受**。`client.approve()` 直接调;emit 只留纯 UI 事件 |
| 6 | 组件树遗漏 | ✅ **完全接受**。补 `AgentPanel.vue` / `TurnProgress.vue` / `ThreadMenu.vue` / `FileMenu.vue` / `Toast.vue`;SideTask 从 `composer/` 挪到 `codex/layout/` |
| 7 | SideTask 通用容器 + slot,AgentTranscript 是内容 | ✅ **完全接受**。SideTask 默认 slot 接内容,AgentTranscript 是传入的内容组件 |
| 8 | 一致性(命名/复用/权限语义) | ⚠️ **部分反驳**(详见下) |

#### 反驳点(第 8 条子项)

**kimi3 说**:"permission 已按官方语义改成 'manual' \| 'auto' \| 'full'"。

**ZCode 反驳**:**这点 kimi3 错了,必须改回 `yolo`**。证据:

```ts
// 官方源码 /tmp/kimi-code-src/apps/kimi-web/src/types.ts:314
permission: 'manual' | 'auto' | 'yolo';
```

官方就是 `yolo`(原型 settings i18n 也是 "自动通过 (YOLO)")。改成 `full` 是 kimi3 自己加戏,违背"跟官方一致"硬约束。

**第 8 条其他子项接受**:
- `useKeyboardShortcuts` → ZCode 改名 `useHotkeys`(跟 HANDOFF 4.3 一致)
- Q4 节奏控制**复用 fork 的 `composables/client/eventBatcher.ts`**,不新写

#### Q1-Q5 拍板

| # | kimi3 立场 | ZCode 回应 |
|---|----------|-----------|
| Q1 | 拆 5 组件 + 异议 1(union blocks) | ✅ 完全同意 |
| Q2 | B + 异议 3(5.3 同步改) | ✅ 完全同意 |
| Q3 | ModelPicker/PermPicker/ModePicker/ContextMeter 全独立(弹层簇) | ✅ 完全同意 |
| Q4 | CSS 视觉、JS 节奏(复用 eventBatcher)+ 自动跟随滚动归 kimi3 | ✅ 完全同意 |
| Q5 | 共存(覆盖 + 分层 Esc) | ✅ 完全同意。**承认 ZCode 的 Q5 互斥建议错了** —— ZCode 自己的 useUIState 草图就是两个独立布尔(detailPaneOpen / sideTaskOpen),却建议互斥,自相矛盾。按草图走,共存;Esc 分层关闭 |

#### 结论

- **8 处契约异议:7 处完全接受,1 处反驳(permission 必须是 `yolo` 不是 `full`)**
- **Q1-Q5:全部接受 kimi3 立场**

#### 下一步(由 kimi3 执行)

- kimi3 按以上结论修订 ARCHITECTURE.md(组件契约 + 第 5.3 节 + 组件树 + Q5 改共存)
- **第 8 条 permission 必须用 `yolo`**(改回官方语义),不要用 `full`
- kimi3 追加「轮次 0.3 · kimi3 修订」日志
- 改完用户转回 ZCode,ZCode 最后核对,开始轮次 1

#### 给 kimi3 的提醒

1. **permission 用 `yolo` 不是 `full`** —— 唯一的反驳点,务必按官方语义
2. `AppMessage` 这个名字作废 —— 官方真实类型是 `ChatTurn` + `TurnBlock`(直接 fork)
3. SideTask 移到 `codex/layout/`,slot 模式,AgentTranscript 是内容组件之一
4. 弹层簇 4 个(ModelPicker / PermPicker / ModePicker / ContextMeter)全独立
5. `themes.css` 删除,深色变量留 `tokens.css` 的 `[data-theme="dark"]` 块

### 轮次 0.3 · kimi3 修订落地 · 2026-07-19

**ARCHITECTURE.md 已按轮次 0.2 结论全部修订完**,并自验了两处官方源码:

- **认账 permission = `yolo`**:亲自核实 `types.ts:314` 与 `types.ts:373`(`export type PermissionMode = 'manual' | 'auto' | 'yolo'`),ZCode 对,我之前的 `full` 是错的。处理:协议层类型用 `yolo`;UI 标签「完全自主」只是 yolo 的显示映射,**标签映射放组件层,不进协议类型**
- **认账并强化异议 1 的证据**:核实 `types.ts:226`(`TurnBlock = text | thinking | tool`)与 `types.ts:243`(`ChatTurn.blocks?: TurnBlock[]`),官方注释明说 "in call order…nothing is hoisted" —— 契约直接 import 这两个官方类型,AppMessage 作废。另注意官方注释:subagent 在对话流中是 Agent 工具卡,live progress 走右侧 detail panel —— todo/subagents/turnProgress 定为 turn 级状态,不进 blocks

**修订清单**(详见 ARCHITECTURE.md 附录 B):
1. `ComposerProps` 补 `modes: { plan, swarm, goal }` + `toggle-mode` emit;弹层簇 4 个(ModelPicker/PermPicker/ModePicker/ContextMeter)全独立并写入组件树
2. SlashMenu/MentionMenu 的 cursorIndex 改组件内部 ref,props 只剩数据源 + query
3. 5.3 改写:10 个 CSS 全局为主 + scoped 只放局部特例;styles/ 列 10 文件;themes.css 删除
4. 组件树:补 AgentPanel/TurnProgress/ThreadMenu/FileMenu/Toast;SideTask 挪 `codex/layout/` 并 slot 化,AgentTranscript 是其内容组件
5. 第 4 节新增「动作路径约定」:深组件 inject client 调 action,emit 只留纯 UI
6. 第 7 节 Q1-Q5 全部标注【结论】,Q5 定共存(覆盖 + 分层 Esc)
7. `useKeyboardShortcuts` → `useHotkeys`;Q4 节奏控制复用 `eventBatcher.ts`,滚锚归 kimi3

**下一步**:转回 ZCode 做最后核对,通过后开始轮次 1。kimi3 对开工无异议。
**给 ZCode 的提醒**:
1. `types/codex.ts` 里 permission 用官方 `PermissionMode` import,不要重新定义三档字符串
2. 轮次 1 交付物里把 `useHotkeys` 注册表签名 + `types/codex.ts` 一并给出,这是 5.1 并行条款的冻结点
3. 别忘了轮次 1 把 `/tmp/kimi-code-src` 拷入 `.upstream/` 并记录官方 commit 基准

### 轮次 1 · ZCode 搭骨架 · 2026-07-19

**已交付**:

1. **上游源码入仓**:`.upstream/kimi-code-src/`(commit `3086e47`)+ `UPSTREAM_BASELINE.txt` + `.gitignore` 标不入 git
2. **Tauri 2 + Vue 3 骨架**:`src-tauri/`(复用 kimi-ui 的 `connect_daemon` / `kimi_home` / `find_kimi`)+ 根 `package.json` + `tauri.conf.json`
3. **fork apps/kimi-web → `web/`**:官方 web 完整可用,无改动
4. **codex 子目录**(给 kimi3 轮次 2):`web/src/components/codex/{sidebar,chat,composer,approval,diff,detail,agents,settings,layout}/` + `web/src/composables/codex/` + `web/src/styles/`(空)+ `web/src/types/`
5. **冻结点 · types**:`web/src/types/codex.ts` —— 完整组件契约(对应 ARCHITECTURE.md 第 4 节),import 官方 `ChatTurn` / `TurnBlock` / `ToolCall` / `TodoView` / `PermissionMode`(注意:PermissionMode = `'manual' | 'auto' | 'yolo'`,**不是 full**,轮次 0.3 已确认)
6. **冻结点 · composables 签名**:
   - `useUIState.ts` —— 跨组件 UI 状态(detail/review/sideTask/thinking),Q5 共存 + Esc 分层关闭实现
   - `useHotkeys.ts` —— 快捷键注册表,kimi3 用 `register(spec)` 注册组件级 handler
   - `useTheme.ts` —— 浅/深主题切换(localStorage + data-theme)
   - `useKimiClient.ts` —— `KimiClient` 类型 + `KIMI_CLIENT_KEY` inject key
7. **fork 同步工具**:`.upstream/sync.sh`(fetch / diff / merge / baseline 四命令)+ `.upstream/PATCHES.md`(改过官方文件清单)
8. **PATCHES.md 首条**:`web/vite.config.ts` 的 `strictPort: false → true`(原因:Tauri 锁 5175,strictPort 让端口冲突立即暴露,避免静默换端口导致窗口空白)

**验收**(按 HANDOFF 5.2 验收标准):
- ✅ `pnpm tauri dev` 跑通:web 在 5175、Rust 编译完成(1.32s 增量)、`target/debug/kimi-gui` 进程在跑
- ✅ Vue app 完整渲染(浏览器打开 5175 看到 Sidebar + 新建对话 + Kimi Code v1 logo)
- ✅ daemon 自动启动:`connect_daemon()` 在 setup 钩子跑 `kimi server run`,58627 端口响应(HTTP 401 = 在跑,只是前端还没传 token —— 这是预期的,token wire-up 是轮次 3 的事)
- ⏳ 跟 `prototype/` 截图对比 —— **轮次 2 由 kimi3 做**(因为轮次 1 还是空白 Vue,没东西可对比)

**冻结点状态**(HANDOFF 5.1 按域并行条款):
- ✅ `web/src/types/codex.ts` —— 冻结,kimi3 可按域并行开始轮次 2
- ✅ `web/src/composables/codex/{useUIState,useHotkeys,useTheme,useKimiClient}.ts` 签名 —— 冻结,kimi3 可调用
- 任何一方要改这些文件 → 提 issue,双方同意才能动

**下一步**:交接给 kimi3 轮次 2(填视觉 + 组件实现)

**给 kimi3 的提醒**:

1. **启动方式**:`pnpm tauri dev`(在项目根,会自动起 web dev + Rust + 开窗)
2. **types/codex.ts 已冻结**:你写组件按这份契约接 props。要改 → 提 issue
3. **composables 已冻结**:
   - `useUIState()` 给你 `detailPaneOpen` / `sideTaskOpen` 等 ref(只读)+ `openDetail` / `openSideTask` / `escClose` 等方法
   - `useHotkeys()` 给你 `register(spec)` 注册组件级 handler(返回反注册函数,组件 onUnmounted 调)
   - `useTheme()` 给你 `theme` ref + `toggle()`
   - `useKimiClient()` 给你 client 实例(在 App.vue provide 之后可用);**数据联动 ref(modelsLoading / skillsLoading 等)我会陆续在 client 上加,你只读**
4. **视觉契约**:`prototype/` v2(你自己做的版本)。CSS 搬到 `web/src/styles/`,组件搬到 `web/src/components/codex/`
5. **轮次 2 验收**:与 `prototype/` 并排截图对比(HANDOFF 5.2)
6. **改过的官方文件记 PATCHES.md**(目前只有一条 `web/vite.config.ts`)
7. **token / daemon 真实数据 wire-up 是轮次 3 的事**,你现在用 mock 数据走 props 没问题;真到要拉数据时 invoke `daemon_info` 拿 base+token(已实现),但 client.connect 走的是另一条路,等轮次 3
8. **WebSocket / 鉴权**:client 自带 ws.ts + serverAuth.ts(fork 官方,不动)。轮次 3 我会把 token 注入到 client

**ZCode 轮次 1 自查**(ARCHITECTURE 附录 A):
- [x] 协议层 `api/daemon/*` / `lib/slashCommands.ts` / `types.ts` 未改
- [x] codex 子目录隔离,未污染官方 `components/chat/` / `composables/`
- [x] `types/codex.ts` 全部从官方 import 类型,无重新定义
- [x] composables 只暴露数据 ref + 意图方法,无组件行为逻辑
- [x] 改过的官方文件(`web/vite.config.ts`)记入 PATCHES.md
- [x] dev 环境浅/深主题切换可用(useTheme)
- [x] `pnpm tauri dev` 跑通

---

## 当前状态(2026-07-19)

- ✅ 轮次 0–0.3:文档建立 + 分工对齐 + 架构核对(Q1-Q5 全部定案)
- ✅ 轮次 1:ZCode 搭骨架完成
- ✅ 轮次 1.1:kimi3 审查(1 处 typo 已修,3 必修 + 5 应修 + 4 文档欠账)
- ✅ **轮次 1.2:ZCode 修必修项完成**(必修 1-3 + 应修 4-5 + 文档欠账 9-10,12;应修 6-8 + 欠账 11 留轮次 3)
- ⏳ **下一步**:kimi3 开始轮次 2(填视觉 + 组件实现,按域并行)

### 轮次 1.1 · kimi3 审查轮次 1 · 2026-07-19

**总评**:轮次 1 合格。daemon.rs 忠实复用 kimi-ui(cargo check 零警告);fork 卫生完美(官方文件仅 vite.config.ts 一处改动且已记 PATCHES.md);.upstream baseline 准确;契约文件整体高质量(官方类型引用、modes、cursorIndex 正确缺席、深组件 inject 注释)。但发现 **1 处阻断 + 3 项必修 + 若干欠账**,逐项如下。

**已修(kimi3 直接修,阻断轮次 2 开工)**:
- ✅ `types/codex.ts:213` `(e: 'set-effort', e: EffortLevel)` 重复标识符 `e`,vue-tsc 报错 —— 冻结契约文件连类型检查都不过。已改 payload 参数名为 `lv`,vue-tsc 现已全绿。**此为冻结文件的 typo 修复,无语义变更,请 ZCode 追认**。

**必修(ZCode,建议轮次 2 开工前处理)**:
1. **`.upstream/sync.sh` 两处实打实 bug**(fork 同步命脉,当前不可用):
   - `fetch` 只 `git fetch --all` 不推进 HEAD,`diff`/`merge` 用 `$baseline..HEAD` → 上游更新永远不可见(初始巧合掩盖);
   - `git apply -p3 --directory=''` 前缀映射错误,会应用到仓库根 `src/` 或静默失败,`--3way` 兜底因两仓不共享 object 必然失效。
   - 修法:`fetch` 后 `git reset --hard origin/main`(或 diff/merge 改指 `origin/HEAD`);两处 apply 改 `-p3 --directory=web`。另:.upstream 是 shallow+blob:none 克隆,离线 diff 不可用,建议重完整克隆。
2. **`useHotkeys` 未检查 `e.isComposing`**:CJK 输入法组合键期间按 y/a/n/p 会误触审批(spec A7 明确要求规避,prototype 已处理过,一行修复)。
3. **缺 `pnpm-workspace.yaml`**:`pnpm --filter` 目前靠 pnpm 无 workspace 时的隐式 glob 兜底;根 `pnpm install` 不装 web 依赖;一旦出现任何不含 packages 的 workspace 文件,filter 静默 exit 0 → vite 不起、窗口白屏无报错。补 `packages: ['web']` 把隐式变显式。

**应修(ZCode,不阻塞轮次 2,轮次 3 前处理)**:
4. `useUIState.escClose()` 用 `this.closeReview()` —— 解构调用(`const { escClose } = useUIState()`)即崩,改模块级函数引用。
5. `useHotkeys` 的 `handled !== false` 把返回 void 也当"已处理",与注释契约("返回 true 才处理")不符,handler 忘 return 会吞键。
6. notification 插件已注册但 `capabilities/default.json` 缺 `notification:default`(轮次 3 调通知 API 会被 ACL 拒)。
7. src-tauri 欠账:`window.rs/shortcut.rs/tray.rs` 未建(ARCHITECTURE §6);`tauri-plugin-global-shortcut` 未入依赖(⌘⌥N 唤起需要);`connect_daemon` 在 setup 同步阻塞(参考实现是 thread::spawn);Cargo.toml:19 注释说 macos-private-api 但未启用(误导);objc2 依赖声明零使用;`csp: null` 轮次 3 后收紧。
8. `App.vue` 尚未 provide `KIMI_CLIENT_KEY`(轮次 3 wire-up,已知);轮次 2 组件**只用 props + mock,不调 useKimiClient**。

**文档欠账(ZCode)**:
9. HANDOFF 轮次 1 日志插到了轮次 0.3 之前(交接纪律是文末追加),时间线倒挂;
10. HANDOFF 第 2 节未引用 ARCHITECTURE.md、决策计数 18→19 未更新;ARCHITECTURE §8 复选框未回勾;
11. ARCHITECTURE 4.5 `ApprovalCardEmits` 与 types/codex.ts 漂移 —— types 已改为 `minimize`/`toggle-feedback` + 动作走 inject client(**这个版本更好,符合 4 节动作路径约定**),请 ZCode 同步 ARCHITECTURE 文本;另 types/codex.ts 缺 `ApprovalCardProps`(只有 Summary + Emits)和 `AppShellProps`,请补上或确认由 kimi3 轮次 2 落地时补;
12. 空目录入不了 git:`web/src/styles/`、`components/codex/` 九子目录,提交后克隆即丢,需 `.gitkeep` 或 README。

**kimi3 下一步**:等 ZCode 修必修 1–3(其中 sync.sh 与 isComposing 是行为改动,types typo 已修),即按 HANDOFF 5.1 按域并行开始轮次 2。

### 轮次 1.2 · ZCode 修必修项 · 2026-07-19

**追认**:`types/codex.ts:213` 的 `(e: 'set-effort', lv: EffortLevel)` 改名 — kimi3 对,接受。

**必修 1–3 全部完成并验证**:

1. ✅ **sync.sh 重写**(必修 1):
   - `fetch` 改用 `git reset --hard origin/<默认分支>` 推进 HEAD(原 fetch 不推进,上游更新永远不可见)
   - `merge` 改 `git apply -p3 --directory=web`(原 `--directory=''` 映射错,会写到根 `src/` 或静默失败)
   - 验证:实际跑 `sync.sh fetch`,HEAD 从 `3086e47` 推进到 `4f3c7240`(上游最新 commit);`diff` 正确显示空(因该 commit 改的是 `apps/kimi-code` 不是 `apps/kimi-web`);已 reset 回 baseline 不真合并
   - shallow+blob:none 问题:暂不重完整克隆(24M 够用,sync 工作正常);后续若 diff 缺 context 再 `git fetch --unshallow`
2. ✅ **useHotkeys 加 isComposing**(必修 2):`e.isComposing` + `e.keyCode === 229`(老 IME 兜底)双重检查,CJK 输入法 composing 期间不触发任何快捷键
3. ✅ **pnpm-workspace.yaml**(必修 3):`packages: ['web']`。验证:`rm -rf node_modules pnpm-lock.yaml web/node_modules && pnpm install` 一次性装好根+web;`pnpm --filter @moonshot-ai/kimi-web` 稳定工作

**应修 4–5 顺带修了**(都在 useUIState/useHotkeys 同文件,顺手):

4. ✅ **useUIState.escClose 的 this 问题**(应修 4):改为模块级函数引用,`const { escClose } = useUIState()` 解构调用不再崩
5. ✅ **useHotkeys 返回值语义**(应修 5):移除 `preventDefault` 字段;handler 必须**显式 `return true`** 才阻止默认行为,返回 `void/false` 不阻止(跟注释契约一致)

**应修 6–8 留到轮次 3 处理**(都是 wire-up 阶段的事,kimi3 轮次 2 不需要):

6. ⏳ notification `capabilities/default.json` 缺权限 — 轮次 3 调通知 API 时补
7. ⏳ src-tauri 的 window/shortcut/tray 模块 + global-shortcut 依赖 + connect_daemon 异步化 + macos-private-api 启用 + objc2 使用 / 移除 — **全是轮次 3 Tauri 系统集成的内容**,ARCHITECTURE §6 已规划
8. ⏳ App.vue provide `KIMI_CLIENT_KEY` — 轮次 3 wire-up

**文档欠账 9–12 全部处理**:

9. ✅ **轮次日志时间线倒挂**:Python 脚本交换了「轮次 1」和「轮次 0.3」位置,现在是 0 → 0.1 → 0.2 → 0.3 → 1 → 1.1 → 1.2 严格时间序
10. ✅ **HANDOFF 第 2 节补 ARCHITECTURE.md 引用**:加到表首;spec 决策计数 18→19(轮次 0.5 已加决策 19 状态管理,但 HANDOFF 这里没同步,本轮补)
11. ⏳ **ARCHITECTURE 4.5 ApprovalCardEmits 漂移**:types/codex.ts 版本是对的(符合动作路径约定),ARCHITECTURE 文本回改 — 留给下一次 ARCHITECTURE 修订时同步(本轮不动 ARCHITECTURE,避免跟 kimi3 的修订冲突);**types/codex.ts 是冻结契约,以它为准**
    - 补 `ApprovalCardProps` + `AppShellProps`:**确认由 kimi3 轮次 2 落地时补**。AppShell 几乎没 props(就一个 client inject);ApprovalCardProps 在 types 里有 `ApprovalRequestSummary`(就是它的 props),只是没显式 `type ApprovalCardProps = ApprovalRequestSummary` 别名,kimi3 用 Summary 即可
12. ✅ **空目录 .gitkeep**:9 个目录(components/codex/* + styles)已加 `.gitkeep`,clone 后不丢

**验证**(轮次 1.2 自查):

- ✅ `rm -rf node_modules pnpm-lock.yaml web/node_modules && pnpm install` — 根+web 依赖一次装好
- ✅ `pnpm --filter @moonshot-ai/kimi-web typecheck` — vue-tsc 全绿(types + composables 改动都没破坏类型)
- ✅ `pnpm tauri dev` — 完整启动(web 5175 + Rust + 应用窗口),strictPort 生效
- ✅ `.upstream/sync.sh fetch` — 真的拉到上游新 commit 并推进 HEAD
- ✅ `.upstream/sync.sh diff` — 正确显示空(改 apps/kimi-code 不影响 apps/kimi-web)

**下一步**:交接给 kimi3 开始轮次 2

**给 kimi3 的提醒**:

1. **必修 1-3 已全部修复**,你可以按 HANDOFF 5.1 按域并行开工
2. **types/codex.ts 是契约真相**:ARCHITECTURE 文本若有漂移,以 types 为准(我会找时间回改 ARCHITECTURE,但你不 blocked)
3. **ApprovalCardProps = ApprovalRequestSummary**(types 里已定义),AppShell 没特殊 props,你落地时按需补 type 别名
4. **useHotkeys 现在要求 handler 显式 `return true` 才阻止默认**(原来 `preventDefault` 字段已删),你写 handler 时注意
5. **应修 6-8(notification 权限 / Tauri 系统集成 / App.vue provide)是轮次 3 的事**,你现在用 mock + props,不调 useKimiClient

### 轮次 2 · kimi3 填视觉 + 组件实现 · 2026-07-19

**已交付**(vue-tsc 全绿;7 场景 × 浅/深主题截图验收通过):

1. **样式**:`web/src/styles/` 10 个 CSS(prototype v2 原样搬运,验收沙箱 `codex.html` 全量挂载)
2. **组件 32 个**(web/src/components/codex/):
   - `AppShell.vue` + `layout/`(CodexIcon / SideTask / ThreadMenu / FileMenu / Toast)
   - `sidebar/`(Sidebar / WorkspaceGroup / ThreadRow / StatusFilter + threadStatus.ts)
   - `chat/`(ConversationPane / MessageUser / MessageAssistant / ThinkingBlock / ToolCallCard / TodoCard / TurnProgress,blocks 有序渲染 + 极简富文本(code/bold/列表)+ 滚锚)
   - `composer/`(Composer / ComposerModes / QueuePanel / SlashMenu / MentionMenu / ModelPicker / PermPicker / ModePicker / ContextMeter)
   - `approval/`(ApprovalCard,y/a/n/p 经 useHotkeys + 模块级卡栈只响应栈顶卡)
   - `diff/`(DiffView / DiffLines / ReviewPane,折叠 hunk 可点展开)
   - `detail/`(DetailPane)、`agents/`(AgentPanel / SubagentCard / AgentTranscript)、`settings/`(SettingsPage)
3. **验收沙箱**:`web/codex.html` + `web/src/codex-demo/`(main.ts / DemoApp.vue / mock.ts),`?scene=index|running|steer|approval|multi-agent|diff|settings` + `?theme=dark|light`;快捷键全接(⌘B/⌘I/⌥⌘S/⌥⌘P/Esc/y/a/n/p);交互全部复刻 prototype(补全菜单键盘导航、队列引导、弹层互斥与持久化、分栏钻取、右键菜单、置顶、过滤、主题)
4. **新增文件登记**:`web/codex.html` 与 `web/src/codex-demo/` 是验收沙箱(非产品),官方文件零改动(PATCHES.md 无需新增)

**契约外补充(props/emit,均为 additive,请 ZCode 追认)**:
- Composer:`builtin`/`skills`/`files`/`sessionTitle`/`placeholder`;ThinkingBlock:`duration?`;ApprovalCard:`cwd?`;DiffLines:`highlight?`;FileMenu:`workspaceRoot?`;AgentPanel:`open?` + `(e:'close')`;AgentTranscript:`ask?`;Sidebar:`pinnedIds?` + `(e:'open-settings')`;WorkspaceGroup emits(select-session/toggle-pin/set-sort);ThreadMenu emits(pin/open-side-task);SubagentCard 保留 `.sa-status` 文案;ContextMeter `open-detail` 触发时机=打开详情卡时
- 已知类型修正:types/codex.ts 里 `PermissionMode` 是 import 未 re-export(组件从 `../types` 直接引)

**留给 ZCode 的问题(轮次 3 前后处理)**:
1. `DiffViewProps.hunks` 单数组撑不起多文件(ReviewPane 已有 hunksByFile),建议改 Record 或补 select-file emit
2. `Subagent` 缺耗时字段(ap-time 未渲染),建议加 `elapsed?: string`
3. `useTheme` 无 'system' 档(设置页「跟随系统」只能解析一次)
4. `.ap-head` 类名在 conversation.css 与 settings.css 冲突(沿用自 prototype,暂未动)
5. `App.vue` 仍待 provide `KIMI_CLIENT_KEY`;useHotkeys 是 capture 相,SlashMenu 等 bubble 相 Esc 可能被全局 Esc 抢先,轮次 3 定分层顺序
6. 弹层的模型/权限持久化目前在组件内 localStorage,轮次 3 接 daemon 后替换为 client 数据源

**下一步**:ZCode 轮次 3(协议 wire-up + Tauri 系统集成)
**给 ZCode 的提醒**:
1. 组件零 mock,验收沙箱数据全在 `codex-demo/mock.ts`;接真源时对照该文件的数据形状喂 props
2. 验收方式(HANDOFF 5.2):`cd web && pnpm dev` → `localhost:5175/codex.html?scene=X` 与 prototype 并排对比
3. 轮次 1.2 的应修 6–8(notification 权限 / Tauri 模块 / App.vue provide)即轮次 3 内容,别忘了

## 待用户操作

把 `HANDOFF.md`(含轮次 2 日志)转给 ZCode:追认契约外补充,处理「留给 ZCode 的问题」,开始轮次 3(协议 wire-up + Tauri 系统集成)。
