/**
 * kimi-gui Codex UI 组件契约(types/codex.ts)
 *
 * 本文件是 ZCode 与 kimi3 的「接口冻结点」(HANDOFF 5.1 按域并行条款)。
 * 一旦冻结,任何一方要改这里的类型必须提 issue、双方同意后才能动。
 *
 * 命名约定:fork 官方的类型(ChatTurn / TurnBlock / ToolCall / TodoView /
 * PermissionMode 等)直接 `import type` from '../../types',不重新定义;
 * 这里只放 codex UI 自有的派生类型(ModelInfo / Skill / Subagent / 各种
 * View 状态等),以及为方便组件使用而做的别名/重组。
 *
 * 对应文档:ARCHITECTURE.md 第 4 节(组件契约)。
 */

import type {
  ChatTurn,
  PermissionMode,
  TodoView,
  ToolCall,
} from '../types';

// ---------------------------------------------------------------------------
// 通用
// ---------------------------------------------------------------------------

/** 模式开关(计划 / Swarm / 目标),三个布尔独立 toggle(见 ComposerProps.modes)。 */
export interface ModeFlags {
  plan: boolean;
  swarm: boolean;
  goal: boolean;
}

/** Composer 运行态模式:queue=排队下轮 / steer=立即插话当前轮(见 6.6)。 */
export type ComposerMode = 'queue' | 'steer';

/** 会话过滤(侧栏顶部 chips)。 */
export type SessionFilter = 'all' | 'running' | 'pending_approval';

/** 工作区排序模式。 */
export type WorkspaceSortMode = 'recent' | 'manual' | 'created';

// ---------------------------------------------------------------------------
// sidebar/
// ---------------------------------------------------------------------------

import type { Session, Workspace } from '../types';

/** 附件(prompt attachments,跟官方 useKimiWebClient 一致) */
export interface PromptAttachment {
  fileId: string;
  kind: 'image' | 'video' | 'file';
  url: string;
  name?: string;
}

export interface SidebarProps {
  workspaces: Workspace[];
  currentWorkspaceId: string;
  sessions: Session[];
  currentSessionId: string;
  filter: SessionFilter;
  collapsed: boolean;
}

export interface SidebarEmits {
  (e: 'select-session', id: string): void;
  (e: 'new-task'): void;
  (e: 'set-filter', f: SessionFilter): void;
  (e: 'collapse'): void;
  (e: 'toggle-pin', id: string): void;
}

export interface WorkspaceGroupProps {
  workspace: Workspace;
  sessions: Session[];
  currentSessionId: string;
  sortMode: WorkspaceSortMode;
}

export type ThreadStatus =
  | 'idle'
  | 'running'
  | 'needs_input'
  | 'done'
  | 'failed';

export interface ThreadRowProps {
  session: Session;
  active: boolean;
  status: ThreadStatus;
  pinned: boolean;
}

export interface ThreadRowEmits {
  (e: 'select'): void;
  (e: 'toggle-pin'): void;
  (e: 'open-menu'): void;
}

// ---------------------------------------------------------------------------
// chat/
// ---------------------------------------------------------------------------

/**
 * ConversationPane 直接消费官方 `ChatTurn[]`(turn 内 blocks 已是有序混合数组,
 * 见 types.ts 的 TurnBlock + ChatTurn.blocks)。todo / subagents / turnProgress
 * 是 turn 级状态,挂在 turn 上但不进 blocks(跟官方一致)。
 */
export interface ConversationPaneProps {
  turns: ChatTurn[];
  pendingApproval?: ApprovalRequestSummary;
  pendingQuestion?: QuestionRequestSummary;
  todosByTurn: Record<string /* turnId */, TodoView[]>;
  turnProgress?: { current: number; total: number; additions: number; deletions: number };
  running: boolean;
  /** 文件路径链接点击回调(Markdown 内的 src/foo.ts 可点击) */
  openFile?: (target: { path: string; line?: number }) => void;
}

export interface ConversationPaneEmits {
  (e: 'cancel-turn'): void;
}

