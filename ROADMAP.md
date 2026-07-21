# kimi-gui 功能补全路线图

> 状态:0.1.1 已发行(2026-07-21);下方清单为历史执行记录,最新进展以 HANDOFF.md 为准。
> 最终更新:2026-07-20
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
- split/词级 diff（DiffLines：词边界裁剪 + 词 LCS + 双栏视图）
- SideTask 迷你 Composer（v-model + send + running）
- AgentPanel/SubagentCard 取消按钮（→ client.cancelTask）
- ConversationPane ResizeObserver 滚锚
- 附件 chip 样式（composer.css）

## kimi3 待办清单（2026-07-20 最终版）

> ZCode 已把所有能做的 client API 全部接通（39 项）。
> ~~原 5 项纯组件待办~~ **全部完成（轮次 5，2026-07-20）**：
>
> 1. ✅ **split diff / 词级 diff**（`DiffLines.vue`）— 词边界公共前后缀裁剪 + 中段词 LCS；unified/split 双视图；审批卡 mini diff 自动隐藏切换条
> 2. ✅ **SideTask 迷你 Composer**（`SideTask.vue` / `CodexApp.vue`）— codex 风格 Composer，v-model + Enter 发送 + running 禁用
> 3. ✅ **AgentPanel 取消任务按钮**（`AgentPanel.vue` / `SubagentCard.vue`）— 仅 working 显示 stop → emit cancel → `client.cancelTask`
> 4. ✅ **ConversationPane 滚动锚定**（`ConversationPane.vue`）— ResizeObserver 观察内容/视口尺寸，贴底自动跟随
> 5. ✅ **附件 chip 样式**（`composer.css`）— 翻译自官方 `chat/AttachmentChip.vue` scoped（官方样式不在 style.css，在其组件里）

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

