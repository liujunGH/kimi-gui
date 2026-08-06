# Kimi Code 官方能力整合矩阵

> 基线：`@moonshot-ai/kimi-code@0.33.0` 与 2026-08-06 的
> `origin/main`（commit `3c75a27d`，含 cache-expiry hint）。正式版能力才作为最低兼容承诺；main 中尚未发布的能力标为 🧪。

这份文档是功能治理清单，不是一次性的竞品笔记。每次 Kimi Code 发布后，应先更新基线和本表，再决定 GUI 入口、契约与验收用例，避免只按命令名称追功能。

## 判定规则

| 标记 | 含义 |
|---|---|
| ✅ | 已有完整 GUI 入口，且使用公开 daemon/REST/WS 契约或明确的官方数据格式 |
| 🟡 | 可用，但交互、可见信息或契约仍不完整 |
| ⬜ | 官方已有、GUI 尚未整合，且值得进入产品 |
| ⛔ | 有意保留在 TUI/开发工具，不在 GUI 复制 |
| 🧪 | 只在上游 main，等待正式发布后接入 |

整合原则：高频且适合可视化的能力进入 GUI；终端生命周期、编辑器接管和开发调试命令不为了“数量齐全”硬做按钮。优先使用 daemon 公共契约，其次在应用内承载官方交互；不复制官方内部状态，不用重启 daemon 冒充缺失的会话 API。

## 1. 启动、账户与发现

| 官方能力 | 来源 | 当前状态 | GUI 位置 / 决策 |
|---|---|---:|---|
| 语言、主题、基础引导 | Web | ✅ | 首次启动引导；设置中可再次打开 |
| Kimi 登录、状态、登出、刷新 | TUI / Klient / daemon | ✅ | 左下账户与设置 |
| OAuth 设备码流程 | daemon | ✅ | 应用内登录弹窗，不跳出 CLI |
| 未配置模型时的可恢复引导 | Web / daemon | 🟡 | 已有诊断与 Provider 入口；继续收敛错误文案 |
| CLI/daemon 版本检查与升级 | GUI 扩展 | ✅ | 设置 → Kimi Engine；只允许 0.33+ |
| 更新检查与应用内更新 | GUI 扩展 | ✅ | 设置与全局更新弹窗 |
| 官方反馈入口与诊断附件 | TUI / Web | ✅ | `/feedback` 应用内说明，可先导出当前会话诊断包或直接打开官方 Issue |
| Capabilities 安装/管理（含 Computer Use） | Klient / main | 🟡 | 设置 → Capabilities；应用内承载官方 `/plugins`，公共 REST 出现后再升级为原生状态表格 |

## 2. 工作区

| 官方能力 | 来源 | 当前状态 | GUI 位置 / 决策 |
|---|---|---:|---|
| 添加、重命名、移除、复制路径 | Web / daemon | ✅ | 侧栏工作区菜单 |
| 原生目录选择与 daemon 目录浏览 | daemon / GUI | ✅ | 添加工作区弹窗 |
| 工作区信任 / 取消信任 | daemon | ✅ | 侧栏工作区菜单；显式展示状态并说明项目级 MCP 影响 |
| 附加目录（`/add-dir`） | TUI / config | ✅ | 设置 → 工作区目录；带路径时确认后持久化 |
| 空工作区与失效 worktree 检测清理 | GUI 扩展 | ✅ | 数据与维护 |
| 工作区 pin、emoji、排序 | Web | ✅ | 侧栏工作区菜单、拖拽排序；图标/置顶仅存本机界面偏好 |
| 拖入文件夹添加工作区 | Web / desktop | ✅ | 桌面窗口原生拖放；只接收目录并显示覆盖提示，不抢文件附件 |

## 3. 会话与数据生命周期

| 官方能力 | 来源 | 当前状态 | GUI 位置 / 决策 |
|---|---|---:|---|
| 新建、打开、重命名、置顶 | Web / daemon | ✅ | 侧栏与顶部任务菜单 |
| 运行中 / 待审批筛选 | Web / daemon | ✅ | 侧栏筛选 |
| 全局会话搜索与键盘导航 | Web / daemon | ✅ | `⌘K` |
| 分叉会话 | TUI / Web / daemon | ✅ | 任务菜单；分叉后保留原会话活动 |
| 归档、恢复、永久删除 | Web / daemon | ✅ | 侧栏菜单与设置 → 归档 |
| 归档批量删除、失效会话一键清理 | GUI 扩展 | ✅ | 设置 → 归档与导入 |
| 导出 daemon 完整归档 ZIP | daemon | ✅ | 任务菜单 |
| 导出本地 Markdown | TUI / Web | ✅ | 任务菜单与 `/export-md` |
| 复制全部对话为 Markdown | Web | ✅ | 顶部任务菜单 |
| 仅复制最终总结 | Web | ✅ | 顶部任务菜单 |
| 复制 Session ID | Web | ✅ | 侧栏右键菜单 / 命令入口 |
| 进入历史会话默认定位到底部 | Web | ✅ | 对话视图；尊重用户主动上翻位置 |
| 加载更早消息、跳到最新 | Web / daemon | ✅ | 对话顶部与悬浮返回底部按钮 |
| 会话表格视图、排序与批量处理 | daemon `/api/v1/sessions` | ✅ | 设置 → 任务中心；结果按批次渲染，不挤主侧栏 |
| 历史迁移、备份/恢复与直接清理选择 | GUI 扩展 | ✅ | 设置 → 归档与导入 |

