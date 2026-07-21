# Kimi GUI 静态原型 v2

> 确认交互方向的原型,**不是最终产品**。基于 Codex 桌面 App 风格 + Kimi 功能集。
> v2 为全量视觉重做:内联 SVG 图标体系(无 emoji)、透明度中性色 token、原生系统字体栈。

## 如何查看

```bash
cd /Users/liujun/project/kimi-gui/prototype
python3 -m http.server 5180
```

浏览器打开 `http://localhost:5180/`。

- 右下角 **「原型 v2」chip**:点击展开 7 页导航(默认收起,避免遮挡 Composer)
- chip 展开后的 **☾/☀ 按钮**:切换浅色/深色主题(localStorage 记忆)
- 也可用 URL 参数指定主题:`index.html?theme=dark`

## 7 个场景

| 页面 | 验证什么 |
|------|---------|
| [`index`](index.html) | 主对话空闲态 —— 完整骨架 + 思考折叠 + TodoCard + Inspect 右栏(⌘I) |
| [`running`](running.html) | **核心**:agent 运行态 —— Composer 双模(排队/插话)+ 队列指示器与面板 + 思考流式 |
| [`steer-feedback`](steer-feedback.html) | steer 后的反馈:气泡"已插话" + 思考块顶部"用户引导"标记 + 队列展开态 |
| [`approval`](approval.html) | 审批内联卡(不阻塞 Composer)+ 单键 y/a/n/p + mini diff 着色 |
| [`multi-agent`](multi-agent.html) | 多 agent 并行 —— 子 agent 卡片 + 父子嵌套 + 状态点 + 进度条 |
| [`diff`](diff.html) | Diff 语法高亮 + 折叠 hunk(点击展开)+ Review pane(⌘B,文件 chip 切换) |
| [`settings`](settings.html) | 设置 —— 6 个真实分类(通用/外观/权限/快捷键/归档/关于)+ 归档管理 |

## 已确认的交互决策

| 决策点 | 方案 |
|-------|------|
| 主布局 | Codex 两栏(左 Project+Threads / 右对话流+Composer) |
| 思考展示 | 内联折叠 + 顶栏全局开关 + 流式中自动展开;全局关 = 全部折叠(含流式);**流式自动跟随最新,用户上滚暂停跟随 +「↓ 最新」回跳** |
| 审批 | 内联卡不替换 Composer + 单键 y(批准)/a(本会话)/n(拒绝)/p(反馈) |
| steer/queue | Composer 双模分段控件(插话=warning 黄/排队=中性)+ steer 后反馈气泡 |
| 归档 | 不进侧栏,在设置里管理(与 Kimi/Codex 一致) |
| 右侧面板 | Inspect(⌘I,线程/思考/工具/任务)+ Review pane(⌘B),Esc 关闭 |
| 模型与思考 | Composer 右侧 pill 弹层:模型列表(K2.7 Coding / K2.7 Coding Highspeed / K3)+ 思考深度 Low/High/Max;**顶栏「思考」开关管展示,弹层管深度,是两个控制** |
| 队列 | 每条排队消息带「引导」按钮(对齐 Codex):转 steer 立即插话;hover 出编辑/删除 |
| 侧边任务 | 标题 ⋯ 菜单 → 打开侧边任务(⌥⌘S):右侧真分栏,独立对话流 + 迷你 Composer |
| 上下文与额度 | Composer 右侧用量环(按用量变色)→ 点击弹详情卡:会话/模型/思考/权限/上下文/状态 + 5h 与每周额度(跟随页面实时状态) |
| 子智能体 | 对话流卡片 = 发起锚点 + 实时态;右侧面板 = 管理 + 完成历史(已开启/完成 · N);**点卡片或面板行 → 钻取该 agent 的完整 transcript 分栏**(复用侧边任务形态) |
| TodoCard | 无头衔浮动卡(对齐 Codex):条目可换行、完成态灰色不划线;下方轮次进度条「第 N/M 步 · 文件改动 +x −y」 |
| 文件右键菜单 | diff 区域右键:在 IDE 打开 / 打开方式(二级)/ 复制所选/路径/相对路径(真实写剪贴板)/ 切换自动换行(真实切换) |
| 斜杠命令 `/` | Composer 打 `/` 弹出命令浮层:**内置 15 条(写死)+ Skills 分组(标 isSkill/tag)**;模糊过滤、↑↓+Enter、acceptsInput 留参、其余直接执行 |
| 文件提及 `@` | 同一补全组件换数据源:打 `@` 模糊搜文件,选中插入 |
| 权限三档 | perm-pill 弹层:逐条确认 / 自动通过(琥珀)/ 完全自主(红),对齐官方语义 |
| 模式开关 | Composer 模式 pill:计划 / Swarm / 目标开关行,激活模式显示在 pill 标签上 |
| 侧栏 | 状态过滤 chips(全部/运行中/待审批,零匹配项目自动隐藏 + 空态提示)+ 置顶当前线程(任务菜单或 ⌥⌘P);品牌区左移 76px 预留 macOS 交通灯 |
| 发送 | Composer `Enter` 发送(`Shift+Enter` 换行;⌘+Enter 同效):空闲态追加气泡,运行态按模式进队列/转插话 |
| 账号 | 侧栏底部账号行(jun):账号菜单(设置/切换/退出)+ 未登录态 + 登录弹窗(浏览器授权流程模拟) |