/** 审批卡:转译自官方 ApprovalBlock + 触发它的 turn 上下文。 */
export interface ApprovalRequestSummary {
  approvalId: string;
  kind:
    | 'shell'
    | 'diff'
    | 'file'
    | 'fileop'
    | 'url'
    | 'search'
    | 'invocation'
    | 'todo'
    | 'plan_review'
    | 'generic';
  title: string;
  path?: string;
  command?: string;
  diff?: DiffHunk[];
  plan?: string;
  subagent?: string;
}

export interface ApprovalCardEmits {
  // 深组件直接 inject client 调 action(client.approve(approvalId)),不走 emit
  // emit 只留纯 UI:
  (e: 'minimize'): void;
  (e: 'toggle-feedback'): void;
}

export interface QuestionRequestSummary {
  questionId: string;
  title: string;
  options: { label: string; value: string }[];
  multi?: boolean;
}

/** 一个 diff hunk 的渲染数据(给 ApprovalCard 的 diff body 和 DiffView 复用)。 */
export interface DiffHunk {
  oldStart: number;
  newStart: number;
  lines: { kind: 'context' | 'add' | 'del' | 'hunk'; text: string }[];
}

export interface ThinkingBlockProps {
  /** 这个思考块的原文(从所在 turn 的 blocks 里 kind:'thinking' 取出)。 */
  text: string;
  streaming: boolean;
  /** 全局思考开关(useThinkingToggle)—— 关 = 全部折叠(含流式)。 */
  globalShow: boolean;
  /** steer 标记:用户引导插入的位置 + 文本。 */
  steerMark?: { text: string; at: number };
}

export interface ThinkingBlockEmits {
  (e: 'toggle'): void;
  (e: 'inspect'): void;
}

export interface TodoCardProps {
  todos: TodoView[];
}

export interface ToolCallCardProps {
  call: ToolCall;
}

export interface ToolCallCardEmits {
  (e: 'inspect'): void;
}

export interface TurnProgressProps {
  current: number;
  total: number;
  additions: number;
  deletions: number;
}

// ---------------------------------------------------------------------------
// composer/
// ---------------------------------------------------------------------------

export interface ComposerProps {
  running: boolean;
  mode: ComposerMode;
  permission: PermissionMode; // 'manual' | 'auto' | 'yolo'
  modes: ModeFlags;
  models: ModelInfo[]; // daemon 拉取
  currentModel: string;
  effort: EffortLevel | null; // M0 验证(spec 6.7.4)
  context: ContextInfo;
  quota: QuotaInfo;
}

export interface ComposerEmits {
  (e: 'send', text: string, mode: ComposerMode, attachments?: PromptAttachment[]): void;
  (e: 'set-mode', m: ComposerMode): void;
  (e: 'toggle-mode', m: keyof ModeFlags): void; // 'plan' | 'swarm' | 'goal'
  (e: 'cancel'): void;
  (e: 'set-model', id: string): void;
  (e: 'set-effort', lv: EffortLevel): void;
  (e: 'set-permission', p: PermissionMode): void;
  (e: 'pick-model'): void;
  (e: 'open-context-detail'): void;
  (e: 'command', cmd: string): void; // 斜杠命令执行(如 /compact /goal /fork)
}

/** 模型元信息:daemon 返回(不同账号能用的模型不同,不写死)。 */
export interface ModelInfo {
  id: string;
  name: string;
  provider?: string;
  starred?: boolean;
}

/** 思考深度档位:具体支持度 M0 验证(spec 6.7.4),Low/High/Max 是推测。 */
export type EffortLevel = 'Low' | 'High' | 'Max';

export interface ContextInfo {
  used: string; // "108.5k"
  total: string; // "258k"
  pct: number; // 0..100
}

export interface QuotaInfo {
  q5h: number; // 百分比
  q5hReset: string; // "3h 38m"
  qWeek: number;
  qWeekReset: string;
}

// SlashMenu(/ 触发)
export interface SlashMenuProps {
  builtin: BuiltinCommand[]; // 15 条,from lib/slashCommands.ts
  skills: Skill[]; // 动态,from /sessions/{id}/skills
  query: string; // 当前过滤词(v-model 双向)
  skillsLoading: boolean; // ZCode 提供:kimi3 只读决定 skeleton
}

export interface SlashMenuEmits {
  (e: 'select', cmd: BuiltinCommand | Skill, args?: string): void;
  (e: 'close'): void;
  (e: 'update:query', q: string): void; // 配合 v-model:query
}