## 4. 编辑器、运行模式与命令

| 官方能力 | 来源 | 当前状态 | GUI 位置 / 决策 |
|---|---|---:|---|
| 文本、图片、文件附件 | TUI / Web / daemon | ✅ | 输入框 |
| 模型、推理强度、主/次模型 | TUI / Web / daemon | ✅ | 输入框快捷选择 + 设置 |
| Manual / Auto / YOLO 权限模式 | TUI / Web / daemon | ✅ | 输入框模式条 |
| Plan、Swarm | TUI / daemon | ✅ | 输入框模式条与状态展示 |
| 提示词排队、编辑、删除、插话 steer | TUI / daemon | ✅ | 输入框上方队列 |
| BTW 侧聊 | TUI / daemon | ✅ | 侧边任务面板 |
| Skills 与斜杠命令补全 | TUI / daemon | ✅ | 输入框补全与 `/help` |
| 40 个 0.33 内置命令的分类映射 | TUI 源码 | ✅ | `docs/commands.md`；构建时完整性校验 |
| `/reload` 会话重载 | TUI / SDK 内部 RPC | 🟡 | GUI 显示契约限制；公开 REST 出现后直接接入 |
| Goal 创建、暂停、恢复、取消 | TUI / daemon | ✅ | 对话目标条与 `/goal` |
| Goal 后续队列 | TUI / SDK 内部 RPC | 🟡 | 不维护影子队列；等待公开契约 |
| `/editor`、`/reload-tui`、`/web`、TUI theme | TUI | ⛔ | 依赖终端/编辑器生命周期，保留为 TUI-only |
| `/exit`、`/version` 等终端命令 | TUI | ⛔ | GUI 用原生窗口/关于页承载，不重复成按钮 |

## 5. 对话呈现、工具与 Review

| 官方能力 | 来源 | 当前状态 | GUI 位置 / 决策 |
|---|---|---:|---|
| 流式文本、Markdown、代码、KaTeX、Mermaid | Web / WS | ✅ | 对话流；重型渲染延迟加载 |
| 思考折叠、工具卡、耗时与结果 | TUI / Web / WS | ✅ | 对话流 |
| 权限审批与问题交互 | TUI / Web / daemon | ✅ | 对话内联卡片与弹层 |
| 用户本机时区时间 | Web | ✅ | 消息、活动与诊断统一本地化 |
| Undo 与撤销边界预览 | TUI / daemon | ✅ | `/undo` 与选择弹窗 |
| 手动/自动压缩与压缩摘要 | TUI / Web / daemon | 🟡 | 已能压缩并显示事件；摘要的独立视觉层次继续优化 |
| cache-expiry 长闲置提示 | main client config | ✅ | 发送前保守提示压缩/新任务/继续/不再提醒；只匹配官方已知模型规则 |
| 文件预览、打开、Reveal、外部应用 | Web / daemon | ✅ | 右侧详情面板 |
| Git 状态、Diff、Review | Web / daemon | ✅ | 顶部 Review 与详情面板 |
| 集成终端 | Web / daemon | ✅ | 顶部终端按钮打开底部抽屉；复用运行中终端、支持适配/结束/新建/收起 |
| UTF-16 文件读取 | main | 🧪 | daemon 正式发布后随契约自动获得，补回归用例 |

## 6. 后台任务与子智能体

| 官方能力 | 来源 | 当前状态 | GUI 位置 / 决策 |
|---|---|---:|---|
| 后台任务列表、状态、取消 | TUI / Web / daemon | ✅ | 顶部全局任务面板，跨会话聚合；面板关闭即停止轮询 |
| 子智能体完整活动、回复、时间线 | TUI / Web / daemon | ✅ | 子智能体详情 |
| 子智能体实际模型 | daemon 运行时 | ✅ | 详情头部优先显示运行时模型 |
| 搜索、状态筛选、长输出展开 | GUI 扩展 | ✅ | 子智能体面板 |
| 恢复后 lastTurn 与活动视图一致 | 0.33 daemon | ✅ | 已验收归档→恢复→继续消息；0.33 运行中恢复需按应用提示重启 Engine 后续跑原会话 |
| 子智能体层级 / 父子跳转 | daemon | ✅ | 面板展示主任务根节点、父工具调用、Swarm 索引与所属会话定位 |
| 任务产物与文件变更聚合 | Web / daemon | 🟡 | 详情显示当前主任务变更并明确“非单个子智能体归因”；等待 daemon 提供 agent 级归因 |

## 7. 模型与 Provider

