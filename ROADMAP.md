# kimi-gui 迭代路线图

> 本文档是**未来迭代待办**,不是历史执行记录(历史进展见 `CHANGELOG.md`)。
> 待办来源主要是 `docs/upstream-capabilities.md` 中尚未整合(⬜)、可用但契约不完整(🟡)和等待上游发布(🧪)的项。
> 最终进展以 `CHANGELOG.md` 为准。

## 当前状态

已发行 **1.0.16**(2026-08-06),核心对话/任务/Agent/Provider/插件能力齐备,Mac + Windows 双平台发行链路已打通。

**上游同步状态(2026-08-29 核实)**:官方 Kimi Code 已发布到 **0.39.1**(0.34~0.39 共 7 版),GUI 契约实现基线仍为 0.33.0。官方自 0.33 起移除了 `apps/kimi-web` 源码,`web/` 为独立代码库;0.33→0.39 契约变更全部向后兼容(唯一例外:0.39 `/auth` 的 `ready`→`models_ready` 改名已做跨版本 fallback),**不跟不会坏,跟了吃新能力**。例行同步方法见 `AGENTS.md` 3.5。

---

## P0:0.33 → 0.39 契约同步 + 特性整合(已完成,2026-08-29)

协议层与 UI 消费均已合入(typecheck/737 单测/cargo 16 测试/commands:check 全绿):

- ✅ 子智能体 spawn 权威 model/thinkingEffort/taskId(AgentPanel 展示模型已自动生效)
- ✅ `event.plugin.changed` / `event.capability.changed`:设置页工具列表实时刷新 + 能力安装进度条与完成通知
- ✅ Skill 激活附件:Composer 带附件发 `/命令` 不再丢弃(修复了有附件时命令被降级为普通 prompt 的问题)
- ✅ MCP status `removed` 枚举
- ✅ `max_context_tokens` 等 optional 化(usage 归一)
- ✅ prompt_id 提交/回显绑定
- ✅ **Engine 环境实验开关**(设置 → 引擎):tower / remote-control 开关,持久化在 `~/.kimi-code/kimi-gui-experiments.json`,daemon 启动自动注入 env,重启生效
- ✅ **任务「移到后台」**:AgentPanel 运行行 `task:detach`(0.39)
- ✅ **path 零拷贝附件**:拖文件进窗口直接作为本地路径附件(免上传);队列/steer/skill 链路全通
- ✅ **工具门控**:设置 → 权限与工具,`[tools]` enabled/disabled 编辑
- ✅ **自定义 Agent 目录**:设置 → Agents,`extra_agent_dirs` 编辑
- ✅ 命令基线 42(`/secondary-model` 改名、`/tower`、`/remote-control` 归 TUI-only)
- ⬜ WaitFor 工具卡中文文案:toolMeta/i18n 是官方 fork 层(锁),未知工具 fallback 显示原名;待官方 toolMeta 更新后随上游同步
- ⬜ fsSuggest(`suggestFiles` 协议方法已备):@ 菜单现走 fs:search 已可用,切换 suggest 属优化项
- ✅ 次级模型详细配置:模型池(别名→模型,主 Agent 派发时挑选)+ 强制路由(0.36+ `[secondary_model]` models/force);模型选择器过滤 `__` 内部派生条目

| 项 | 版本 | 说明 |
|---|---|---|
| 子智能体 `model`/`thinkingEffort`/`taskId` | 0.34/0.38 | 权威字段替换现在的主/次模型推导 |
| `event.plugin.changed` / `event.capability.changed` | 0.35-0.37 | Capabilities/插件页实时刷新,替换手动刷新 |
| Skill 激活 `attachments` | 0.34 | `/命令` 带附件不再被 daemon 丢弃 |
| MCP status `removed` 枚举 | 0.34 | MCP 面板状态映射 |
| `ToolUpdate.replace` | 0.37 | 周期性状态原地替换,防"仍在工作"刷屏 |
| `TurnEnded.interruptReason` / 会话 `last_turn_reason` / `archived_at` | 0.35-0.37 | 失败/取消精确展示、归档时间 |
| `max_context_tokens` 等转 optional | 0.34+ | 用量环/会话用量健壮性 |
| prompt `prompt_id` + `turn.started.promptId` | 0.37 | 提交与轮次精确绑定(40927 冲突码) |
| `UserPromptOrigin.skillActivations`(一轮多 skill) | 0.37 | 多 skill 打包激活 |
| fs `suggest` 端点 | 0.37 | @ 文件菜单模糊建议 |
| UTF-16 文件读取 | 0.34 | 官方已发布(曾标 🧪),文件预览按文本显示 |
| **命令基线**:`/secondary-model`(别名 `subagent-model`) | 0.38 | 更新快照 + GUI 映射;次模型改走 `[secondary_model]` 配置(`applyPersistedSecondaryModel` API 已移除) |
| **任务转后台**:`POST tasks/{id}:detach` | 0.39 | 运行卡"移到后台"按钮(协议层 detachTask 已备) |
| **path 零拷贝附件**(image/file 的 `path` 源,desktop 专用) | 0.39 | Composer 拖入本地文件免上传直传路径(协议层变体已备) |
| **tower 模式**(`tower_mode` 字段 + `/tower` 命令) | 0.39 | 实验多 agent 编排;模式条入口(命令暂 TUI-only) |
| `/remote-control`(别名 `rc`,实验远程访问) | 0.39 | 暂 TUI-only;GUI 入口待官方稳定 |

⚠️ 上游 main 未发布变化(下版本跟):正在移除 perm/thinking 相关命令;MCP 管理 REST 仍在演进(readiness/cwd)。

## 契约完善(🟡 可用,待公开契约就绪后补全)

| 能力 | 现状 | 目标 |
|---|---|---|
| `/reload` 会话重载 | 🟡 GUI 显示契约限制 | 公开 REST 出现后直接接入 |
| Goal 后续队列 | 🟡 不维护影子队列 | 等待公开契约 |
| 压缩摘要独立视觉层次 | 🟡 已能压缩并显示事件 | 摘要的独立视觉层次继续优化 |
| Plugins 安装/市场/启停 | 🟡 内嵌官方 `/plugins` TUI | 稳定公共 REST 后改成原生表格/详情(0.37 已让 MCP 变更对开放会话立即生效,REST 仍在演进) |

## 待整合(⬜ 官方已有、GUI 尚未做)

依赖 daemon 端点验证后再决定是否进产品:

| 能力 | 阻塞点 |
|---|---|
| 自定义 Markdown Agent + `[tools]` 工具门控配置入口 | protocol 0.5.0 已定义;设置页 Agents/权限分区加 UI |
| WaitFor 工具卡 | 0.38 新工具,GUI 工具卡识别 |
| skill 激活轮撤销重发 | 0.38 web 行为,按需移植 |
| Git Worktree 隔离(多 agent 独立工作区)| 需 daemon 端点验证 |
| cron 自动化 | main 正在 featurize todo/cron,等稳定 |

## 整合原则(决定什么进 GUI)

- 高频且适合可视化的能力进 GUI;终端生命周期、编辑器接管、开发调试命令不为"齐全"硬做按钮
- 优先用 daemon 公共契约,其次应用内承载官方交互
- 不复制官方内部状态,不用重启 daemon 冒充缺失的会话 API
- 官方 web(独立 code-app 仓库)的交互仅作**行为参考选择性移植**(如 mobile UI、region 登录不在目标内)
- 每一阶段按「契约测试 → 类型/单测 → 浏览器交互 → 桌面包验收」通过后再进入下一阶段