export interface BuiltinCommand {
  name: string; // '/new' '/compact' ...
  desc: string; // i18n key
  acceptsInput?: boolean;
}

export interface Skill {
  name: string;
  description: string; // raw text(不是 i18n key)
  source: string;
}

// MentionMenu(@ 触发,同一骨架换数据源)
export interface MentionMenuProps {
  files: FileEntry[];
  query: string;
  filesLoading: boolean;
}

export interface MentionMenuEmits {
  (e: 'select', file: FileEntry): void;
  (e: 'close'): void;
  (e: 'update:query', q: string): void;
}

export interface FileEntry {
  path: string;
  name: string;
  kind: 'file' | 'dir';
}

export interface QueuePanelProps {
  queuedPrompts: QueuedPrompt[];
}

export interface QueuePanelEmits {
  (e: 'reorder', from: number, to: number): void;
  (e: 'promote-to-steer', id: string): void;
  (e: 'edit', id: string): void;
  (e: 'remove', id: string): void;
}

export interface QueuedPrompt {
  id: string;
  text: string;
  queuedAt: number;
}

// ---------------------------------------------------------------------------
// diff/ + detail/
// ---------------------------------------------------------------------------

export interface ChangedFile {
  path: string;
  status: 'M' | 'A' | 'D' | 'R' | 'U' | 'C';
  /** 行级统计;未知(git_status 只有总量)时缺省,UI 不显示 */
  additions?: number;
  deletions?: number;
}

export interface DiffViewProps {
  files: ChangedFile[];
  /**
   * 按文件路径分组的 hunks(轮次 3 修正:原 `hunks: DiffHunk[]` 单数组撑不起多文件)。
   * 跟 ReviewPane 的 `hunksByFile` 形状一致,DiffView/ReviewPane 数据源统一。
   * key = ChangedFile.path,value = 该文件的 hunks。
   */
  hunksByFile: Record<string, DiffHunk[]>;
  syntaxHighlight: boolean;
}

export type DetailPaneTab = 'thread' | 'thinking' | 'tools' | 'tasks';

export interface DetailPaneProps {
  open: boolean;
  tab: DetailPaneTab;
  threadInfo: ThreadMeta;
  thinkingFullText: string;
  toolCalls: ToolCall[];
  tasks: TodoView[];
}

export interface DetailPaneEmits {
  (e: 'set-tab', t: DetailPaneTab): void;
  (e: 'close'): void;
}

export interface ThreadMeta {
  workspace: string;
  createdAt: string;
  model: string;
  permission: PermissionMode;
  context: ContextInfo;
}

// ---------------------------------------------------------------------------
// agents/
// ---------------------------------------------------------------------------

export type SubagentStatus =
  | 'queued'
  | 'working'
  | 'suspended'
  | 'completed'
  | 'failed';

export interface Subagent {
  id: string;
  name: string;
  status: SubagentStatus;
  progress?: { current: number; total: number };
  summary?: string;
  /** 已运行时长(已完成 agent 的耗时,如 "12s" "1m 3s");kimi3 报的契约缺字段 */
  elapsed?: string;
}

export interface AgentPanelProps {
  active: Subagent[];
  completed: Subagent[];
}

export interface AgentPanelEmits {
  (e: 'inspect', id: string): void;
}

export interface SubagentCardProps {
  subagent: Subagent;
}

export interface SubagentCardEmits {
  (e: 'inspect'): void;
}

export interface AgentTranscriptProps {
  subagentId: string;
  turns: ChatTurn[];
}

// ---------------------------------------------------------------------------
// layout/(SideTask 是通用分栏容器,默认 slot 接内容)
// ---------------------------------------------------------------------------

export interface SideTaskProps {
  title: string;
  status: { text: string; kind: 'accent' | 'success' | 'warning' };
  thread: { name: string; ws: string; dot: 'running' | 'waiting' | 'done' };
}

// ThreadMenu / FileMenu / Toast:见 ARCHITECTURE.md 第 4.8 节,纯 UI 组件,
// props 多为一次性传入数据(无跨组件状态),按需在 kimi3 轮次 2 落地时补。