## 数据来源与 mock 标注(勿在 Vue 落地时写死)

| 数据 | 真实来源 | 原型 |
|------|---------|------|
| 斜杠命令 - Skills | `GET /sessions/{id}/skills` + `/workspaces/{id}/skills` | mock 3 条,带 `isSkill` 标记 |
| 模型列表 | daemon 返回(不同账号不同) | 写死 K2.7/K3,代码有注释 |
| 思考深度档位 | daemon 支持度待验证(spec 6.7.4) | Low/High/Max 为推测 |
| 权限三档 | daemon `set_mode` 待验证(spec 6.7.4) | mock 三档 |
| 工作区 / Threads | `GET /workspaces` / `GET /sessions` | mock 写死在 HTML |

## 全局快捷键(原型已实现)

`⌘K` 搜索(展示)/ `⌘B` Review pane / `⌘I` Inspect / `⌥⌘S` 侧边任务 / `Esc` 关闭浮层 / `y·a·n·p` 审批

## 演示用 URL 参数

`?theme=dark|light` 指定主题;`?pop=model|queue|side|menu|ctx|agents|transcript|filemenu|slash|at|perm|mode|login` 页面加载后直接展开对应浮层;`?filter=running|waiting` 页面加载后应用侧栏筛选。

## 反馈方式

看完后直接告诉我:
- "这个按钮太大/小"
- "颜色不对"
- "这个交互我觉得应该是 XX 样"
- "再加一个 XX 场景"

改静态原型是分钟级,改 Vue 是小时级,所以现在多迭代。

## 不做的事

- ❌ 不接真实 daemon(全 mock 数据)
- ❌ 不做移动端(桌面优先)
- ❌ 不做真实流式(静态展示状态)
- ❌ 不写 Vue(纯 HTML/CSS/JS)

## 文件结构

```
prototype/
├── index.html / running.html / steer-feedback.html
├── approval.html / multi-agent.html / diff.html / settings.html
├── styles/
│   ├── tokens.css       设计 token(颜色/字号/间距,浅+深双主题)
│   ├── base.css         基础布局 + 滚动条 + 通用组件 + 原型导航条
│   ├── sidebar.css      左栏 Project+Threads
│   ├── conversation.css 对话流 + 气泡 + TodoCard + 子Agent卡
│   ├── thinking.css     思考折叠/流式/全局开关 + steer 标记
│   ├── composer.css     Composer + 双模分段 + 队列指示器/面板 + steer 反馈
│   ├── approval.css     审批卡(shell/diff/plan 三种 body)
│   ├── diff.css         Diff 高亮 + 折叠 hunk + Review pane
│   ├── detail.css       Inspect 右栏
│   └── settings.css     设置页 + 归档管理
└── mock/
    └── shared.js        原型导航 + 主题切换 + 全部交互模拟(原型专用)
```
