# kimi-gui 功能补全路线图

> 最终更新：2026-07-20
> 基于 ZCode 全量核对官方 App.vue + 设计文档 spec。

## 已完成（ZCode 做的）

### 核心功能（26 项）
发消息/steer/queue / 斜杠命令 / 模型切换+思考强度 / 权限切换 /
模式(plan/swarm/goal) / 审批闭环 / 重命名/归档/分叉/导出 /
Markdown(markstream-vue) / 思考折叠+流式 / diff+ReviewPane /
@文件搜索 / 队列编辑 / ConversationToc / 文件路径预览 /
工作区管理(add/rename/delete) / DetailPane(⌘I) / SideTask(⌥⌘S) /
quota(PTY抓取) / context用量 / resolveImage /
全局唤起(⌘⌥N) / 关窗到托盘 / 设置页接client / 排序持久化 / onboarding

### 批次补全（ZCode 做的）
- QuestionCard（agent 提问卡）
- GoalStrip（目标条 + pause/resume/cancel）
- compaction 分隔线（/compact 后）
- warnings 警告提示 + dismissWarning
- Dock badge（未读数 → invoke set_dock_badge）
- cancelTask 函数
- SideTask 迷你 Composer（sendSideChatPrompt）
- loadOlderMessages（官方分页 + 本地窗口化）
- Cmd+K 搜索会话（官方 SearchSessionsDialog）
- loadAllSessions

### kimi3 做的
- 32 组件实现 + 视觉
- ConversationPane 窗口化（50 条分页 + 前插视口保持）
- quota PTY 抓取（usage.rs）
- 审批闭环（approvalMapper）
- diff/ReviewPane 数据流（diffMapper）
- @文件树（fs:search）
- editQueued

## kimi3 待办清单（2026-07-20 最终版）

> ZCode 已把所有能做的 client API 全部接通（39 项）。
> 以下是纯组件行为/UI 改动，需要 kimi3 在 `web/src/components/codex/` 下改：

### P1（影响体验）

1. **split diff / 词级 diff**（`DiffLines.vue`）
   - 当前只支持 unified diff（单栏 +/- 行）
   - 需要：加 split 模式（左右并排 old/new），按文件类型做词级 diff
   - spec 编号：F6/F7（P2，但用户高频看 diff）
   - 参考：GitHub PR diff 的 split view

2. **SideTask 迷你 Composer 视觉统一**（`SideTask` slot 内容 / `CodexApp.vue`）
   - 当前用原生 `<input>` 元素，跟 codex Composer 风格不一致
   - 需要：做一个 codex 风格的迷你 Composer 组件（圆角 + toolbar + 发送按钮）
   - 数据已接通（`onSideChatSend` → `client.sendSideChatPrompt`），只需换 UI

3. **AgentPanel 取消任务按钮**（`AgentPanel.vue` / `SubagentCard.vue`）
   - 子 agent 卡住时没有停止按钮
   - ZCode 已声明 `onCancelTask(taskId)` 函数（调 `client.cancelTask`），但没接 UI
   - 需要：SubagentCard 加一个 stop 按钮（仅 running 状态显示）→ emit cancel → CodexApp 调 onCancelTask

### P2（锦上添花）

4. **ConversationPane 滚动锚定细节**（`ConversationPane.vue`）
   - 新消息追加时 `maybeFollow` 的 nextTick 时机偶尔不准（快速连续消息时视口抖动）
   - 需要：用 `ResizeObserver` 或 `MutationObserver` 替代 watch turns.length

5. **附件 chip 样式**（`Composer.vue`）
   - ZCode 加的 `att-strip` / `att-chip` 只有基本结构，没写 CSS
   - 需要：在 `composer.css` 加 `.att-strip` / `.att-chip` / `.att-thumb` / `.att-remove` 样式
   - 参考官方 Composer 的 `.att-strip`（在 `web/src/style.css` 里）

### 已完成（不需要 kimi3 做）

以下之前标记为 kimi3 域的，ZCode 已经做了：
- ~~uploadImage~~ ✅（fd71cf3，Composer paste/drop/file input）
- ~~reorderQueue~~ ✅（fd71cf3，QueuePanel HTML5 drag）
- ~~ConversationPane loadMore 边界~~ ✅（fd71cf3，hasMoreMessages prop）

## 跳过（低优先/需 daemon 支持）

| 功能 | 原因 |
|------|------|
| providers 供应商管理 | 低频，managed provider 已覆盖 |
| OAuth login | daemon token 已覆盖认证 |
| config / updateConfig | 低频 |
| cron 自动化 | 需 daemon 端点验证 |
| Git Worktree 隔离 | 需 daemon 端点验证 |
| session fork 端点 | 需 M0 验证 |
| quota REST 端点 | daemon 无端点（PTY 抓取已替代）|

