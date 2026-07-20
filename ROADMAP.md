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

## 留给 kimi3 域（组件行为/UI，ZCode 无法直接改）

| 功能 | 说明 | 原因 |
|------|------|------|
| uploadImage | Composer 附件拖拽/粘贴 | 需改 Composer 组件内部 |
| reorderQueue | QueuePanel 拖拽重排 | 需改 QueuePanel 组件内部 |
| split diff / 词级 diff | DiffLines 左右并排 | 需改 DiffLines 组件内部 |
| ConversationPane loadMore 边界 | daemon 初始 <50 条时按钮不显示 | 小概率边界 |
| SideTask 迷你 Composer 视觉 | 当前用原生 input | 后续做 codex 风格组件 |

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

