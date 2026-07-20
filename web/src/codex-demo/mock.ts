/**
 * codex 演示数据(原型期 mock,仅 codex-demo/ 使用,不进产品组件)
 *
 * 轮次 3 由 ZCode 的 composable 接真源(daemon);本文件标注"动态"的字段
 * 届时来自对应端点(见 prototype/README.md 数据来源表)。
 */
import { ref } from 'vue';
import type { ChatTurn, Session, TodoView, ToolCall, Workspace } from '../types';
import type { KimiClient } from '../composables/codex/useKimiClient';
import type {
  ApprovalRequestSummary,
  BuiltinCommand,
  ChangedFile,
  ContextInfo,
  DiffHunk,
  FileEntry,
  ModelInfo,
  ModeFlags,
  QueuedPrompt,
  QuotaInfo,
  Skill,
  Subagent,
} from '../types/codex';

// ---------------------------------------------------------------- 侧栏(动态:/workspaces + /sessions)

export const workspaces: Workspace[] = [
  { name: 'kimi-gui', branch: 'main' },
  { name: 'my-api-server', branch: 'dev' },
  { name: 'blog', branch: 'main' },
];

export const sessions: Session[] = [
  {
    id: 's1',
    title: '重构 Composer 双模交互',
    time: '2m',
    busy: false,
    lastTurnReason: 'completed',
    workspaceName: 'kimi-gui',
    updatedAt: '2026-07-19T09:20:00',
  },
  {
    id: 's2',
    title: 'DiffView 重做',
    time: '1h',
    busy: true,
    workspaceName: 'kimi-gui',
    updatedAt: '2026-07-19T08:10:00',
  },
  {
    id: 's3',
    title: '添加 JWT 鉴权中间件',
    time: '14:40',
    busy: false,
    pendingInteraction: 'approval',
    workspaceName: 'my-api-server',
    updatedAt: '2026-07-19T07:30:00',
  },
  {
    id: 's5',
    title: '/swarm 重构 4 个组件',
    time: '15:02',
    busy: true,
    workspaceName: 'kimi-gui',
    updatedAt: '2026-07-19T09:25:00',
  },
  {
    id: 's4',
    title: '部署到 Vercel',
    time: '3d',
    busy: false,
    lastTurnReason: 'completed',
    workspaceName: 'blog',
    updatedAt: '2026-07-16T10:00:00',
  },
];

// ---------------------------------------------------------------- Composer 数据(动态:模型/skills/文件树)

export const models: ModelInfo[] = [
  { id: 'k27-coding', name: 'K2.7 Coding' },
  { id: 'k27-highspeed', name: 'K2.7 Coding Highspeed' },
  { id: 'k3', name: 'K3' },
];

export const builtin: BuiltinCommand[] = [
  { name: 'new', desc: '新建会话' },
  { name: 'clear', desc: '清空当前会话上下文' },
  { name: 'login', desc: '登录账号' },
  { name: 'plan', desc: '进入计划模式' },
  { name: 'swarm', desc: '多智能体并行执行', acceptsInput: true },
  { name: 'goal', desc: '进入目标模式(长期任务)', acceptsInput: true },
  { name: 'btw', desc: '把话题开到侧边任务', acceptsInput: true },
  { name: 'auto', desc: '自动模式:审批自动通过' },
  { name: 'yolo', desc: '完全放权,跳过所有审批(危险)' },
  { name: 'thinking', desc: '切换思考深度' },
  { name: 'compact', desc: '压缩上下文,保留要点', acceptsInput: true },
  { name: 'undo', desc: '撤销上一轮改动' },
  { name: 'fork', desc: '从当前会话分叉出新线程' },
  { name: 'export', desc: '导出会话记录' },
  { name: 'status', desc: '查看会话状态与用量' },
];

export const skills: Skill[] = [
  { name: '草稿评审', description: '评审当前草稿并给出修改建议', source: 'workspace' },
  { name: '代码审查', description: '按项目规约审查本轮改动', source: 'workspace' },
  { name: '写周报', description: '汇总本周工作生成周报草稿', source: 'user' },
];

