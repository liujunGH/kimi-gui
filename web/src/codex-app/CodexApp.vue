<script setup lang="ts">
/**
 * CodexApp —— codex UI 的真产品入口
 *
 * 轮次 4a(kimi3 装配):在 C1 主链路(Sidebar/Conversation/Composer)之上,
 * 把轮次 2 的组件全部挂上真 client 数据:
 * - DetailPane(⌘I)/ SideTask(⌥⌘S)/ ThreadMenu / AgentPanel(子智能体)/ SettingsPage(覆盖层)
 * - 审批卡随 turn.approval 在对话流内联渲染(approve/reject 走 client.respondApproval)
 * - 新建任务 = 一键草稿态 + 聚焦;工作区选择 = 侧栏组名点选,「工作区」标题行 + 添加(原生文件夹选择)
 * - Composer 数据:skills(真)/ builtin(i18n)/ queue(真)/ context(真 usage)
 *
 * 数据边界:组件零 mock;context quota、文件树、diff/review 数据流等轮次 4(ZCode)。
 */
import { computed, defineAsyncComponent, onMounted, onUnmounted, provide, ref, watch } from 'vue';
import { useKimiWebClient } from '../composables/useKimiWebClient';
import { KIMI_CLIENT_KEY } from '../composables/codex/useKimiClient';
import { useUIState } from '../composables/codex/useUIState';
import { useHotkeys } from '../composables/codex/useHotkeys';
import { useTheme } from '../composables/codex/useTheme';
import { useTauriDaemon } from '../composables/codex/useTauriDaemon';
import { getCredential, onAuthRequired, setEphemeralCredential } from '../api/daemon/serverAuth';
import { getKimiWebApi } from '../api';
import { SLASH_COMMANDS } from '../lib/slashCommands';
import i18n from '../i18n';
import type { ChatTurn, TodoView } from '../types';
import type {
  ChangedFile,
  ContextInfo,
  DiffHunk,
  EffortLevel,
  PromptAttachment,
  ComposerMode,
  ModeFlags,
  QueuedPrompt,
  QuotaInfo,
  SessionFilter,
  Subagent,
} from '../types/codex';
import type { PermissionMode } from '../types';

import AppShell from '../components/codex/AppShell.vue';
import Sidebar from '../components/codex/sidebar/Sidebar.vue';
import ConversationPane from '../components/codex/chat/ConversationPane.vue';
import Composer from '../components/codex/composer/Composer.vue';
import QueuePanel from '../components/codex/composer/QueuePanel.vue';
import DetailPane from '../components/codex/detail/DetailPane.vue';
import SideTask from '../components/codex/layout/SideTask.vue';
import ThreadMenu from '../components/codex/layout/ThreadMenu.vue';
import WorkspacePicker from '../components/codex/layout/WorkspacePicker.vue';
import Toast, { useToast } from '../components/codex/layout/Toast.vue';
import PromptDialog from '../components/codex/layout/PromptDialog.vue';
import AgentPanel from '../components/codex/agents/AgentPanel.vue';
import ReviewPane from '../components/codex/diff/ReviewPane.vue';
import OfficialModelPicker from '../components/settings/ModelPicker.vue';
import Onboarding from '../components/settings/Onboarding.vue';
import OfficialGoalStrip from '../components/chat/GoalStrip.vue';
import OfficialServerAuthDialog from '../components/ServerAuthDialog.vue';
import CommandPalette, { type PaletteAction, type PaletteSession } from '../components/codex/layout/CommandPalette.vue';
import UpdateDialog from '../components/codex/layout/UpdateDialog.vue';
import { useUpdater } from '../composables/codex/useUpdater';
import { formatLocalDateTime } from '../lib/formatMessageTime';
import type { UIQuestion } from '../types';
import { toDiffHunks } from '../components/codex/diff/diffMapper';
import CodexIcon from '../components/codex/layout/CodexIcon.vue';
import MessageUser from '../components/codex/chat/MessageUser.vue';
import ApprovalCard from '../components/codex/approval/ApprovalCard.vue';
import { fromApprovalBlock } from '../components/codex/approval/approvalMapper';
import AgentPicker from '../components/codex/composer/AgentPicker.vue';
import { copyTextToClipboard } from '../lib/clipboard';
import { kimiRuntime, type KimiAgentProfile } from '../composables/useKimiRuntime';
import type { AppAgentConfigInput } from '../api/types';
import { quotaInfoFromOAuthUsage } from '../lib/quotaUsage';

const SettingsPage = defineAsyncComponent(
  () => import('../components/codex/settings/SettingsPage.vue'),
);
const MessageAssistant = defineAsyncComponent(
  () => import('../components/codex/chat/MessageAssistant.vue'),
);
const OfficialQuestionCard = defineAsyncComponent(
  () => import('../components/chat/QuestionCard.vue'),
);
const ProviderManager = defineAsyncComponent(
  () => import('../components/settings/ProviderManager.vue'),
);

// 1. 顶层 client 装配 + provide(整个 codex UI 的数据源)
const client = useKimiWebClient();
provide(KIMI_CLIENT_KEY, client);
// 官方 Markdown.vue inject('resolveImage') 用于解析消息里的本地图片路径
provide('resolveImage', client.resolveImageUrl);

// shell 先挂载；Tauri 下凭证通过 IPC 取回后再拉首轮数据，避免未授权请求和冷启动白屏。
const tauriDaemon = useTauriDaemon();
const booting = ref(true);
async function bootClient(): Promise<void> {
  try {
    if (tauriDaemon.isTauri() && !getCredential()) {
      const info = await tauriDaemon.fetch();
      if (info?.token) setEphemeralCredential(info.token);
    }
    await client.load();
  } finally {
    booting.value = false;
  }
}
onMounted(() => void bootClient());

// 2. UI 状态
const ui = useUIState();
const { toggle: toggleTheme } = useTheme();
const { toast } = useToast();

// 401 监听:daemon 拒绝 token 时弹官方 ServerAuthDialog(浏览器 dev 流程)
const authRequired = ref(false);
let offAuthRequired: (() => void) | null = null;
onMounted(() => {
  offAuthRequired = onAuthRequired(() => {
    authRequired.value = true;
    client.clearDangerousBypassAuth();
  });
});
onUnmounted(() => offAuthRequired?.());
const showServerAuth = computed(
  () => !client.dangerousBypassAuth.value && authRequired.value,
);

// 启动静默检查更新(失败静默;发现新版本弹 UpdateDialog)
const { checkForUpdate } = useUpdater();
onMounted(() => {
  setTimeout(() => void checkForUpdate(true), 5000);
});

// daemon 连接失败兜底提示。桌面凭证只保存在内存中，不能检查旧版的
// localStorage key：桌面入口会主动删除它，所以那个判断会在已经连接时也
// 固定误报。只有连接仍未恢复且 IPC 也没拿到凭证时才提示。
onMounted(() => {
  setTimeout(() => {
    try {
      if (
        '__TAURI_INTERNALS__' in window &&
        client.connection.value !== 'connected' &&
        !getCredential()
      ) {
        toast('本地 daemon 尚未就绪，请在「设置 → Kimi Engine」检查 CLI');
      }
    } catch {
      /* ignore */
    }
  }, 12000);
});

// 双击标题栏放大/还原(macOS Overlay 标题栏样式下没有原生行为,手动实现):
// 模板级 @dblclick 绑定在 .app-toolbar / .sidebar-brand,非交互元素时才触发
const { toggleWindowZoom } = tauriDaemon;
function onTitlebarDblClick(e: MouseEvent) {
  const t = e.target as HTMLElement | null;
  if (
    t?.closest(
      'button, a, input, textarea, select, [role="button"], .toolbar-thinking-toggle, .thread-menu, .ws-menu, .wp-pop, .model-pop',
    )
  )
    return;
  void toggleWindowZoom();
}

