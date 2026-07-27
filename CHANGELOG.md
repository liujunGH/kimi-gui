# 更新日志

本项目的所有重要变更都会记录在此文件中。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.9] - 2026-07-26

### 修复

- **macOS「已损坏」改为可放行**:Tauri 的 ad-hoc 签名只覆盖主二进制,Info.plist 和资源未 seal,macOS 26 判为损坏;现在打包/CI 都会 `codesign --deep --force --sign -` 完整重签,与 Electron 的 afterSign 行为对齐,Gatekeeper 提示降级为「无法验证开发者」可右键打开

## [1.0.8] - 2026-07-26

### 修复

- **工作区移除/重命名误伤活跃工作区**:侧栏菜单对非活跃工作区操作时,实际作用到了当前活跃工作区;现统一改为按 workspace id 精确定位
- **归档管理显示「归档于 未知」**:读取了不存在的 `archivedAt` 字段,改为 `updatedAt`;加载失败从静默吞掉改为 toast 提示
- **设置页默认权限/默认模型写错地方**:此前改的是当前会话,现改为 daemon 全局配置
- **Tauri 命令丢失**:`invoke_handler` 被二次注册覆盖,导致双击放大、退出应用失效
- **daemon 启动残留多实例**:spawn 超时不杀子进程,可能同时起多个 daemon;现超时 kill 并立即换下一组
- **工作区列表瞬时失败清空**:`loadWorkspaces` 失败时不再覆盖已有注册列表
- **已移除工作区大小写复活**:隐藏路径改用规范化 key 匹配,`C:\Foo` 与 `c:\foo` 视为同一目录
- **cancelTask 误操作**:foreground subagent 的 agent id 不再误发到 REST `/tasks`
- **后台会话 thinking 级别错乱**:prompt/steer/BTW/skill 不再 fallback 到当前活动会话的级别
- **eval 注入面**:token/base 注入 webview 时改用 `serde_json` 转义
- **凭据 sandbox 权限收紧**:Linux `/tmp` 下 sandbox 创建后设 0700

### 加固

- **OAuth 登录对话框**:启动/轮询/取消全部补齐 try/catch,失败不再卡住或产生未处理 rejection
- **审批卡防永久禁用**:改为请求成功后才标记 responded,网络失败可重试
- **daemon 实例扫描**:单个实例文件读取失败不再中断整个扫描
- **scrape 线程 panic 保护**:`SCRAPE_RUNNING` 不再因 panic 永久卡住

## [1.0.7] - 2026-07-24

### 修复

- **回滚 1.0.5 的剥签名**(方向性错误):macOS 26 实测无签名应用直接 SIGKILL 且 provenance 不可删,adhoc 签名才能跑;「已损坏」用 `xattr -dr com.apple.quarantine` 一次可解
- **Windows daemon 仍不自启**:find_kimi 补 npm 全局安装的 `kimi.cmd` 查找(此前只找 kimi.exe,npm 装 CLI 的机器永远找不到)
- **Windows 托盘菜单闪退**:托盘点击事件改为只响应左键(此前右键同时触发显示窗口抢焦,菜单被瞬间挤掉)
- **新增退出入口**:设置 → 关于 →「退出应用」+ 命令面板「退出应用」(托盘菜单之外的兜底路径;daemon 保持后台运行)

## [1.0.6] - 2026-07-24

### 修复

- **Windows 托盘菜单**:右键托盘图标现在能弹出菜单(显示/退出);此前菜单绑在左键,右键无响应导致无法退出
- **Windows daemon 无法自启**:启动 daemon 从阻塞等待改为后台 spawn + 轮询实例文件(此前在 Windows 上首启永久挂起,必须手动 `kimi web`);启动不再弹控制台黑窗
- daemon 连接失败时给出明确提示(找不到 kimi CLI 请先安装并登录)

## [1.0.5] - 2026-07-24

### 修复

- **macOS「已损坏」拦截改为可放行**:发行产物剥除 adhoc 占位签名,Gatekeeper 提示从「已损坏」降级为「无法验证开发者」,可右键打开或在系统设置中允许(无需再跑 xattr)

## [1.0.4] - 2026-07-24

### 修复

- 发行流水线末端回传 main 分支前自动 rebase,避免 tag 后有新提交导致的非快进推送失败;发行链全程(双平台构建/签名/清单/回传)验证通过

## [1.0.3] - 2026-07-24

### 修复

- 发行流水线加固:manifest 任务补 node/pnpm 环境、签名步骤改绝对路径、签名密钥显式传参;双平台构建与自动更新清单生成全程自动化验证通过

## [1.0.2] - 2026-07-22

### 新增

- **Windows 支持**:NSIS 安装包(.exe)云端构建;自动更新覆盖 macOS / Windows 双平台(更新包随仓走 CDN)

### 修复

- 全局唤起快捷键跨平台化:macOS 为 ⌘⌥N,Windows/Linux 为 Ctrl+Alt+N
- daemon 查找 kimi CLI 兼容 Windows(`.exe` 与 Windows 安装路径)

## [1.0.1] - 2026-07-24

### 修正

- **版本线修正**:0.2.2 作废(版本只向前,不回退)。1.0.0 已公开发行,后续版本从 1.0.1 起递增
- `fs:content` 文件预览的调用链简化(去重,失败路径合并)
- 自动更新清单指回本版本(1.0.0 发行时清单缺失已补齐)