export const files: FileEntry[] = [
  { path: 'web/src/components/codex/Composer.vue', name: 'Composer.vue', kind: 'file' },
  { path: 'web/src/components/codex/ThinkingBlock.vue', name: 'ThinkingBlock.vue', kind: 'file' },
  { path: 'web/src/components/codex/ApprovalCard.vue', name: 'ApprovalCard.vue', kind: 'file' },
  { path: 'web/src/components/codex/DiffView.vue', name: 'DiffView.vue', kind: 'file' },
  { path: 'web/src/api/daemon/client.ts', name: 'client.ts', kind: 'file' },
  { path: 'web/package.json', name: 'package.json', kind: 'file' },
  { path: 'package.json', name: 'package.json', kind: 'file' },
  { path: 'docs/superpowers/specs/2026-07-18-kimi-gui-design.md', name: '2026-07-18-kimi-gui-design.md', kind: 'file' },
];

export const contextInfo: ContextInfo = { used: '108.5k', total: '258k', pct: 42 };
export const quotaInfo: QuotaInfo = { q5h: 33, q5hReset: '3h 38m', qWeek: 7, qWeekReset: '6d 22h' };
export const defaultModes: ModeFlags = { plan: false, swarm: false, goal: false };

// ---------------------------------------------------------------- 场景:index(空闲态)

export const indexTurns: ChatTurn[] = [
  {
    id: 't1',
    role: 'user',
    no: 1,
    text: '把 Composer 改成 Codex 那种双模:运行时可以选「排队下轮」或「插话 steer」,两个端点要在 UI 上显式分开。',
    createdAt: '2026-07-19T14:32:00',
  },
  {
    id: 't2',
    role: 'assistant',
    no: 2,
    text: '',
    durationMs: 42000,
    createdAt: '2026-07-19T14:32:30',
    blocks: [
      {
        kind: 'thinking',
        thinking:
          '先对齐语义:queue 与 steer 是不同端点。steer 走 POST /api/v1/prompts:steer,立即注入当前轮;queue 是客户端队列,当前轮结束后自动发下一条。所以 Composer 运行态必须显式区分两个模式,不能沿用现在「打字即 steer」的隐式行为。\n\n布局上参考 Codex:输入框上方放分段控件,默认停在上次用的模式。插话用 warning 色、排队用中性色,避免误插话。队列面板用 drag handle 做重排,协议层不需要改动。',
      },
      {
        kind: 'text',
        text: '方案定了:**Composer 双模分段控件**,排队/插话显式切换,不做隐式 steer。\n\n- 运行态输入框上方出现 `[排队下轮 | 插话 steer]` 分段控件\n- 队列指示器显示待发送条数,点击展开面板,可拖拽重排\n- steer 发出后给反馈气泡,并在思考块顶部标记「用户引导」\n\n我先改 `web/src/components/codex/Composer.vue`:',
      },
      {
        kind: 'tool',
        tool: {
          id: 'tc1',
          name: 'edit_file',
          arg: JSON.stringify({
            path: 'web/src/components/codex/composer/Composer.vue',
            old_string: "function handleSend() {\n  steer(text);\n}",
            new_string: "function handleSend() {\n  if (mode === 'steer') steer(text);\n  else queue(text);\n}",
          }),
          status: 'ok',
          timing: '3.2s',
          output: ['✓ 已应用 1 处替换', 'Composer.vue · +86 −24'],
        },
      },
    ],
  },
];

export const indexTodos: Record<string, TodoView[]> = {
  t2: [
    { title: '思考链展示方案(内联折叠 + 全局开关)', status: 'done' },
    { title: 'Composer 双模布局与状态切换', status: 'in_progress' },
    { title: '审批单键 y/a/n/p 键位映射', status: 'pending' },
    { title: 'Diff 语法高亮配色(对齐 GitHub)', status: 'pending' },
  ],
};

export const indexProgress = { current: 2, total: 4, additions: 86, deletions: 24 };

export const indexToolCalls: ToolCall[] = [
  { id: 'tc1', name: 'edit_file', arg: 'Composer.vue · +86 −24', status: 'ok', timing: '3.2s' },
];