| 官方能力 | 来源 | 当前状态 | GUI 位置 / 决策 |
|---|---|---:|---|
| Provider 列表、创建、编辑、删除 | daemon | ✅ | 设置 → 模型与 Provider；密钥不回显 |
| 默认模型与完整模型能力 | TUI / daemon | ✅ | 模型选择器与 Provider 编辑 |
| 远程模型发现与单个/全部刷新 | daemon | ✅ | Provider 管理 |
| models.dev 目录浏览与搜索 | daemon 0.33 | ✅ | Provider 管理；服务端缓存与离线快照 |
| models.dev 一键导入 | daemon 0.33 | ✅ | Provider 管理；API Key 可选、无需重启 |
| 私有 Registry 批量导入 | daemon 0.33 | ✅ | Provider 管理；Bearer Key 可选、无需重启 |
| rejected / needs_base_url / env_key 等导入元数据 | daemon 0.33 | ✅ | 目录卡片与表单校验 |
| OAuth 管理型 Provider 只读保护 | daemon | ✅ | Provider 详情 |
| Provider 连接测试与远程模型刷新 | TUI / discovery | ✅ | Provider 行内“测试并刷新”；成功有明确反馈，失败沿用 daemon 细分原因 |

## 8. Plugins、Skills、MCP、Agents 与 Hooks

| 官方能力 | 来源 | 当前状态 | GUI 位置 / 决策 |
|---|---|---:|---|
| Skills 查看、激活、额外目录 | TUI / daemon | ✅ | 设置 → 插件与 Skills |
| Plugins 安装、市场、启停、删除、重载 | TUI / Klient | 🟡 | 应用内承载官方 `/plugins` TUI；等待稳定公共 REST 后改成原生表格/详情 |
| 插件 MCP 开关与状态 | TUI / Klient | 🟡 | 同上，不维护影子状态 |
| MCP 服务列表、工具、重启 | TUI / daemon | ✅ | 设置 → MCP 服务 |
| MCP OAuth 授权 | daemon | ✅ | 校验 HTTP(S) 后打开系统浏览器 |
| Agent 配置与固定 Agent | TUI / config | ✅ | 设置 → Agents，输入框显示当前 Agent |
| Hooks 查看与编辑 | TUI / config | ✅ | 设置 → Hooks |
| 权限规则与工具控制 | TUI / config | ✅ | 设置 → 权限与工具 |

## 9. 状态、性能与桌面能力

| 官方能力 | 来源 | 当前状态 | GUI 位置 / 决策 |
|---|---|---:|---|
| OAuth 额度、上下文用量、运行状态 | TUI / daemon | ✅ | 顶部状态与设置 |
| 通知、审批/问题通知、声音 | Web | ✅ | 设置 → 外观与通知 |
| daemon 断线恢复、静默半开重连 | Web / WS | ✅ | 后台自动恢复，顶部仅显示有行动价值的状态 |
| 长列表渐进渲染、消息窗口化 | GUI 扩展 | ✅ | 侧栏与对话流 |
| Markdown worker 与重型模块延迟加载 | GUI 扩展 | ✅ | 性能基础设施 |
| macOS 原生窗口拖动、双击缩放 | GUI 扩展 | ✅ | 顶栏 |
| Windows 启动不弹 Web 页面 | GUI 扩展 | ✅ | daemon 使用 `--no-open` |
| 工作区顺序与 UI 状态跨重启恢复 | Web | ✅ | 手动顺序、置顶与图标均持久化到本机界面偏好 |
| Agent / background / MCP / image 性能参数 | TUI config | ✅ | 设置 → 运行与性能；原子保留式 TOML 写入、范围校验与三种预设 |

## 10. 不进入产品 GUI 的上游表面

| 能力 | 决策 |
|---|---|
| `acp`、隐藏插件 runner、`vis`、kimi-inspect 开发页 | ⛔ 开发/诊断工具，不作为普通用户功能 |
| `reload-tui`、TUI theme、终端 editor 接管 | ⛔ 属于 TUI 生命周期 |
| daemon debug 路由和内部 session RPC | ⛔ 不把私有契约固化进 GUI |
| 上游 Web 的实现细节和内部状态缓存 | ⛔ 只复用产品行为与公开契约，不复制脆弱状态 |

## 下一批实施顺序

1. **P0 已完成**：Provider 目录/Registry 直连 REST、无重启导入、会话复制全部/最终总结。
2. **P1 已完成**：工作区 emoji/pin/排序；工作区信任状态；应用内终端入口与恢复。
3. **P2 已完成**：子智能体父调用导航、跨会话后台任务面板与主任务产物视图。
4. **本轮已完成**：`/api/v1/sessions` 任务中心、cache-expiry 提示、运行性能配置与 Capabilities 应用内入口。
5. **随上游发布**：UTF-16 文件读取、Capability 公共 REST、agent 级文件归因与 activity restore 修复。

每一阶段都按“契约测试 → 类型/单测 → 浏览器交互 → 桌面包验收”通过后再进入下一阶段。