// 3. 侧栏 + Composer 状态
const filter = ref<SessionFilter>((localStorage.getItem('kimi-ui.session-filter') as SessionFilter) || 'all');
watch(filter, (f) => localStorage.setItem('kimi-ui.session-filter', f));
// 置顶持久化(localStorage;无 daemon 端点,纯客户端偏好)
const PIN_KEY = 'codex.pinned-sessions';
const pinnedIds = ref<string[]>((() => {
  try {
    const v = JSON.parse(localStorage.getItem(PIN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
})());
watch(pinnedIds, (v) => {
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}, { deep: true });
const composerMode = ref<ComposerMode>('queue');
const settingsOpen = ref(false);
const showOnboarding = ref(!client.onboarded.value);
const agentsLoading = ref(false);
const agentProfiles = ref<KimiAgentProfile[]>([]);
const draftAgentName = ref('default');
const agentBySession = ref<Record<string, string>>({});
let pendingAgentBinding: string | null = null;

async function loadAgents(): Promise<void> {
  if (!tauriDaemon.isTauri()) return;
  agentsLoading.value = true;
  try {
    const root = client.workspacesView.value.find((workspace) => workspace.id === client.activeWorkspaceId.value)?.root;
    agentProfiles.value = await kimiRuntime.listAgents(root);
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Agent 列表加载失败');
  } finally {
    agentsLoading.value = false;
  }
}

const composerAgentName = computed(() => {
  const sid = client.activeSessionId.value;
  return sid ? (agentBySession.value[sid] ?? 'default') : draftAgentName.value;
});
watch(() => client.activeWorkspaceId.value, () => void loadAgents());
watch(() => client.activeSessionId.value, (sid) => {
  if (sid && pendingAgentBinding) {
    agentBySession.value = { ...agentBySession.value, [sid]: pendingAgentBinding };
    pendingAgentBinding = null;
  }
});

function selectedAgentConfig(): AppAgentConfigInput | undefined {
  if (draftAgentName.value === 'default') return undefined;
  const profile = agentProfiles.value.find((agent) => agent.name === draftAgentName.value);
  if (!profile) return undefined;
  return {
    systemPrompt: profile.prompt,
    ...(profile.tools.length > 0 ? { tools: profile.tools } : {}),
  };
}

function openAgentSettings(): void {
  settingsSection.value = 'agents';
  settingsOpen.value = true;
}

function togglePin(id: string) {
  pinnedIds.value = pinnedIds.value.includes(id)
    ? pinnedIds.value.filter((x) => x !== id)
    : [...pinnedIds.value, id];
  toast(pinnedIds.value.includes(id) ? '已置顶' : '已取消置顶');
}

let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
let searchGeneration = 0;

/** Cmd+K / 侧栏搜索框点击：先用已加载会话，输入后再查询 daemon 全文索引。 */
function openSearch() {
  showSearch.value = true;
  searchSessionIndex.value = [];
  searchLoading.value = false;
  searchHint.value = '输入至少 2 个字可搜索全部历史';
  searchGeneration++;
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
}

function onPaletteQuery(value: string): void {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  const query = value.trim();
  const generation = ++searchGeneration;
  searchSessionIndex.value = [];
  searchLoading.value = false;
  if (query.length < 2) {
    searchHint.value = query ? '再输入 1 个字以搜索全部历史' : '输入至少 2 个字可搜索全部历史';
    return;
  }
  searchHint.value = '';
  searchDebounceTimer = setTimeout(() => {
    searchLoading.value = true;
    void getKimiWebApi().searchAll({ query, pageSize: 50 }).then((result) => {
      if (generation !== searchGeneration) return;
      const workspaces = client.workspacesView.value ?? [];
      const unique = new Map<string, PaletteSession>();
      for (const item of result.items) {
        if (unique.has(item.sessionId)) continue;
        const workspace = workspaces.find((candidate) => candidate.id === item.workspaceId);
        unique.set(item.sessionId, {
          id: item.sessionId,
          title: item.sessionTitle || item.sessionId,
          meta: workspace?.name,
          workspaceName: workspace?.name,
          lastPrompt: item.snippet,
        });
      }
      searchSessionIndex.value = [...unique.values()];
      searchHint.value = result.indexState.state === 'building'
        ? `索引构建中 · 已找到 ${unique.size} 条`
        : unique.size > 0
          ? `${unique.size} 条全局结果${result.incomplete ? ' · 结果可能不完整' : ''}`
          : '没有匹配的历史会话';
    }).catch((error) => {
      if (generation !== searchGeneration) return;
      console.warn('[kimi-gui] global session search failed', error);
      searchHint.value = '全局搜索暂不可用，已显示当前加载的会话';
    }).finally(() => {
      if (generation === searchGeneration) searchLoading.value = false;
    });
  }, 250);
}
onUnmounted(() => { if (searchDebounceTimer) clearTimeout(searchDebounceTimer); });

useHotkeys([
  {
    key: 'k',
    meta: true,
    handler: () => {
      openSearch();
      return true;
    },
  },
  {
    key: 'i',
    meta: true,
    handler: () => {
      ui.detailPaneOpen.value ? ui.closeDetail() : ui.openDetail('thread');
      return true;
    },
  },
  {
    key: 's',
    meta: true,
    alt: true,
    handler: () => {
      ui.sideTaskOpen.value ? ui.closeSideTask() : ui.openSideTask('thread');
      return true;
    },
  },
  {
    key: 'p',
    meta: true,
    alt: true,
    handler: () => {
      if (client.activeSessionId.value) togglePin(client.activeSessionId.value);
      return true;
    },
  },
  {
    key: 'b',
    meta: true,
    handler: () => {
      if (!changedFiles.value.length) return;
      ui.reviewPaneOpen.value ? ui.closeReview() : ui.openReview();
      return true;
    },
  },
  {
    key: 'r',
    meta: true,
    alt: true,
    handler: () => {
      // ⌥⌘R 重命名(ThreadMenu 里已标注该快捷键)
      onRenameSession();
      return true;
    },
  },
  {
    key: 'a',
    meta: true,
    shift: true,
    handler: () => {
      // ⇧⌘A 归档(ThreadMenu 里已标注该快捷键)
      if (client.activeSessionId.value) void client.archiveSession(client.activeSessionId.value);
      return true;
    },
  },
  {
    key: 'Escape',
    handler: () => {
      // 先分层关闭浮层;无浮层可关时,运行中则中断当前轮(对齐官方 ConversationPane 的 Esc)
      if (ui.escClose()) return true;
      if (conversationRunning.value) {
        void client.abortCurrentPrompt();
        return true;
      }
      return false;
    },
  },
]);

// ---------------------------------------------------------------- 侧栏数据

const sidebarWorkspaces = computed(() => client.workspacesView.value ?? []);
const sidebarSessions = computed(() => client.sessionsForView.value ?? []);
const sidebarCurrentWsId = computed(() => client.activeWorkspaceId.value ?? '');
const sidebarCurrentWs = computed(() => {
  const id = client.activeWorkspaceId.value ?? '';
  return (client.workspacesView.value ?? []).find((w) => w.id === id)?.name ?? id;
});
const sidebarCurrentSession = computed(() => client.activeSessionId.value ?? '');
const activeSession = computed(
  () => (client.sessions.value ?? []).find((s) => s.id === client.activeSessionId.value) ?? null,
);

// ---------------------------------------------------------------- 对话流数据

const conversationTurns = computed<ChatTurn[]>(() => client.turns.value ?? []);
const conversationRunning = computed(() => client.working.value || client.turnActive.value);
async function copyLatestAssistantResponse(): Promise<void> {
  for (let i = conversationTurns.value.length - 1; i >= 0; i--) {
    const turn = conversationTurns.value[i];
    if (!turn || turn.role !== 'assistant') continue;
    const text = (turn.blocks ?? [])
      .filter((block) => block.kind === 'text')
      .map((block) => (block.kind === 'text' ? block.text : ''))
      .filter(Boolean)
      .join('\n\n') || turn.text;
    if (!text.trim()) continue;
    toast((await copyTextToClipboard(text)) ? '已复制最近一条回复' : '复制失败');
    return;
  }
  toast('当前会话还没有可复制的回复');
}

function markdownSafeFileName(value: string): string {
  return (value || 'kimi-conversation')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'kimi-conversation';
}

function markdownTurn(turn: ChatTurn): string {
  if (turn.role === 'compaction') {
    const meta = turn.compaction;
    const tokens = meta?.tokensBefore ? ` · ${meta.tokensBefore} → ${meta.tokensAfter ?? '?'} tokens` : '';
    return `---\n\n> 上下文压缩（${meta?.trigger === 'auto' ? '自动' : '手动'}${tokens}）\n\n${turn.text || '_无摘要_'}\n`;
  }
  const label = turn.role === 'user' ? '用户' : turn.role === 'cron' ? '自动任务' : 'Kimi';
  const stamp = turn.createdAt ? ` · ${new Date(turn.createdAt).toLocaleString()}` : '';
  const sections: string[] = [`## ${label}${stamp}\n`];
  if (turn.attachments?.length) {
    sections.push(turn.attachments.map((item) => {
      const name = item.name || item.fileId || item.kind;
      return item.url && !item.url.startsWith('data:') ? `- 附件：[${name}](${item.url})` : `- 附件：${name}`;
    }).join('\n'));
  }
  const blocks = turn.blocks?.length ? turn.blocks : turn.text ? [{ kind: 'text' as const, text: turn.text }] : [];
  for (const block of blocks) {
    if (block.kind === 'text' && block.text.trim()) sections.push(block.text);
    else if (block.kind === 'thinking' && block.thinking.trim()) {
      sections.push(`<details>\n<summary>思考过程</summary>\n\n${block.thinking}\n\n</details>`);
    } else if (block.kind === 'tool') {
      const tool = block.tool;
      const output = tool.output?.length ? `\n\n\`\`\`text\n${tool.output.join('\n')}\n\`\`\`` : '';
      sections.push(`### 工具：${tool.name}\n\n- 参数：${tool.arg || '—'}\n- 状态：${tool.status}${tool.timing ? ` · ${tool.timing}` : ''}${output}`);
    }
  }
  if (turn.cron) sections.push(`> 自动任务：${turn.cron.cron || turn.cron.jobId || '计划触发'}`);
  return `${sections.join('\n\n')}\n`;
}

function exportConversationMarkdown(): void {
  const session = activeSession.value;
  if (!session) {
    toast('请先打开一个会话');
    return;
  }
  const workspace = client.workspacesView.value.find((item) => item.id === session.workspaceId);
  const metadata = [
    `# ${session.title || 'Kimi 对话'}`,
    '',
    `- 会话 ID：${session.id}`,
    `- 工作区：${workspace?.root || session.workspaceName || '—'}`,
    `- 模型：${client.status.value?.modelId || '—'}`,
    `- 导出时间：${new Date().toLocaleString()}`,
    '',
  ];
  const markdown = `${metadata.join('\n')}\n${conversationTurns.value.map(markdownTurn).join('\n')}`;
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${markdownSafeFileName(session.title)}.md`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  toast('Markdown 已导出');
}
const lastAssistantTurnId = computed(() => {
  for (let i = conversationTurns.value.length - 1; i >= 0; i--) {
    if (conversationTurns.value[i]?.role === 'assistant') return conversationTurns.value[i]!.id;
  }
  return '';
});
const todosByTurn = computed<Record<string, TodoView[]>>(() => {
  const todos = client.todos.value ?? [];
  return lastAssistantTurnId.value && todos.length ? { [lastAssistantTurnId.value]: todos } : {};
});
const approvalCount = computed(() => (client.pendingApprovals.value ?? []).length);
/**
 * Most approvals are attached to their tool-use turn by messagesToTurns.
 * Snapshot/event races can leave a valid approval without a loaded tool-use;
 * keep those visible at the transcript tail instead of showing only a count.
 */
const standaloneApprovals = computed(() => {
  const anchored = new Set(
    conversationTurns.value
      .map((turn) => turn.approvalId)
      .filter((id): id is string => Boolean(id)),
  );
  return (client.pendingApprovals.value ?? [])
    .filter((approval) => !anchored.has(approval.approvalId))
    .map((approval) => fromApprovalBlock(approval.block, approval.approvalId));
});
// agent 提问(对话流内联 QuestionCard)
const pendingQuestions = computed<UIQuestion[]>(() => client.questions.value ?? []);
const currentQuestion = computed(() => pendingQuestions.value[0] ?? null);
// 目标条(/goal 创建后显示)
const activeGoal = computed(() => client.goal.value ?? null);
// 压缩摘要(/compact 后显示分隔线)
const compactionInfo = computed(() => client.compaction.value ?? null);
// daemon 警告
const activeWarnings = computed(() => client.warnings.value ?? []);
// 侧栏未读数(用于 Dock badge)
const unreadCount = computed(() => {
  const m = client.unreadBySession.value;
  if (!m) return 0;
  return Object.values(m).filter((v) => v).length;
});
// 压缩分隔线(对话流中显示"上下文已压缩")
const hasCompaction = computed(() => compactionInfo.value !== null);
/** transcript 压缩分隔线点击 → 右栏展示该 turn 的摘要文本(turn.text 即 LLM 摘要) */
function onViewCompaction(turn: ChatTurn) {
  const meta = turn.compaction;
  const tokens = meta?.tokensBefore
    ? ` · ${meta.tokensBefore} → ${meta.tokensAfter ?? '?'} tokens`
    : '';
  const head = `// 上下文压缩摘要(${meta?.trigger === 'auto' ? '自动' : '手动'}${tokens})\n\n`;
  filePreviewContent.value = head + (turn.text || '(无摘要内容)');
  ui.openDetail('thinking');
}
// 未读数变化时更新 Dock badge
watch(unreadCount, (n) => {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    import('@tauri-apps/api/core').then(({ invoke }) => {
      void invoke('set_dock_badge', { count: n });
    }).catch(() => {});
  }
});

const thinkingFullText = computed(() => {
  // 文件预览内容优先(点文件路径时临时显示)
  if (filePreviewContent.value) return filePreviewContent.value;
  // 面板关闭时不做全会话重算(流式期间每个 token 都触发 computed 求值)
  if (!ui.detailPaneOpen.value) return '';
  return conversationTurns.value
    .flatMap((t) => (t.blocks ?? []).filter((b) => b.kind === 'thinking'))
    .map((b) => (b.kind === 'thinking' ? b.thinking : ''))
    .join('\n\n');
});

// 文件预览内容(简化版:复用 DetailPane thinking tab 的 pre 渲染)
const filePreviewContent = ref('');
/** DetailPane 思考大纲分段:与 thinkingFullText 同一 flatMap 顺序,按下标对齐 */
const thinkingSegments = computed(() => {
  if (!ui.detailPaneOpen.value) return [];
  return conversationTurns.value.flatMap((t, ti) =>
    (t.blocks ?? [])
      .filter((b) => b.kind === 'thinking')
      .map((b, bi) => ({
        id: `${t.id}#${bi}`,
        label: `turn ${ti + 1} · ${(b.kind === 'thinking' ? b.thinking : '').trim().slice(0, 60)}`,
      })),
  );
});
const toolCalls = computed(() => {
  if (!ui.detailPaneOpen.value) return []; // 同上:面板关闭零成本
  return conversationTurns.value
    .flatMap((t) => (t.blocks ?? []).filter((b) => b.kind === 'tool'))
    .map((b) => (b.kind === 'tool' ? b.tool : null))
    .filter((x): x is NonNullable<typeof x> => x !== null);
});

// ---------------------------------------------------------------- Composer 数据

const composerPermission = computed(() => client.permission.value ?? 'manual');
const composerModels = computed(() =>
  (client.models.value ?? []).map((m) => ({
    id: m.id,
    name: (m as { displayName?: string }).displayName ?? m.model ?? m.id,
  })),
);
const composerCurrentModel = computed(() => {
  // 优先读 session 真实选中的 model（status.modelId 是 raw id）
  const statusModelId = client.status.value?.modelId;
  if (statusModelId) return statusModelId;
  // 无 session 时用 starred 或第一个
  const models = client.models.value;
  if (!models || models.length === 0) return '';
  const starred = models.find((m) => client.starredModelIds.value?.includes(m.id));
  return (starred ?? models[0])?.id ?? '';
});
const composerModes = computed<ModeFlags>(() => ({
  plan: client.planMode.value || false,
  swarm: client.swarmMode.value || false,
  goal: client.goalMode.value || false,
}));
const builtinCommands = computed(() =>
  SLASH_COMMANDS.map((c) => ({ ...c, name: c.name.replace(/^\//, ''), desc: i18n.global.t(c.desc) })),
);
const composerSkills = computed(() =>
  (client.skills.value ?? []).map((s) => ({
    name: s.name,
    description: s.description ?? '',
    source: 'session',
  })),
);
const queueItems = computed<QueuedPrompt[]>(() =>
  (client.queued.value ?? []).map((q, i) => ({ id: String(i), text: q.text, queuedAt: i })),
);

function fmtK(n: number): string {
  if (!n) return '0';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
const ctxInfo = computed<ContextInfo>(() => {
  const used = client.status.value?.ctxUsed ?? 0;
  const limit = client.status.value?.ctxMax ?? 0;
  return {
    used: fmtK(used),
    total: fmtK(limit),
    pct: limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0,
  };
});

// ---------------------------------------------------------------- 计划额度
// 优先用 daemon 0.29+ 的 REST 端点 GET /oauth/usage(更稳定);
// fallback 到 Tauri PTY 抓取(0.28 及更早);浏览器为 0 占位。

const quotaInfo = ref<QuotaInfo>({ q5h: 0, q5hReset: '', qWeek: 0, qWeekReset: '' });
const { fetchPlanUsage } = tauriDaemon;

async function pollPlanUsage() {
  // 优先 REST(daemon 0.29+)
  try {
    const usage = await client.getOAuthUsage();
    const parsed = quotaInfoFromOAuthUsage(usage);
    if (parsed) {
      quotaInfo.value = parsed;
      return;
    }
  } catch {
    // daemon 不支持 REST → fallback PTY
  }
  // Fallback: Tauri PTY 抓取(0.28 及更早)
  const u = await fetchPlanUsage();
  if (u && !u.loading) {
    quotaInfo.value = {
      q5h: u.hourly_pct,
      q5hReset: u.hourly_reset,
      qWeek: u.weekly_pct,
      qWeekReset: u.weekly_reset,
    };
  }
}
// /usage 的 PTY fallback 很重：让首屏和 daemon 会话加载先完成，并尊重十分钟缓存。
const planUsageWarmTimer = setTimeout(() => void pollPlanUsage(), 30_000);
const planUsageTimer = setInterval(pollPlanUsage, 10 * 60_000);
onUnmounted(() => {
  clearTimeout(planUsageWarmTimer);
  clearInterval(planUsageTimer);
});

// thinking effort 映射:daemon 实际支持('off'|'low'|'high'|'max')
// → 契约 EffortLevel('Low'|'High'|'Max')
const composerEffort = computed<EffortLevel | null>(() => {
  const t = client.thinking.value;
  if (!t || t === 'off' || t === 'none' || t === 'minimal') return null;
  if (t === 'low' || t === 'medium') return 'Low';
  if (t === 'high') return 'High';
  return 'Max'; // max
});

// ---------------------------------------------------------------- 子智能体

const subagents = computed<Subagent[]>(() =>
  (client.tasks.value ?? [])
    .filter((t) => t.kind === 'subagent')
    .map((t) => ({
      id: t.id,
      name: t.name,
      status:
        t.subagentPhase === 'queued'
          ? 'queued'
          : t.subagentPhase === 'suspended'
            ? 'suspended'
            : t.subagentPhase === 'completed' || t.state === 'done'
              ? 'completed'
              : t.subagentPhase === 'failed' || t.state === 'fail'
                ? 'failed'
                : 'working',
      summary: t.suspendedReason ?? t.meta ?? t.output?.[0] ?? '',
      elapsed: t.timing,
    })),
);
const activeSubagents = computed(() =>
  subagents.value.filter((s) => ['working', 'queued', 'suspended'].includes(s.status)),
);
const completedSubagents = computed(() =>
  subagents.value.filter((s) => s.status === 'completed' || s.status === 'failed'),
);

const sideSubTask = computed(() => {
  const id = ui.sideTaskSubagentId.value;
  return id ? (client.tasks.value ?? []).find((t) => t.id === id) ?? null : null;
});
// 侧边对话(/btw)真数据
const sideChatTurns = computed(() => client.sideChatTurns.value ?? []);
const sideChatRunning = computed(() => client.sideChatRunning.value ?? false);
function onSideChatSend(text: string) {
  if (text.trim()) void client.sendSideChatPrompt(text);
}

const sideTaskProps = computed(() => {
  const t = sideSubTask.value;
  if (ui.sideTaskKind.value === 'agent-transcript' && t) {
    return {
      title: t.name,
      status:
        t.subagentPhase === 'suspended'
          ? { text: '等待输入', kind: 'warning' as const }
          : t.subagentPhase === 'queued'
            ? { text: '排队中', kind: 'accent' as const }
            : t.state === 'done'
          ? { text: '已完成', kind: 'success' as const }
          : t.state === 'fail'
            ? { text: '已失败', kind: 'warning' as const }
            : { text: '运行中', kind: 'accent' as const },
      thread: {
        name: t.name,
        ws: '子智能体',
        dot:
          t.subagentPhase === 'suspended'
            ? ('waiting' as const)
            : t.state === 'done'
              ? ('done' as const)
              : ('running' as const),
      },
      composerVisible: false,
      draftKey: `agent:${t.id}`,
    };
  }
  return {
    title: '侧边任务',
    status: { text: conversationRunning.value ? '运行中' : '空闲', kind: 'accent' as const },
    thread: { name: sidebarCurrentWs.value || 'Kimi Code', ws: sidebarCurrentWs.value, dot: 'running' as const },
    composerVisible: true,
    draftKey: `thread:${client.activeSessionId.value ?? 'draft'}`,
  };
});

function openTranscript(id: string) {
  ui.closeAgentPanel();
  ui.openSideTask('agent-transcript', id);
}

/** AgentPanel/SubagentCard 行内 stop → 取消子任务 */
function onCancelTask(id: string) {
  void client.cancelTask(id);
}

/** 用户消息「编辑重发」:撤销该 turn 及之后所有 turn,文本回填输入框 */
function onEditMessage(turn: ChatTurn) {
  const idx = conversationTurns.value.findIndex((t) => t.id === turn.id);
  if (idx < 0) return;
  promptDialog.value = {
    title: '编辑并重发?',
    description: '将撤销这条消息及之后的全部回复,原内容回填到输入框。',
    confirmLabel: '撤销并回填',
    danger: true,
    input: false,
    onConfirm: () => {
      const n = conversationTurns.value.length - idx;
      void client.undo(n).then(() => composerRef.value?.setText(turn.text));
    },
  };
}

// ---------------------------------------------------------------- 事件处理

function onSend(text: string, mode: ComposerMode, attachments?: PromptAttachment[]) {
  if (!text.trim() && !attachments?.length) return;
  if (client.connection.value !== 'connected') {
    toast('未连接到 daemon,无法发送');
    return;
  }
  if (mode === 'steer' && conversationRunning.value) {
    void client.steerPrompt(text, attachments as any);
    // B4:steer 反馈(原型有气泡,真 app 至少给 toast;思考块 steerMark 待数据侧接线)
    toast('已插话到当前轮');
    return;
  }
  // 无 active session:走 startSessionAndSendPrompt 开新会话发首条(对齐官方 App.vue handleSubmit;
  // 直接 sendPrompt 会在 useWorkspaceState 里静默丢弃,新任务流程断链)
  if (!client.activeSessionId.value) {
    const wsId = client.activeWorkspaceId.value;
    if (wsId) {
      pendingAgentBinding = draftAgentName.value;
      void client.startSessionAndSendPrompt(wsId, text, attachments as any, selectedAgentConfig());
    }
    else toast('请先在左侧选择工作区');
    return;
  }
  void client.sendPrompt(text, attachments as any);
}
function onSelectSession(id: string) {
  void client.selectSession(id);
}
async function onSelectPaletteSession(id: string): Promise<void> {
  showSearch.value = false;
  try {
    await client.selectSessionFromSearch(id);
  } catch (error) {
    toast(error instanceof Error ? error.message : '无法打开搜索结果');
  }
}
/** 新建任务:一键进当前工作区的草稿态(首条消息自动开新会话),并聚焦输入框 */
function onNewTask() {
  settingsOpen.value = false; // 设置页开着时先回主界面
  client.clearActiveSession();
  draftAgentName.value = 'default';
  composerRef.value?.focus?.();
}
/** 点工作区组名 = 切换活跃工作区(对齐 kimi web:列表即选择器) */
function onSelectWorkspace(id: string) {
  client.openWorkspace(id);
}
async function onCopyWorkspacePath(root: string) {
  try {
    await navigator.clipboard.writeText(root);
    toast('已复制工作区路径');
  } catch {
    toast('复制失败');
  }
}
/** 「工作区」标题行 + → 原生文件夹选择 → 添加 */
async function onAddWorkspace() {
  try {
    const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
    const picked = await openDialog({ directory: true, multiple: false, title: '选择工作区文件夹' });
    if (typeof picked === 'string' && picked) void client.addWorkspaceByPath(picked);
  } catch {
    toast('当前环境不支持文件夹选择');
  }
}
function onComposerMode(m: ComposerMode) {
  composerMode.value = m;
}

/** EffortLevel → 官方 ThinkingLevel 反向映射 */
const EFFORT_TO_THINKING: Record<EffortLevel, string> = {
  Low: 'low',
  High: 'high',
  Max: 'max',
};

/**
 * 斜杠命令处理(从官方 App.vue handleCommand 移植)
 * 处理所有无参命令(acceptsInput 命令在输入框留参,用户发消息时走 onSend)
 */
function handleCommand(cmd: string): void {
  // 带参命令:从消息文本里解析(command 可能含参数,如 "/compact 只保留 API 相关")
  if (cmd.startsWith('/compact')) {
    void client.compact(cmd.slice('/compact'.length).trim() || undefined);
    return;
  }
  if (cmd.startsWith('/swarm')) {
    const arg = cmd.slice('/swarm'.length).trim();
    if (arg === 'on') client.setSwarmMode(true);
    else if (arg === 'off') client.setSwarmMode(false);
    else if (arg) { client.setSwarmMode(true); void client.sendPrompt(arg); }
    else void client.toggleSwarmMode();
    return;
  }
  if (cmd.startsWith('/goal')) {
    const arg = cmd.slice('/goal'.length).trim();
    if (arg === 'pause' || arg === 'resume' || arg === 'cancel') client.controlGoal(arg);
    else if (arg) void client.createGoal(arg);
    else client.toggleGoalMode();
    return;
  }
  if (cmd.startsWith('/btw')) {
    const arg = cmd.slice('/btw'.length).trim();
    // 裸 /btw 是 toggle(对齐官方):开着就关,关着就开侧边分栏
    if (arg) void client.openSideChat(arg);
    else if (ui.sideTaskOpen.value) client.closeSideChat();
    else ui.openSideTask('thread');
    return;
  }
  switch (cmd) {
    case '/new':
    case '/clear':
      client.clearActiveSession();
      break;
    case '/fork':
      void client.forkSession();
      break;
    case '/copy':
      void copyLatestAssistantResponse();
      break;
    case '/export':
      void client.exportSession();
      break;
    case '/undo':
      void client.undo();
      break;
    case '/plan':
      client.togglePlanMode();
      break;
    case '/auto':
      client.setPermission('auto');
      break;
    case '/yolo':
      client.setPermission('yolo');
      break;
    case '/thinking':
      client.setThinking('high');
      break;
    case '/status':
      ui.openDetail('tasks');
      break;
    case '/login':
      toast('已通过 daemon token 自动登录');
      break;
    case '/review':
      if (changedFiles.value.length) ui.openReview();
      else toast('暂无改动');
      break;
    case '/permissions':
      settingsSection.value = 'permissions';
      settingsOpen.value = true;
      break;
    default: {
      // 未匹配 → 当 skill 激活(排除已知非 skill)
      const stripped = cmd.slice(1).split(' ')[0];
      if (stripped && !['login', 'status'].includes(stripped)) {
        void client.activateSkill(stripped);
      }
    }
  }
}

/** 应用内输入/确认弹层状态(WKWebView 无 window.prompt,统一走 PromptDialog) */
interface PromptDialogState {
  title: string;
  description?: string;
  placeholder?: string;
  initial?: string;
  confirmLabel?: string;
  danger?: boolean;
  input: boolean;
  onConfirm: (v: string) => void;
}
const promptDialog = ref<PromptDialogState | null>(null);

/** 重命名当前 session */
function onRenameSession() {
  const id = client.activeSessionId.value;
  if (!id) return;
  promptDialog.value = {
    title: '重命名任务',
    initial: activeSession.value?.title ?? '',
    confirmLabel: '重命名',
    input: true,
    onConfirm: (v) => void client.renameSession(id, v),
  };
}
function onRenameWorkspace(id?: string) {
  const workspaceId = id || client.activeWorkspaceId.value;
  if (!workspaceId) return;
  const name = client.workspacesView.value.find((w) => w.id === workspaceId)?.name ?? '';
  promptDialog.value = {
    title: '重命名工作区',
    initial: name || sidebarCurrentWs.value,
    confirmLabel: '重命名',
    input: true,
    onConfirm: (v) => void client.renameWorkspace(workspaceId, v),
  };
}
function onDeleteWorkspace(id?: string) {
  const workspaceId = id || client.activeWorkspaceId.value;
  if (!workspaceId) return;
  const name = client.workspacesView.value.find((w) => w.id === workspaceId)?.name ?? workspaceId;
  promptDialog.value = {
    title: `移除工作区「${name}」?`,
    description: '会话数据保留,可重新添加。',
    confirmLabel: '移除',
    danger: true,
    input: false,
    onConfirm: () => void client.deleteWorkspace(workspaceId),
  };
}

function onDeleteProvider(id: string) {
  promptDialog.value = {
    title: `删除 Provider「${id}」?`,
    description: '会移除它的配置和模型目录；已存在会话不会被删除。',
    confirmLabel: '删除',
    danger: true,
    input: false,
    onConfirm: () => void client.deleteProvider(id),
  };
}

/** 侧栏行内菜单:按 id 操作任意 session(不切换活跃会话) */
function onRenameSessionById(id: string) {
  const title = client.sessions.value.find((s) => s.id === id)?.title ?? '';
  promptDialog.value = {
    title: '重命名任务',
    initial: title,
    confirmLabel: '重命名',
    input: true,
    onConfirm: (v) => void client.renameSession(id, v),
  };
}
function onArchiveSessionById(id: string) {
  promptDialog.value = {
    title: '归档任务?',
    description: '归档后可在设置中恢复。',
    confirmLabel: '归档',
    danger: true,
    input: false,
    onConfirm: () => void client.archiveSession(id),
  };
}
function onExportSessionById(id: string) {
  void client.exportSession(id);
}
function onCopySessionId(id: string) {
  void navigator.clipboard.writeText(id);
  toast('已复制会话 ID');
}

/** 文件路径链接点击 → 读文件内容 → 在 DetailPane 显示 */
/** agent 提问:回答 */
function onAnswerQuestion(questionId: string, response: any) {
  void client.respondQuestion(questionId, response);
}
/** agent 提问:忽略 */
function onDismissQuestion(questionId: string) {
  void client.dismissQuestion(questionId);
}
/** 忽略警告(by index) */
function onDismissWarning(idx: number) {
  client.dismissWarning(idx);
}

async function onOpenFile(target: { path: string; line?: number }) {
  const show = (content: string) => {
    filePreviewContent.value = `// ${target.path}${target.line ? ':' + target.line : ''}\n\n${content}`;
    ui.openDetail('thinking');
  };
  // 优先 daemon 0.29+ 的 fs:content(任意绝对路径);
  // 不支持或读不到时 fallback readFileContent(workspace 相对路径)
  const data = await client.getFsContent(target.path).catch(() => null);
  if (data?.content) return show(data.content);
  const d = await client.readFileContent(target.path).catch(() => null);
  if (d?.content) return show(d.content);
  toast(`无法读取 ${target.path}`);
}

/** 切模型:client.setModel(updateSession 内已刷新状态,一次调用即可) */
async function onSetModel(id: string) {
  await client.setModel(id);
}

/** 切思考强度:EffortLevel → ThinkingLevel → client.setThinking */
function onSetEffort(lv: EffortLevel) {
  const thinking = EFFORT_TO_THINKING[lv];
  if (thinking) client.setThinking(thinking as any);
}

// 官方 ModelPicker 全屏弹层(更多模型)
// 官方 components/settings/ModelPicker.vue 可直接 import(同项目 fork)
const showModelPicker = ref(false);
const showProviderManager = ref(false);
const providerManagerLoading = ref(false);
const providerBusyIds = ref<string[]>([]);
const providerAdding = ref(false);
const showSearch = ref(false);
const searchSessionIndex = ref<PaletteSession[]>([]);
const searchLoading = ref(false);
const searchHint = ref('输入至少 2 个字可搜索全部历史');

// ⌘K 命令面板:命令(应用动作)+ 会话双区
const paletteActions = computed<PaletteAction[]>(() => {
  const list: PaletteAction[] = [
    { id: 'new', label: '新建会话(当前工作区)', icon: 'plus' },
    { id: 'settings', label: '打开设置', icon: 'settings' },
    { id: 'theme', label: '切换深浅色主题', icon: 'moon' },
    { id: 'inspect', label: 'Inspect 右栏', icon: 'panel-right', kbd: '⌘I' },
    { id: 'sidetask', label: '侧边任务', icon: 'panel-side', kbd: '⌥⌘S' },
  ];
  if (changedFiles.value.length) {
    list.push({ id: 'review', label: 'Review pane', icon: 'git-branch', kbd: '⌘B' });
  }
  if (subagents.value.length) {
    list.push({ id: 'agents', label: '子智能体面板', icon: 'bot' });
  }
  if (client.activeSessionId.value) {
    list.push(
      { id: 'rename', label: '重命名当前任务', icon: 'pencil', kbd: '⌥⌘R' },
      { id: 'archive', label: '归档当前任务', icon: 'archive', kbd: '⇧⌘A' },
      { id: 'export', label: '导出对话', icon: 'download' },
      { id: 'copy-id', label: '复制会话 ID', icon: 'copy' },
    );
  }
  list.push({ id: 'quit', label: '退出应用', icon: 'x' });
  return list;
});
const paletteSessions = computed(() => {
  const live = (client.sessionsForView.value ?? []).map((session) => ({
    id: session.id,
    title: session.title || session.id,
    meta: session.workspaceName ?? session.time,
    workspaceName: session.workspaceName,
    lastPrompt: session.lastPrompt,
  }));
  if (searchSessionIndex.value.length === 0) return live;
  const liveIds = new Set(live.map((session) => session.id));
  return [
    ...live,
    ...searchSessionIndex.value.filter((session) => !liveIds.has(session.id)),
  ];
});
function onPaletteAction(id: string) {
  showSearch.value = false;
  switch (id) {
    case 'new':
      client.clearActiveSession();
      break;
    case 'settings':
      settingsSection.value = 'general';
      settingsOpen.value = true;
      break;
    case 'theme':
      toggleTheme();
      break;
    case 'inspect':
      ui.openDetail('thread');
      break;
    case 'sidetask':
      ui.openSideTask('thread');
      break;
    case 'review':
      ui.openReview();
      break;
    case 'agents':
      ui.openAgentPanel();
      break;
    case 'rename':
      onRenameSession();
      break;
    case 'archive':
      if (client.activeSessionId.value) void client.archiveSession(client.activeSessionId.value);
      break;
    case 'export':
      void client.exportSession();
      break;
    case 'copy-id': {
      const sid = client.activeSessionId.value;
      if (sid) {
        void navigator.clipboard.writeText(sid);
        toast('已复制会话 ID');
      }
      break;
    }
    case 'quit':
      void import('@tauri-apps/api/core').then(({ invoke }) => invoke('quit_app'));
      break;
  }
}

async function onPickModelOverlay(id: string) {
  showModelPicker.value = false;
  await onSetModel(id);
}

function openModelPicker() {
  showModelPicker.value = true;
  // Keep the cached catalog visible while provider metadata refreshes lazily.
  void client.refreshAllProviders();
}

async function openProviderManager() {
  showProviderManager.value = true;
  providerManagerLoading.value = true;
  try { await client.loadProviders(); } finally { providerManagerLoading.value = false; }
}
async function addProvider(input: { type: string; apiKey?: string; baseUrl?: string; defaultModel?: string }) {
  providerAdding.value = true;
  try {
    await client.addProvider(input);
    toast('Provider 已保存');
  } finally {
    providerAdding.value = false;
  }
}
async function refreshProvider(id: string) {
  providerBusyIds.value = [...new Set([...providerBusyIds.value, id])];
  try { await client.refreshProvider(id); } finally {
    providerBusyIds.value = providerBusyIds.value.filter((item) => item !== id);
  }
}

function qSteerAll() {
  if (!queueItems.value.length) return;
  // steerPrompt 会自行合并并清空整队；传空文本确保每条消息只出现一次。
  void client.steerPrompt('');
}
const composerRef = ref<InstanceType<typeof Composer> | null>(null);
function qEdit(i: number) {
  const q = queueItems.value[i];
  if (!q) return;
  composerRef.value?.setText(q.text);
  client.unqueue(i);
}
function qRemove(i: number) {
  client.unqueue(i);
}

// ---------------------------------------------------------------- diff / ReviewPane(数据流,轮次 4b kimi3)

function normStatus(s: string): ChangedFile['status'] {
  const u = (s || 'M').toUpperCase();
  if (u === '??') return 'A';
  return (['M', 'A', 'D', 'R', 'U', 'C'] as const).includes(u as ChangedFile['status'])
    ? (u as ChangedFile['status'])
    : 'M';
}

/** 选中文件的行级统计(从它的 diff 算) */
const statsByFile = ref<Record<string, { a: number; d: number }>>({});
const changedFiles = computed<ChangedFile[]>(() =>
  (client.changes.value ?? []).map((c) => {
    const st = statsByFile.value[c.path];
    return {
      path: c.path,
      status: normStatus(c.status),
      ...(st ? { additions: st.a, deletions: st.d } : {}),
    };
  }),
);
const inspectData = computed(() => {
  let additions = 0;
  let deletions = 0;
  for (const file of changedFiles.value) {
    additions += file.additions ?? 0;
    deletions += file.deletions ?? 0;
  }
  const goal = activeGoal.value;
  const automations = conversationTurns.value
    .filter((turn) => turn.cron)
    .slice(-12)
    .reverse()
    .map((turn) => ({
      id: turn.cron?.jobId ?? turn.id,
      schedule: turn.cron?.cron,
      recurring: turn.cron?.recurring,
      missedCount: turn.cron?.missedCount ?? turn.cron?.coalescedCount,
      stale: turn.cron?.stale,
      time: turn.createdAt ? formatLocalDateTime(turn.createdAt) : undefined,
    }));
  return {
    activity: client.activity.value,
    branch: client.gitInfo.value?.branch,
    ahead: client.gitInfo.value?.ahead,
    behind: client.gitInfo.value?.behind,
    changes: changedFiles.value,
    additions,
    deletions,
    tasks: client.tasks.value ?? [],
    goal: goal ? {
      objective: goal.objective,
      status: goal.status,
      turnsUsed: goal.turnsUsed,
      tokensUsed: goal.tokensUsed,
      wallClockMs: goal.wallClockMs,
      remainingTokens: goal.budget.remainingTokens,
      remainingTurns: goal.budget.remainingTurns,
    } : null,
    automations,
    sessionCost: client.sessionCost.value ?? 0,
    warnings: activeWarnings.value.length,
  };
});

function openInspectReview(path?: string): void {
  if (path) void client.loadFileDiff(path);
  ui.openReview();
}

function launchInspectPrompt(text: string): void {
  ui.closeDetail();
  composerRef.value?.setText(text);
  composerRef.value?.focus();
}
const hunksByFile = computed<Record<string, DiffHunk[]>>(() => {
  const p = client.selectedDiffPath.value;
  if (!p) return {};
  return { [p]: toDiffHunks(client.fileDiff.value ?? []) };
});

/** 运行占位(TurnProgress):daemon 无步数源,显示「工作中」+ 真实文件增删统计 */
const runProgress = computed(() => {
  if (!conversationRunning.value) return undefined;
  let add = 0;
  let del = 0;
  for (const f of changedFiles.value) {
    add += f.additions ?? 0;
    del += f.deletions ?? 0;
  }
  return { additions: add, deletions: del };
});

/** SettingsPage 初始分区(/permissions 命令直达权限页;其余入口回 general) */
const settingsSection = ref<'general' | 'permissions' | 'models-providers' | 'agents'>('general');

function launchSettingsCommand(command: string): void {
  settingsOpen.value = false;
  composerRef.value?.setText(command);
  composerRef.value?.focus();
}

// 有改动时默认选第一个文件并拉它的 diff
watch(
  () => client.changes.value,
  (cs) => {
    if (cs?.length && !client.selectedDiffPath.value) void client.loadFileDiff(cs[0]!.path);
  },
  { immediate: true },
);
watch(
  () => client.fileDiff.value,
  (lines) => {
    const p = client.selectedDiffPath.value;
    if (!p || !lines) return;
    let a = 0;
    let d = 0;
    for (const l of lines) {
      if (l.type === 'add') a++;
      else if (l.type === 'del') d++;
    }
    statsByFile.value = { ...statsByFile.value, [p]: { a, d } };
  },
);

function onSelectDiffFile(path: string) {
  void client.loadFileDiff(path);
}

function onRequestReviewFix(path: string) {
  composerRef.value?.setText(
    `请根据当前 Review 修复 ${path} 中的问题。先检查这份 diff 的意图与潜在回归，再修改并运行相关测试。`,
  );
  ui.closeReview();
  composerRef.value?.focus();
}

async function searchFiles(q: string) {
  const r = await client.searchFiles(q);
  return (r ?? []).map((f) => ({ path: f.path, name: f.name, kind: 'file' as const }));
}
</script>

<template>
  <!-- 设置覆盖层:整页替换主区内容 -->
  <template v-if="settingsOpen">
    <AppShell>
      <template #sidebar="{ toggleCollapsed }">
        <Sidebar
          :workspaces="sidebarWorkspaces"
          :sessions="sidebarSessions"
          :current-workspace-id="sidebarCurrentWsId"
          :current-session-id="sidebarCurrentSession"
          :filter="filter"
          :collapsed="false"
          :pinned-ids="pinnedIds"
          @collapse="toggleCollapsed"
          @select-session="onSelectSession"
          @new-task="onNewTask"
          @set-filter="(f: SessionFilter) => (filter = f)"
          @toggle-pin="togglePin"
          @search="openSearch"
          @open-settings="settingsOpen = false"
          @select-workspace="onSelectWorkspace"
          @add-workspace="onAddWorkspace"
          @rename-workspace="onRenameWorkspace"
          @delete-workspace="onDeleteWorkspace"
          @copy-path="onCopyWorkspacePath"
          @archive-session="onArchiveSessionById"
          @rename-session="onRenameSessionById"
          @export-session="onExportSessionById"
          @copy-session-id="onCopySessionId"
        />
      </template>
      <header
        class="app-toolbar"
        data-tauri-drag-region="deep"
        @mousedown="tauriDaemon.startWindowDragging"
        @dblclick="onTitlebarDblClick"
      >
        <button class="btn" data-tauri-drag-region="false" @click="settingsOpen = false">
          <CodexIcon name="chevron-right" style="transform: rotate(180deg)" />
          返回
        </button>
        <span class="toolbar-title">设置</span>
      </header>
      <SettingsPage
        :initial-section="settingsSection"
        @open-providers="openProviderManager"
        @launch-command="launchSettingsCommand"
      />
    </AppShell>
  </template>

  <AppShell v-else>
    <template #sidebar="{ toggleCollapsed }">
      <Sidebar
        :workspaces="sidebarWorkspaces"
        :sessions="sidebarSessions"
        :current-workspace-id="sidebarCurrentWsId"
        :current-session-id="sidebarCurrentSession"
        :filter="filter"
        :collapsed="false"
        :pinned-ids="pinnedIds"
        @collapse="toggleCollapsed"
        @select-session="onSelectSession"
        @new-task="onNewTask"
        @search="openSearch"
        @set-filter="(f: SessionFilter) => (filter = f)"
        @toggle-pin="togglePin"
        @open-settings="settingsSection = 'general'; settingsOpen = true"
        @select-workspace="onSelectWorkspace"
        @add-workspace="onAddWorkspace"
        @set-workspace-sort="(m: any) => client.setWorkspaceSortMode(m)"
        @rename-workspace="onRenameWorkspace"
        @delete-workspace="onDeleteWorkspace"
        @copy-path="onCopyWorkspacePath"
        @archive-session="onArchiveSessionById"
        @rename-session="onRenameSessionById"
        @export-session="onExportSessionById"
        @copy-session-id="onCopySessionId"
      >
        <template #new-task>
          <button class="new-task" @click="onNewTask">
            <CodexIcon name="plus" />
            新建任务
          </button>
        </template>
      </Sidebar>
    </template>

    <!-- toolbar -->
    <header
      class="app-toolbar"
      data-tauri-drag-region="deep"
      @mousedown="tauriDaemon.startWindowDragging"
      @dblclick="onTitlebarDblClick"
    >
      <!-- toolbar -->
      <span class="toolbar-title" data-tauri-drag-region>{{ activeSession?.title || sidebarCurrentWs || 'Kimi Code' }}</span>
      <ThreadMenu
        @pin="client.activeSessionId.value && togglePin(client.activeSessionId.value)"
        @open-side-task="ui.openSideTask('thread')"
        @rename="onRenameSession"
        @archive="client.activeSessionId.value && void client.archiveSession(client.activeSessionId.value)"
        @copy="void copyLatestAssistantResponse()"
        @fork="void client.forkSession()"
        @export="void client.exportSession()"
        @export-markdown="exportConversationMarkdown"
      />
      <div class="toolbar-context" data-tauri-drag-region="false">
        <WorkspacePicker
          v-if="client.workspacesView.value.length && !client.activeSessionId.value"
          trigger="pill"
          placement="bottom"
          :workspaces="client.workspacesView.value"
          :current-id="client.activeWorkspaceId.value ?? ''"
          @select="(id: string) => client.openWorkspace(id)"
          @add-workspace="(path: string) => void client.addWorkspaceByPath(path)"
        />
        <span
          v-else-if="client.activeSessionId.value && sidebarCurrentWs"
          class="perm-pill ws-static"
          title="工作区在会话创建后固定,不可切换"
        >
          <CodexIcon name="file" />
          <span class="ellipsis wp-pill-name">{{ sidebarCurrentWs }}</span>
        </span>
        <AgentPicker
          :agents="agentProfiles"
          :current="composerAgentName"
          :loading="agentsLoading"
          :locked="Boolean(client.activeSessionId.value)"
          placement="bottom"
          @select="(name: string) => draftAgentName = name"
          @manage="openAgentSettings"
        />
      </div>
      <span class="toolbar-spacer" data-tauri-drag-region />
      <span v-if="approvalCount" class="pill pill-warning">
        <span class="dot dot-waiting" />等待批准 · {{ approvalCount }} 项
      </span>
      <button
        v-if="subagents.length"
        class="icon-btn"
        title="子智能体"
        @click="ui.agentPanelOpen.value ? ui.closeAgentPanel() : ui.openAgentPanel()"
      >
        <CodexIcon name="bot" />
      </button>
      <button
        type="button"
        class="toolbar-thinking-toggle"
        :class="{ on: ui.globalThinking.value }"
        title="全局思考开关"
        :aria-pressed="ui.globalThinking.value"
        @click="ui.toggleGlobalThinking()"
      >
        <span>思考</span>
        <span class="tt-switch" />
      </button>
      <span v-if="client.connection.value === 'connected'" class="pill pill-success">
        <span class="dot dot-done" />已连接
      </span>
      <span v-else-if="client.connection.value === 'connecting'" class="pill">
        <span class="dot dot-running" />连接中
      </span>
      <span v-else class="pill pill-warning"><span class="dot dot-waiting" />未连接</span>
      <button
        v-if="changedFiles.length"
        class="btn"
        title="Review pane ⌘B"
        @click="ui.reviewPaneOpen.value ? ui.closeReview() : ui.openReview()"
      >
        <CodexIcon name="git-branch" />
        Review
        <span class="kbd">⌘B</span>
      </button>
    </header>

    <!-- 对话流(审批卡由 MessageAssistant 按 turn.approval 内联渲染) -->
    <ConversationPane
      v-if="conversationTurns.length || conversationRunning || standaloneApprovals.length"
      :turns="conversationTurns"
      :todos-by-turn="todosByTurn"
      :running="conversationRunning"
      :turn-progress="runProgress"
      :pending-approvals="standaloneApprovals"
      :open-file="onOpenFile"
      :has-more-messages="client.hasMoreMessages.value ?? false"
      :loading-more="client.loadingMoreMessages.value ?? false"
      @inspect="(tab) => ui.openDetail(tab)"
      @load-older="() => { const sid = client.activeSessionId.value; if (sid && client.hasMoreMessages.value) void client.loadOlderMessages(sid); }"
      @view-compaction="onViewCompaction"
      @edit-message="onEditMessage"
    >
      <template #approval="{ approval }">
        <ApprovalCard v-bind="approval" />
      </template>
    </ConversationPane>
    <!-- 空态:无会话/空会话占位 -->
    <div v-else class="empty-state">
      <CodexIcon name="sparkle" />
      <p class="es-title">
        {{ client.activeSessionId.value ? '开始你的第一句话' : '选择左侧会话,或在下方输入开始新对话' }}
      </p>
      <p class="es-sub">
        <template v-if="sidebarCurrentWs">当前工作区「{{ sidebarCurrentWs }}」 · 新任务可在顶部切换 · </template>
        <template v-else>先在顶部选择工作区 · </template>⌘K 命令面板 · / 斜杠命令 · @ 引用文件
      </p>
    </div>

    <!-- Inspect 右栏 -->
    <DetailPane
      :open="ui.detailPaneOpen.value"
      :tab="ui.detailPaneTab.value"
      :thread-info="{
        workspace: sidebarCurrentWs,
        createdAt: activeSession?.updatedAt ? formatLocalDateTime(activeSession.updatedAt) : '',
        model: client.status.value?.model ?? composerCurrentModel,
        permission: composerPermission,
        context: ctxInfo,
      }"
      :thinking-full-text="thinkingFullText"
      :thinking-segments="thinkingSegments"
      :tool-calls="toolCalls"
      :tasks="client.todos.value ?? []"
      :inspect="inspectData"
      @set-tab="(t) => ui.setDetailTab(t)"
      @close="ui.closeDetail()"
      @open-review="openInspectReview"
      @open-task="openTranscript"
      @launch-prompt="launchInspectPrompt"
    />

    <!-- 警告提示(daemon warnings,AppNotice 完整渲染:title + message + details) -->
    <div v-if="activeWarnings.length" class="codex-warnings">
      <div v-for="(w, idx) in activeWarnings" :key="idx" class="codex-warning">
        <span class="cw-icon"><CodexIcon name="alert-triangle" /></span>
        <span class="cw-text">
          <span class="cw-title">{{ typeof w === 'string' ? w : w.title }}</span>
          <span v-if="typeof w !== 'string' && w.message" class="cw-msg">{{ w.message }}</span>
          <span v-if="typeof w !== 'string' && w.details?.length" class="cw-details">
            <span v-for="(d, di) in w.details" :key="di" class="cw-detail">{{ d.label }}:{{ d.value }}</span>
          </span>
        </span>
        <button class="cw-close" @click="onDismissWarning(idx)"><CodexIcon name="x" /></button>
      </div>
    </div>

    <!-- 目标条(/goal) -->
    <div v-if="activeGoal" class="dock-goal-strip">
      <OfficialGoalStrip
        :goal="activeGoal"
        @control-goal="(a: 'pause' | 'resume' | 'cancel') => client.controlGoal(a)"
      />
    </div>

    <!-- 压缩进行中指示(client.compaction 仅运行时存在;完成后 transcript 留有分隔线) -->
    <div v-if="hasCompaction" class="codex-compaction">
      <span class="cc-line"></span>
      <span class="cc-text cc-live"><CodexIcon name="spinner" class="cc-spin" />正在压缩上下文…</span>
      <span class="cc-line"></span>
    </div>

    <!-- agent 提问(QuestionCard) -->
    <OfficialQuestionCard
      v-if="currentQuestion"
      :question="currentQuestion"
      :busy-kind="client.pendingQuestionActions[currentQuestion.questionId]"
      @answer="onAnswerQuestion"
      @dismiss="onDismissQuestion"
    />

    <!-- Composer dock -->
    <div class="app-dock">
      <div class="dock-inner">
        <QueuePanel
          v-if="queueItems.length"
          :queued-prompts="queueItems"
          @steer-all="qSteerAll"
          @edit="(id) => qEdit(Number(id))"
          @remove="(id) => qRemove(Number(id))"
          @reorder="(from: number, to: number) => void client.reorderQueue(from, to)"
        />
        <Composer
          ref="composerRef"
          :running="conversationRunning"
          :mode="composerMode"
          :permission="composerPermission"
          :modes="composerModes"
          :models="composerModels"
          :current-model="composerCurrentModel"
          :effort="composerEffort"
          :context="ctxInfo"
          :quota="quotaInfo"
          :builtin="builtinCommands"
          :skills="composerSkills"
          :files="[]"
          :search-files="searchFiles"
          :cost="client.sessionCost.value ?? 0"
          :upload-image="(file: Blob, name?: string) => client.uploadImage(file, name)"
          :session-title="activeSession?.title ?? sidebarCurrentWs"
          :session-id="client.activeSessionId.value ?? ''"
          @open-context-detail="pollPlanUsage"
          @send="onSend"
          @set-mode="onComposerMode"
          @cancel="() => client.abortCurrentPrompt()"
          @toggle-mode="(m: 'plan' | 'swarm' | 'goal') => {
            if (m === 'plan') client.togglePlanMode();
            else if (m === 'swarm') client.toggleSwarmMode();
            else if (m === 'goal') client.toggleGoalMode();
          }"
          @set-permission="(p: PermissionMode) => client.setPermission(p)"
          @set-model="onSetModel"
          @set-effort="onSetEffort"
          @pick-model="openModelPicker"
          @command="handleCommand"
        />
      </div>
    </div>

    <!-- 侧边任务(分栏) -->
    <SideTask v-bind="sideTaskProps" :running="sideChatRunning" @send="onSideChatSend">
      <!-- agent-transcript 模式:子 agent 详情 -->
      <div v-if="sideSubTask" class="msg-assistant">
        <div class="a-content">
          <p>
            <strong>{{ sideSubTask.name }}</strong>
            <span style="color: var(--text-3)"> · {{ sideSubTask.timing }}</span>
          </p>
          <p v-if="sideSubTask.suspendedReason" style="color: var(--warning)">
            等待输入：{{ sideSubTask.suspendedReason }}。请在主对话中的问题卡片回复。
          </p>
          <p v-else-if="sideSubTask.meta" style="color: var(--text-2)">{{ sideSubTask.meta }}</p>
          <pre v-if="(sideSubTask.output ?? []).length">{{ (sideSubTask.output ?? []).join('\n') }}</pre>
          <p v-else style="color: var(--text-3)">该子智能体暂无输出记录。</p>
        </div>
      </div>
      <!-- thread 模式:侧边对话(/btw) -->
      <template v-else>
        <div v-if="sideChatTurns.length" class="side-chat-turns">
          <template v-for="t in sideChatTurns" :key="t.id">
            <MessageUser v-if="t.role === 'user'" :turn="t" />
            <MessageAssistant
              v-else-if="t.role === 'assistant'"
              :turn="t"
              :running="sideChatRunning && t.id === sideChatTurns[sideChatTurns.length - 1]?.id"
            />
          </template>
        </div>
        <div v-else class="msg-assistant">
          <div class="a-content">
            <p style="color: var(--text-3)">侧边对话:在这里问问题,不影响主线程。</p>
          </div>
        </div>
      </template>
    </SideTask>

    <!-- 子智能体面板 -->
    <AgentPanel
      :active="activeSubagents"
      :completed="completedSubagents"
      :open="ui.agentPanelOpen.value"
      @inspect="openTranscript"
      @cancel="onCancelTask"
      @close="ui.closeAgentPanel()"
    />

    <!-- Review pane(⌘B,有改动文件时出现) -->
    <ReviewPane
      v-if="changedFiles.length"
      :files="changedFiles"
      :hunks-by-file="hunksByFile"
      :branch="client.gitInfo.value?.branch ?? ''"
      @select-file="onSelectDiffFile"
      @request-fix="onRequestReviewFix"
    />

    <OfficialModelPicker
      v-if="showModelPicker"
      :models="client.models.value ?? []"
      :current="composerCurrentModel"
      :starred-ids="client.starredModelIds.value ?? []"
      :cache-warning="conversationTurns.length > 0"
      @select="onPickModelOverlay"
      @toggle-star="(id: string) => client.toggleStarModel(id)"
      @manage="() => { showModelPicker = false; settingsSection = 'models-providers'; settingsOpen = true; }"
      @close="showModelPicker = false"
    />

    <!-- 首次引导(语言/主题/accent) -->
    <Onboarding
      v-if="showOnboarding"
      @complete="() => { client.setOnboarded(true); showOnboarding = false; }"
      @skip="() => { client.setOnboarded(true); showOnboarding = false; }"
    />

    <!-- ⌘K 命令面板(命令 + 会话双区) -->
    <CommandPalette
      v-if="showSearch"
      :actions="paletteActions"
      :sessions="paletteSessions"
      :search-loading="searchLoading"
      :search-hint="searchHint"
      @select-action="onPaletteAction"
      @select-session="onSelectPaletteSession"
      @query="onPaletteQuery"
      @close="showSearch = false"
    />

  </AppShell>
  <!-- 必须位于设置/主页面条件分支之外：设置页手动检查发现新版本时立即弹出。 -->
  <UpdateDialog />
  <Toast />

  <!-- 401 时的 token 输入弹层(浏览器 dev 流程;Tauri 由 Rust 注入凭据) -->
  <OfficialServerAuthDialog v-if="showServerAuth" />

  <ProviderManager
    v-if="showProviderManager"
    :providers="client.providers.value ?? []"
    :oauth-available="false"
    :loading="providerManagerLoading"
    :busy-ids="providerBusyIds"
    :adding="providerAdding"
    @add="addProvider"
    @refresh="refreshProvider"
    @delete="onDeleteProvider"
    @open-login="() => toast('请先在账户页登录 Kimi，再刷新 Provider')"
    @close="showProviderManager = false"
  />

  <!-- 应用内输入/确认弹层(重命名/移除工作区等,替代 window.prompt) -->
  <PromptDialog
    v-if="promptDialog"
    :title="promptDialog.title"
    :description="promptDialog.description"
    :placeholder="promptDialog.placeholder"
    :initial="promptDialog.initial"
    :confirm-label="promptDialog.confirmLabel"
    :danger="promptDialog.danger"
    :input="promptDialog.input"
    @confirm="(v: string) => { const cb = promptDialog!.onConfirm; promptDialog = null; cb(v); }"
    @cancel="promptDialog = null"
  />
</template>
