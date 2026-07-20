# kimi-gui 功能补全路线图

> 基于 2026-07-20 全量核对官方 App.vue + 设计文档 spec 生成。
> 按"做完一批 → 自检 → 反思 → 继续下一批"推进。

## 批次 1：核心功能缺失（用户一定会碰到）

| # | 功能 | client API | 优先级 | 状态 |
|---|------|-----------|--------|------|
| 1 | QuestionCard 渲染（agent 提问时对话流出卡） | respondQuestion / dismissQuestion | P0 | ⏳ |
| 2 | GoalStrip 目标条显示 | client.goal / controlGoal | P0 | ⏳ |
| 3 | compaction 分隔线 | client.compaction | P0 | ⏳ |
| 4 | cancelTask 取消后台任务 | client.cancelTask | P0 | ⏳ |
| 5 | warnings 警告提示 | client.warnings / dismissWarning | P1 | ⏳ |
| 6 | 侧栏未读数 badge | client.unreadBySession | P1 | ⏳ |

## 批次 2：侧边对话 + 工作区管理

| # | 功能 | client API | 优先级 | 状态 |
|---|------|-----------|--------|------|
| 7 | SideTask 迷你 Composer 接真 sendSideChatPrompt | client.sendSideChatPrompt | P0 | ⏳ |
| 8 | renameWorkspace / deleteWorkspace | client.renameWorkspace / deleteWorkspace | P1 | ⏳ |
| 9 | reorderQueue 队列拖拽重排 | client.reorderQueue | P1 | ⏳ |
| 10 | uploadImage 附件上传 | client.uploadImage | P1 | ⏳ |

## 批次 3：会话加载 + 搜索

| # | 功能 | client API | 优先级 | 状态 |
|---|------|-----------|--------|------|
| 11 | loadOlderMessages 接官方分页 | client.loadOlderMessages | P0 | ⏳ |
| 12 | loadMoreSessions 会话分页 | client.loadMoreSessions | P1 | ⏳ |
| 13 | 搜索会话面板 Cmd+K | client API | P1 | ⏳ |

## 批次 4：设计文档目标（spec P1）

| # | 功能 | spec 编号 | 状态 |
|---|------|----------|------|
| 14 | Git Worktree 隔离 | C8 | ⏳ 需 daemon 支持 |
| 15 | cron 自动化 | G5 | ⏳ |
| 16 | split diff / 词级 diff | F6/F7 | ⏳ |
| 17 | Dock badge 未读数 | G3 | ⏳ |

## 批次 5：Provider/Auth/低优先

| # | 功能 | client API | 状态 |
|---|------|-----------|------|
| 18 | providers 供应商管理 | client.providers | ⏳ |
| 19 | OAuth login | client.startOAuthLogin | ⏳ |
| 20 | config / updateConfig | client.config | ⏳ |

## 无法实现的（记录，跳过）

| 功能 | 原因 |
|------|------|
| quota REST 端点 | daemon 无端点（PTY 抓取已替代） |
| session fork 端点 | 需 M0 验证 daemon 是否支持 |
| Git Worktree 端点 | 需 M0 验证 daemon 是否支持 |

## 反思检查点

每批做完后自检：
1. vue-tsc 全绿？
2. cargo check 0 警告？
3. fork 卫生（官方文件仅 PATCHES 记录的改动）？
4. 冻点未污染？
5. 有没有更好的实现方案？
6. 有没有遗漏的边界情况？