export const indexThinkingFull =
  '先对齐语义:queue 与 steer 是不同端点。steer 走 POST /api/v1/prompts:steer,立即注入当前轮;queue 是客户端队列,当前轮结束后自动发下一条。所以 Composer 运行态必须显式区分两个模式,不能沿用现在「打字即 steer」的隐式行为。\n\n布局上参考 Codex:输入框上方放分段控件,默认停在上次用的模式。插话用 warning 色、排队用中性色,避免误插话。队列面板用 drag handle 做重排,协议层不需要改动。';

// ---------------------------------------------------------------- 场景:running(运行态)

export const runningTurns: ChatTurn[] = [
  {
    id: 'r1',
    role: 'user',
    no: 1,
    text: '开始改 Composer.vue 吧,先加双模切换。',
    createdAt: '2026-07-19T14:33:00',
  },
  {
    id: 'r2',
    role: 'assistant',
    no: 2,
    text: '',
    createdAt: '2026-07-19T14:33:05',
    blocks: [
      {
        kind: 'thinking',
        thinking:
          '先读 web/src/components/codex/Composer.vue,2200 行,量不小。重点看输入区布局和发送链路:template 里 el-input 包在 .input-wrap 里,发送逻辑集中在 handleSend,目前是「打字即 steer」的隐式行为。\n\n分段控件的插入点定在输入框上方、.input-wrap 顶部,改动最小。双模状态放组件本地 ref,默认「排队下轮」。配色上 steer 用 warning 色、排队用中性色,避免误插话——就这么定,开始写。',
      },
      { kind: 'text', text: '开始改 Composer.vue。先在输入框上方插入双模分段控件:' },
      {
        kind: 'tool',
        tool: {
          id: 'tc2',
          name: 'edit_file',
          arg: JSON.stringify({
            path: 'web/src/components/codex/composer/Composer.vue',
            old_string: '<div class="input-wrap">',
            new_string: '<ComposerModes v-if="running" />\n<div class="input-wrap">',
          }),
          status: 'running',
          output: ['读取 Composer.vue(2200 行)…', '定位 .input-wrap 插入点…'],
        },
      },
    ],
  },
];

export const runningProgress = { current: 3, total: 4, additions: 98, deletions: 30 };

export const runningQueue: QueuedPrompt[] = [
  { id: 'q1', text: '把队列面板也改成可拖拽排序', queuedAt: 1 },
  { id: 'q2', text: '补充 steer 模式的快捷键说明', queuedAt: 2 },
  { id: 'q3', text: 'review 一下这轮的 diff', queuedAt: 3 },
];

export const steerQueue: QueuedPrompt[] = [
  { id: 'q2', text: '补充 steer 模式的快捷键说明', queuedAt: 2 },
  { id: 'q3', text: 'review 一下这轮的 diff', queuedAt: 3 },
];

// ---------------------------------------------------------------- 场景:approval(审批)

export const approvalTurns: ChatTurn[] = [
  {
    id: 'a1',
    role: 'user',
    no: 1,
    text: '给 /api 下的路由都加上 JWT 鉴权中间件,密钥从环境变量读。',
    createdAt: '2026-07-19T14:40:00',
  },
  {
    id: 'a2',
    role: 'assistant',
    no: 2,
    text: '',
    durationMs: 6000,
    createdAt: '2026-07-19T14:40:10',
    blocks: [
      {
        kind: 'thinking',
        thinking:
          '拆成两步操作:第一步安装 jsonwebtoken 依赖,第二步修改 src/routes/api.js,删掉旧的自制 auth,统一在 /api 前缀上挂 authMiddleware。\n\n密钥从 process.env.JWT_SECRET 读取,不写死;启动时若环境变量缺失直接报错退出,避免弱密钥上线。两步都有副作用,先给用户审批。',
      },
      { kind: 'text', text: '需要两步操作,都等你批准:' },
    ],
  },
];