### 说明

- Cargo.toml 版本号补齐(此前两次版本提交均漏改,实际以 tauri.conf.json 为准)

## [1.0.0] - 2026-07-24

正式发布版。功能完整度对标官方 kimi-web 0.29 + Codex 桌面 App 交互风格。

### 新增（相对 0.2.1）

- **上游 0.29 sync**:thinking per-session 重构 + thinking reasoning field + 视频预览 + 透明图片棋盘格
- **daemon 0.29 新端点**:
  - `GET /api/v1/oauth/usage` REST 额度查询（替代 PTY 抓取，更稳定）
  - `GET /api/v1/fs:content` 宿主机文件读取（替代 readFileContent，支持绝对路径）
- **daemon 0.28 多实例兼容**:`kimi web` foreground 启动 + `server/instances/*.json` 多实例注册
- **prod 模式修复**:多页面 build（app.html 入口）+ tauri:// origin 连 daemon

### 技术细节

- baseline: `66f611aa`（kimi-code 0.29.0）
- fork 卫生:10 文件改动（含协议层 3 + 入口 3 + 配置 2 + 组件 2），全部记 PATCHES.md
- 协议层零改动:sync.sh merge 自动带入上游更新

## [0.2.1] - 2026-07-21

### 新增

- **自动更新**:应用启动时静默检查新版本;发现新版本时弹出中文更新说明(功能描述),支持一键下载安装并自动重启。设置 → 关于 中也可手动「检查更新」
- **发行流水线**:GitHub Actions 云端构建 macOS 发行包,打 tag 即可发布;更新包带签名校验,防篡改

### 修复

- 版本号在多处不一致的问题,统一为单一来源并在关于页动态展示

## [0.2.0] - 2026-07-21

首个可对外分享的功能完整版。从官方 kimi-web 分支出发,完成全新「codex UI」的全部核心链路并打通打包/发行通道。

### 新增

- **全新对话 UI(codex UI)**:侧栏(工作区分组/置顶/状态点)、消息流(Markdown 流式渲染 + 思考块)、Composer(权限/模式/模型/上下文用量/图片附件)
- **思考块流式跟随**:流式思考自动滚到最新,上滚暂停 +「↓ 最新」回跳;全局思考开关
- **审批系统**:命令/diff/计划三类审批卡、单键 y/a/n/p、反馈附言
- **队列与插话(steer)**:运行态双模(排队/插话)、队列面板(编辑/删除/拖拽重排/转插话)
- **多 Agent 视图**:子智能体卡片、面板(进行中/已完成)、transcript 钻取、取消任务
- **Diff/Review**:diff 语法高亮 + 折叠 + split 视图 + 词级高亮;Review pane 目录树 + 搜索过滤
- **斜杠命令 + @ 文件引用**:15 个内置命令 + 动态 skills;@ 文件模糊搜索(真 daemon 搜索)
- **账号与登录**:OAuth 设备码登录/退出、侧栏账号行、原生中文登录弹窗
- **工作区管理**:组名点选切换、原生文件夹选择添加、重命名/移除、排序、会话创建后锁定工作区
- **⌘K 命令面板**:命令 + 会话双区搜索,动作按上下文动态
- **消息级操作**:hover 复制/编辑重发、输入历史(↑↓)、按会话草稿持久化
- **Inspect 右栏**(⌘I):思考全文(搜索/大纲)/工具记录/会话信息;侧边任务分栏(⌥⌘S)
- **系统级**:全局唤起 ⌘⌥N、托盘常驻、Dock 未读角标、原生通知、计划额度显示(5h/周,PTY 抓 /usage)
- **macOS 原生体验**:交通灯避让布局、双击标题栏放大/还原、原生文件夹选择、原生中文对话框
- **设置页**:外观/权限/通知/字号/归档管理(归档列表 + 恢复)/快捷键/关于(动态版本号)
- **可靠性**:会话深链(reload 不丢)、设置项持久化(思考开关/侧栏折叠/筛选)、断线提示、空态引导

### 修复

- 新建任务交互(一键草稿 + 聚焦,工作区上下文随处可切)
- Enter 直接发送(原仅 ⌘+Enter)
- DMG 打包失败(残留临时文件自我中毒)
- reload 跳回官方 web(dev vite fallback + prod 协议回落,均改为产品页)
- 思考块流式不滚动、官方组件图片重复重渲染、长文本撑破布局等 30+ 项体验问题

## [0.1.0] - 2026-07-19

### 新增

- 项目骨架:官方 kimi-web fork(vite 多页面)+ Tauri 2 壳(daemon 拉起/token 注入/托盘)
- 静态交互原型 `prototype/`(视觉契约:SVG 图标体系、token 配色、双主题)

[1.0.0]: https://github.com/liujunGH/kimi-gui/releases/tag/v1.0.0
[0.2.1]: https://github.com/liujunGH/kimi-gui/releases/tag/v0.2.1
[0.2.0]: https://github.com/liujunGH/kimi-gui/releases/tag/v0.2.0
[0.1.0]: https://github.com/liujunGH/kimi-gui/releases/tag/v0.1.0