export const approvalRequests: ApprovalRequestSummary[] = [
  {
    approvalId: 'ap1',
    kind: 'shell',
    title: '运行命令?',
    command: 'npm install jsonwebtoken@9.0.2',
    path: 'npm install jsonwebtoken@9.0.2',
  },
  {
    approvalId: 'ap2',
    kind: 'diff',
    title: '应用修改?',
    path: 'src/routes/api.js · +9 −1',
    diff: [
      {
        oldStart: 12,
        newStart: 12,
        lines: [
          { kind: 'hunk', text: '@@ -12,6 +12,9 @@' },
          { kind: 'context', text: "import express from 'express';" },
          { kind: 'context', text: 'const router = express.Router();' },
          { kind: 'del', text: "const auth = require('../auth');" },
          { kind: 'add', text: "import { authMiddleware } from './auth.js';" },
          { kind: 'add', text: '// 密钥从环境变量读取' },
          { kind: 'add', text: "router.use('/api', authMiddleware);" },
          { kind: 'context', text: "router.get('/users', (req, res) => {" },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------- 场景:multi-agent(子智能体)

export const multiSubagents: Subagent[] = [
  { id: 'sa1', name: 'refactor-thinking', status: 'working', progress: { current: 7, total: 12 }, summary: '正在重写流式渲染逻辑,思考块限高方案已确认…' },
  { id: 'sa2', name: 'refactor-composer', status: 'working', progress: { current: 5, total: 15 }, summary: '双模切换布局已完成,正在接队列面板…' },
  { id: 'sa3', name: 'refactor-approval', status: 'suspended', progress: { current: 2, total: 9 }, summary: '审批按钮顺序用 [批准][本会话][拒绝][反馈] 还是 [批准][拒绝][本会话][反馈]?' },
  { id: 'sa4', name: 'refactor-diff', status: 'completed', progress: { current: 15, total: 15 }, summary: 'DiffView 高亮与 hunk 折叠已完成。' },
];

export const agentPanelCompleted: Subagent[] = [
  { id: 'sa4', name: 'refactor-diff', status: 'completed', summary: 'DiffView 高亮与 hunk 折叠已完成,15/15 项。' },
  { id: 'sa5', name: 'review-composer', status: 'completed', summary: '双模切换代码审查:0 P0 / 1 P1,已修复。' },
  { id: 'sa6', name: 'explore-protocol', status: 'completed', summary: 'steer/queue 端点确认:POST /api/v1/prompts:steer。' },
  { id: 'sa7', name: 'refactor-sidebar', status: 'completed', summary: '侧栏分组与折叠重写完成,交互对齐 Codex。' },
  { id: 'sa8', name: 'test-approval', status: 'completed', summary: '审批单键 y/a/n/p 键位单测 8/8 通过。' },
  { id: 'sa9', name: 'explore-tokens', status: 'completed', summary: 'token 体系调研:配色对齐官方 style.css。' },
];

export const agentAsks: Record<string, string> = {
  sa3: '审批按钮顺序用 [批准][本会话][拒绝][反馈] 还是 [批准][拒绝][本会话][反馈]?回答后我继续。',
};

function agentTurns(task: string, text: string, tool?: ToolCall): ChatTurn[] {
  return [
    { id: 'u', role: 'user', no: 1, text: task, createdAt: '2026-07-19T15:02:00' },
    {
      id: 'a',
      role: 'assistant',
      no: 2,
      text: '',
      createdAt: '2026-07-19T15:02:10',
      blocks: [
        { kind: 'text', text },
        ...(tool ? [{ kind: 'tool' as const, tool }] : []),
      ],
    },
  ];
}

export const agentTranscripts: Record<string, ChatTurn[]> = {
  sa1: agentTurns(
    '重写 ThinkingBlock:思考块折叠/展开/流式限高,保持现有 API 不变。',
    '折叠动画与单行 teaser 已完成(7/12),正在处理流式 240px 限高与全局开关的联动…',
    { id: 'at1', name: 'edit_file', arg: 'ThinkingBlock.vue · 写入中…', status: 'running' },
  ),
  sa2: agentTurns(
    'Composer 双模改造:排队/插话分段控件 + 队列面板。',
    '分段控件与 placeholder 联动完成(5/15),正在接队列面板的展开/收起…',
    { id: 'at2', name: 'edit_file', arg: 'Composer.vue · 写入中…', status: 'running' },
  ),
  sa3: agentTurns(
    '重写 ApprovalCard:内联不阻塞 Composer + 单键 y/a/n/p。',
    '四种 kind 的 body 结构已定(shell / diff / file / plan),键位映射完成 2/9。',
  ),
  sa4: agentTurns(
    'DiffView 重做:语法高亮对齐 GitHub,大 hunk 自动折叠。',
    '完成,15/15 项。shiki 接入 + tk-* token 映射 + 折叠条点击展开。',
    { id: 'at4', name: 'edit_file', arg: 'DiffView.vue · +48 −12', status: 'ok' },
  ),
};

// ---------------------------------------------------------------- 场景:diff(Diff 高亮 + Review pane)

export const diffTurns: ChatTurn[] = [
  {
    id: 'd1',
    role: 'user',
    no: 1,
    text: '把 DiffView 重做一下:语法高亮对齐 GitHub,大 hunk 自动折叠。',
    createdAt: '2026-07-19T16:20:00',
  },
  {
    id: 'd2',
    role: 'assistant',
    no: 2,
    text: '',
    durationMs: 68000,
    createdAt: '2026-07-19T16:20:30',
    blocks: [
      {
        kind: 'thinking',
        thinking:
          '高亮不自己写正则:直接接 shiki(VS Code 同款 TextMate 引擎),主题取 GitHub light / dark 两套,token 统一映射到 tk-kw、tk-str、tk-cmt 等 class;深色主题只覆盖色值,不动 DOM 结构,和现有 diff.css 的 token 类完全对上。\n\n折叠策略:hunk 超过 8 行默认收起,中间渲染一条可点击的折叠条,展开后新旧行号保持连续。另外新增右侧 Review pane 聚合本次全部改动,⌘B 开合,按文件 chip 切换,对话流里只放关键两个文件的内联 diff。',
      },
      {
        kind: 'text',
        text: '完成,改动 3 个文件:\n\n- 接入 `shiki` 做 token 着色,配色对齐 GitHub\n- hunk 超 8 行自动折叠、点击展开\n- 新增右侧 Review pane 聚合全部改动',
      },
    ],
  },
];

export const diffFiles: ChangedFile[] = [
  { path: 'DiffView.vue', status: 'M', additions: 48, deletions: 12 },
  { path: 'diffHighlight.ts', status: 'A', additions: 87, deletions: 0 },
  { path: 'DiffLines.vue', status: 'M', additions: 23, deletions: 5 },
];

const f1Hunks: DiffHunk[] = [
  {
    oldStart: 10,
    newStart: 10,
    lines: [
      { kind: 'hunk', text: '@@ -10,7 +10,15 @@' },
      { kind: 'context', text: 'const store = useAppStore()' },
      { kind: 'context', text: 'const lines = ref<DiffLine[]>([])' },
      { kind: 'del', text: 'const html = highlightSync(lines.value)' },
      { kind: 'del', text: 'renderPlain(html)' },
      { kind: 'add', text: 'const highlighter = await getHighlighter({ theme: "github-light" })' },
      { kind: 'add', text: 'const COLLAPSE_THRESHOLD = 8' },
      { kind: 'add', text: '// 大 hunk 自动折叠,点击展开' },
      { kind: 'add', text: 'const tokens = codeToTokens(code, lang)' },
      { kind: 'add', text: 'const mapped = mapTokens(tokens, TOKEN_MAP)' },
      { kind: 'add', text: 'lines.value = buildLines(mapped)' },
      { kind: 'add', text: 'watch(collapsed, rebuild)' },
      { kind: 'context', text: 'const changedFiles = computed(() => store.diff?.files ?? [])' },
      { kind: 'context', text: 'provide("collapseThreshold", COLLAPSE_THRESHOLD)' },
    ],
  },
];

const f2Hunks: DiffHunk[] = [
  {
    oldStart: 0,
    newStart: 1,
    lines: [
      { kind: 'hunk', text: '@@ -0,0 +1,6 @@' },
      { kind: 'add', text: "import { getHighlighter } from 'shiki'" },
      { kind: 'add', text: "import type { Token } from './types'" },
      { kind: 'add', text: 'export const TOKEN_MAP = {' },
      { kind: 'add', text: "  keyword: 'tk-kw'," },
      { kind: 'add', text: "  string: 'tk-str'," },
      { kind: 'add', text: "  comment: 'tk-cmt'," },
    ],
  },
];

const f3Hunks: DiffHunk[] = [
  {
    oldStart: 3,
    newStart: 3,
    lines: [
      { kind: 'hunk', text: '@@ -3,5 +3,7 @@' },
      { kind: 'context', text: '<template>' },
      { kind: 'del', text: '  <pre class="diff">{{ raw }}</pre>' },
      { kind: 'add', text: '  <div class="diff-lines">' },
      { kind: 'add', text: '    <DiffLine v-for="l in lines" :key="l.no" v-bind="l" />' },
      { kind: 'add', text: '  </div>' },
      { kind: 'context', text: '</template>' },
    ],
  },
];

export const hunksByFile: Record<string, DiffHunk[]> = {
  'DiffView.vue': f1Hunks,
  'diffHighlight.ts': f2Hunks,
  'DiffLines.vue': f3Hunks,
};

// ---------------------------------------------------------------- 侧边任务默认内容(DiffView 线程)

export const sideThreadTurns: ChatTurn[] = [
  {
    id: 'st1',
    role: 'user',
    no: 1,
    text: '把 DiffView 重做一下:语法高亮对齐 GitHub,大 hunk 自动折叠。',
    createdAt: '2026-07-19T16:20:00',
  },
  {
    id: 'st2',
    role: 'assistant',
    no: 2,
    text: '',
    createdAt: '2026-07-19T16:20:30',
    blocks: [
      { kind: 'text', text: 'shiki 已接入,hunk 折叠完成,正在跑最后一轮回归:' },
      {
        kind: 'tool',
        tool: { id: 'st-t1', name: 'run_command', arg: 'pnpm test --diff · 41/41 通过', status: 'ok' },
      },
      { kind: 'text', text: '回归通过,正在收尾:把折叠阈值写进设置项…' },
      {
        kind: 'tool',
        tool: { id: 'st-t2', name: 'edit_file', arg: 'diffHighlight.ts · 写入中…', status: 'running' },
      },
    ],
  },
];

// ---------------------------------------------------------------- 设置页演示 mock client(沙箱无真 daemon)

/**
 * 只覆盖 SettingsPage / ApprovalCard(inject 兜底)读取的键:
 * 读的都是 ref,写的都是 setter;respondApproval 空操作(演示不真审批)。
 * DemoApp 顶层 provide(KIMI_CLIENT_KEY, mockKimiClient),沙箱设置页不再崩。
 */
function rw<T>(v: T) {
  const r = ref(v);
  return [r, (x: T) => { r.value = x; }] as const;
}
const [permission, setPermission] = rw('manual');
const [defaultModel, setModel] = rw('kimi-k3');
const [notifyOnComplete, setNotifyOnComplete] = rw(true);
const [notifyOnQuestion, setNotifyOnQuestion] = rw(true);
const [notifyOnApproval, setNotifyOnApproval] = rw(true);
const [soundOnComplete, setSoundOnComplete] = rw(false);
const [uiFontSize, setUiFontSize] = rw(14);

export const mockKimiClient = {
  permission, setPermission,
  models: ref([
    { id: 'kimi-k2.7', displayName: 'K2.7' },
    { id: 'kimi-k3', displayName: 'K3' },
  ]),
  defaultModel, setModel,
  notifyOnComplete, setNotifyOnComplete,
  notifyOnQuestion, setNotifyOnQuestion,
  notifyOnApproval, setNotifyOnApproval,
  soundOnComplete, setSoundOnComplete,
  uiFontSize, setUiFontSize,
  loadArchivedSessions: async () => {},
  archivedSessions: ref([]),
  connection: ref('connected'),
  serverVersion: ref('2.1.0-demo'),
  backend: ref('local(演示)'),
  respondApproval: async () => {},
} as unknown as KimiClient;
