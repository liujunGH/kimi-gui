<script setup lang="ts">
/**
 * CodexApp —— codex UI 的真产品入口
 *
 * 轮次 4a(kimi3 装配):在 C1 主链路(Sidebar/Conversation/Composer)之上,
 * 把轮次 2 的组件全部挂上真 client 数据:
 * - DetailPane(⌘I)/ SideTask(⌥⌘S)/ ThreadMenu / AgentPanel(子智能体)/ SettingsPage(覆盖层)
 * - 审批卡随 turn.approval 在对话流内联渲染(approve/reject 走 client.respondApproval)
 * - 新建任务 = WorkspacePicker(openWorkspace 切换工作区)
 * - Composer 数据:skills(真)/ builtin(i18n)/ queue(真)/ context(真 usage)
 *
 * 数据边界:组件零 mock;context quota、文件树、diff/review 数据流等轮次 4(ZCode)。
 */
import { computed, onUnmounted, provide, ref, watch } from 'vue';
import { useKimiWebClient } from '../composables/useKimiWebClient';
import { KIMI_CLIENT_KEY } from '../composables/codex/useKimiClient';
import { useUIState } from '../composables/codex/useUIState';
import { useHotkeys } from '../composables/codex/useHotkeys';
import { useTheme } from '../composables/codex/useTheme';
import { useTauriDaemon } from '../composables/codex/useTauriDaemon';
import { SLASH_COMMANDS } from '../lib/slashCommands';
import i18n from '../i18n';
import type { ChatTurn, TodoView } from '../types';
import type {
  ChangedFile,
  ContextInfo,
  DiffHunk,
  EffortLevel,
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
import AgentPanel from '../components/codex/agents/AgentPanel.vue';
import SettingsPage from '../components/codex/settings/SettingsPage.vue';
import ReviewPane from '../components/codex/diff/ReviewPane.vue';
import OfficialModelPicker from '../components/settings/ModelPicker.vue';
import Onboarding from '../components/settings/Onboarding.vue';
import { toDiffHunks } from '../components/codex/diff/diffMapper';
import CodexIcon from '../components/codex/layout/CodexIcon.vue';

// 1. 顶层 client 装配 + provide(整个 codex UI 的数据源)
const client = useKimiWebClient();
provide(KIMI_CLIENT_KEY, client);
// 官方 Markdown.vue inject('resolveImage') 用于解析消息里的本地图片路径
provide('resolveImage', client.resolveImageUrl);

// 启动连接 + 首轮数据拉取:官方 App.vue 的 client.load()(web/src/App.vue:181)。
void client.load();

// 2. UI 状态
const ui = useUIState();
useTheme();
const { toast } = useToast();

// 3. 侧栏 + Composer 状态
const filter = ref<SessionFilter>('all');
const pinnedIds = ref<string[]>([]);
const composerMode = ref<ComposerMode>('queue');
const settingsOpen = ref(false);
const showOnboarding = ref(!client.onboarded.value);
const agentPanelOpen = ref(false);

function togglePin(id: string) {
  pinnedIds.value = pinnedIds.value.includes(id)
    ? pinnedIds.value.filter((x) => x !== id)
    : [...pinnedIds.value, id];
  toast(pinnedIds.value.includes(id) ? '已置顶' : '已取消置顶');
}

useHotkeys([
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
  { key: 'Escape', handler: () => ui.escClose() },
]);

// ---------------------------------------------------------------- 侧栏数据

const sidebarWorkspaces = computed(() =>
  (client.workspacesView.value ?? []).map((w) => ({ name: w.name, branch: '', id: w.id })),
);
const sidebarSessions = computed(() => client.sessionsForView.value ?? []);
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

const thinkingFullText = computed(() => {
  // 文件预览内容优先(点文件路径时临时显示)
  if (filePreviewContent.value) return filePreviewContent.value;
  return conversationTurns.value
    .flatMap((t) => (t.blocks ?? []).filter((b) => b.kind === 'thinking'))
    .map((b) => (b.kind === 'thinking' ? b.thinking : ''))
    .join('\n\n');
});

// 文件预览内容(简化版:复用 DetailPane thinking tab 的 pre 渲染)
const filePreviewContent = ref('');
const toolCalls = computed(() =>
  conversationTurns.value
    .flatMap((t) => (t.blocks ?? []).filter((b) => b.kind === 'tool'))
    .map((b) => (b.kind === 'tool' ? b.tool : null))
    .filter((x): x is NonNullable<typeof x> => x !== null),
);

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

// ---------------------------------------------------------------- 计划额度(Tauri PTY 抓 /usage,浏览器为 0 占位)

const quotaInfo = ref<QuotaInfo>({ q5h: 0, q5hReset: '', qWeek: 0, qWeekReset: '' });
const { fetchPlanUsage } = useTauriDaemon();
async function pollPlanUsage() {
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
void pollPlanUsage();
const planUsageTimer = setInterval(pollPlanUsage, 60_000);
onUnmounted(() => clearInterval(planUsageTimer));

// thinking effort 映射:官方 ThinkingLevel('none'|'minimal'|'low'|'medium'|'high'|'xhigh')
// → 契约 EffortLevel('Low'|'High'|'Max')
const composerEffort = computed<EffortLevel | null>(() => {
  const t = client.thinking.value;
  if (!t || t === 'none' || t === 'minimal') return null;
  if (t === 'low' || t === 'medium') return 'Low';
  if (t === 'high') return 'High';
  return 'Max'; // xhigh
});

// ---------------------------------------------------------------- 子智能体

const subagents = computed<Subagent[]>(() =>
  (client.tasks.value ?? [])
    .filter((t) => t.kind === 'subagent')
    .map((t) => ({
      id: t.id,
      name: t.name,
      status: t.state === 'run' ? 'working' : t.state === 'done' ? 'completed' : 'failed',
      summary: t.meta ?? t.output?.[0] ?? '',
      elapsed: t.timing,
    })),
);
const activeSubagents = computed(() => subagents.value.filter((s) => s.status === 'working'));
const completedSubagents = computed(() => subagents.value.filter((s) => s.status !== 'working'));

const sideSubTask = computed(() => {
  const id = ui.sideTaskSubagentId.value;
  return id ? (client.tasks.value ?? []).find((t) => t.id === id) ?? null : null;
});
const sideTaskProps = computed(() => {
  const t = sideSubTask.value;
  if (ui.sideTaskKind.value === 'agent-transcript' && t) {
    return {
      title: t.name,
      status:
        t.state === 'done'
          ? { text: '已完成', kind: 'success' as const }
          : t.state === 'fail'
            ? { text: '已失败', kind: 'warning' as const }
            : { text: '运行中', kind: 'accent' as const },
      thread: { name: t.name, ws: '子智能体', dot: 'running' as const },
    };
  }
  return {
    title: '侧边任务',
    status: { text: conversationRunning.value ? '运行中' : '空闲', kind: 'accent' as const },
    thread: { name: sidebarCurrentWs.value || 'Kimi Code', ws: sidebarCurrentWs.value, dot: 'running' as const },
  };
});

function openTranscript(id: string) {
  agentPanelOpen.value = false;
  ui.openSideTask('agent-transcript', id);
}

// ---------------------------------------------------------------- 事件处理

function onSend(text: string, mode: ComposerMode) {
  if (!text.trim()) return;
  if (mode === 'steer' && conversationRunning.value) {
    void client.steerPrompt(text);
  } else {
    void client.sendPrompt(text);
  }
}
function onSelectSession(id: string) {
  void client.selectSession(id);
}
function onPickWorkspace(id: string) {
  client.openWorkspace(id);
  toast('已切换到工作区(原型路径,新会话从首条消息开始)');
}
function onComposerMode(m: ComposerMode) {
  composerMode.value = m;
}

/** EffortLevel → 官方 ThinkingLevel 反向映射 */
const EFFORT_TO_THINKING: Record<EffortLevel, string> = {
  Low: 'medium',
  High: 'high',
  Max: 'xhigh',
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
    if (arg) void client.openSideChat(arg);
    else client.closeSideChat();
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
    default: {
      // 未匹配 → 当 skill 激活
      const stripped = cmd.slice(1).split(' ')[0];
      if (stripped) void client.activateSkill(stripped);
    }
  }
}

/** 重命名当前 session */
function onRenameSession() {
  const id = client.activeSessionId.value;
  if (!id) return;
  const title = window.prompt('新标题', activeSession.value?.title ?? '');
  if (title) void client.renameSession(id, title);
}

/** 文件路径链接点击 → 读文件内容 → 在 DetailPane 显示 */
function onOpenFile(target: { path: string; line?: number }) {
  void client.readFileContent(target.path).then((data) => {
    if (data?.content) {
      filePreviewContent.value = `// ${target.path}${target.line ? ':' + target.line : ''}\n\n${data.content}`;
      ui.openDetail('thinking');
    }
  }).catch(() => {
    toast(`无法读取 ${target.path}`);
  });
}

/** 切模型:setModel + 设 daemon 默认(fire-and-forget) */
async function onSetModel(id: string) {
  const switched = await client.setModel(id);
  if (switched && id !== client.defaultModel.value) {
    void client.setModel(id); // 设默认(fire-and-forget,不阻塞 UI)
  }
}

/** 切思考强度:EffortLevel → ThinkingLevel → client.setThinking */
function onSetEffort(lv: EffortLevel) {
  const thinking = EFFORT_TO_THINKING[lv];
  if (thinking) client.setThinking(thinking as any);
}

// 官方 ModelPicker 全屏弹层(更多模型)
// 官方 components/settings/ModelPicker.vue 可直接 import(同项目 fork)
const showModelPicker = ref(false);
async function onPickModelOverlay(id: string) {
  showModelPicker.value = false;
  await onSetModel(id);
}

function qSteer(i: number) {
  const q = queueItems.value[i];
  if (!q) return;
  void client.steerPrompt(q.text);
  client.unqueue(i);
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
const hunksByFile = computed<Record<string, DiffHunk[]>>(() => {
  const p = client.selectedDiffPath.value;
  if (!p) return {};
  return { [p]: toDiffHunks(client.fileDiff.value ?? []) };
});

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
          :workspaces="sidebarWorkspaces as never"
          :sessions="sidebarSessions"
          :current-workspace-id="sidebarCurrentWs"
          :current-session-id="sidebarCurrentSession"
          :filter="filter"
          :collapsed="false"
          :pinned-ids="pinnedIds"
          @collapse="toggleCollapsed"
          @select-session="onSelectSession"
          @new-task="() => {}"
          @set-filter="(f: SessionFilter) => (filter = f)"
          @toggle-pin="togglePin"
          @open-settings="settingsOpen = false"
          @select-workspace="() => {}"
        />
      </template>
      <header class="app-toolbar">
        <button class="btn" @click="settingsOpen = false">
          <CodexIcon name="chevron-right" style="transform: rotate(180deg)" />
          返回
        </button>
        <span class="toolbar-title">设置</span>
      </header>
      <SettingsPage />
    </AppShell>
    <Toast />
  </template>

  <AppShell v-else>
    <template #sidebar="{ toggleCollapsed }">
      <Sidebar
        :workspaces="sidebarWorkspaces as never"
        :sessions="sidebarSessions"
        :current-workspace-id="sidebarCurrentWs"
        :current-session-id="sidebarCurrentSession"
        :filter="filter"
        :collapsed="false"
        :pinned-ids="pinnedIds"
        @collapse="toggleCollapsed"
        @select-session="onSelectSession"
        @new-task="() => {}"
        @set-filter="(f: SessionFilter) => (filter = f)"
        @toggle-pin="togglePin"
        @open-settings="settingsOpen = true"
        @select-workspace="() => {}"
        @set-workspace-sort="(m: any) => client.setWorkspaceSortMode(m)"
      >
        <template #new-task>
          <WorkspacePicker
            :workspaces="client.workspacesView.value ?? []"
            :current-id="client.activeWorkspaceId.value ?? ''"
            @select="onPickWorkspace"
            @add-workspace="(path: string) => void client.addWorkspaceByPath(path)"
          />
        </template>
      </Sidebar>
    </template>

    <!-- toolbar -->
    <header class="app-toolbar">
      <span class="toolbar-title">{{ activeSession?.title || sidebarCurrentWs || 'Kimi Code' }}</span>
      <ThreadMenu
        @pin="togglePin(client.activeSessionId.value)"
        @open-side-task="ui.openSideTask('thread')"
        @rename="onRenameSession"
        @archive="void client.archiveSession(client.activeSessionId.value)"
        @copy="void client.exportSession()"
        @fork="void client.forkSession()"
        @export="void client.exportSession()"
      />
      <span class="toolbar-spacer" />
      <span v-if="approvalCount" class="pill pill-warning">
        <span class="dot dot-waiting" />等待批准 · {{ approvalCount }} 项
      </span>
      <button
        v-if="subagents.length"
        class="icon-btn"
        title="子智能体"
        @click="agentPanelOpen = !agentPanelOpen"
      >
        <CodexIcon name="bot" />
      </button>
      <div
        class="toolbar-thinking-toggle"
        :class="{ on: ui.globalThinking.value }"
        title="全局思考开关"
        @click="ui.toggleGlobalThinking()"
      >
        <span>思考</span>
        <span class="tt-switch" />
      </div>
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
      :turns="conversationTurns"
      :todos-by-turn="todosByTurn"
      :running="conversationRunning"
      :open-file="onOpenFile"
      @inspect="(tab) => ui.openDetail(tab)"
    />

    <!-- Inspect 右栏 -->
    <DetailPane
      :open="ui.detailPaneOpen.value"
      :tab="ui.detailPaneTab.value"
      :thread-info="{
        workspace: sidebarCurrentWs,
        createdAt: (activeSession?.updatedAt ?? '').slice(0, 16).replace('T', ' '),
        model: client.status.value?.model ?? composerCurrentModel,
        permission: composerPermission,
        context: ctxInfo,
      }"
      :thinking-full-text="thinkingFullText"
      :tool-calls="toolCalls"
      :tasks="client.todos.value ?? []"
      @set-tab="(t) => ui.setDetailTab(t)"
      @close="ui.closeDetail()"
    />

    <!-- Composer dock -->
    <div class="app-dock">
      <div class="dock-inner">
        <QueuePanel
          v-if="queueItems.length"
          :queued-prompts="queueItems"
          @promote-to-steer="(id) => qSteer(Number(id))"
          @edit="(id) => qEdit(Number(id))"
          @remove="(id) => qRemove(Number(id))"
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
          :session-title="activeSession?.title ?? sidebarCurrentWs"
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
          @pick-model="showModelPicker = true"
          @command="handleCommand"
        />
      </div>
    </div>

    <!-- 侧边任务(分栏) -->
    <SideTask v-bind="sideTaskProps">
      <div v-if="sideSubTask" class="msg-assistant">
        <div class="a-content">
          <p>
            <strong>{{ sideSubTask.name }}</strong>
            <span style="color: var(--text-3)"> · {{ sideSubTask.timing }}</span>
          </p>
          <p v-if="sideSubTask.meta" style="color: var(--text-2)">{{ sideSubTask.meta }}</p>
          <pre v-if="(sideSubTask.output ?? []).length">{{ (sideSubTask.output ?? []).join('\n') }}</pre>
          <p v-else style="color: var(--text-3)">该子智能体暂无输出记录。</p>
        </div>
      </div>
      <div v-else class="msg-assistant">
        <div class="a-content">
          <p style="color: var(--text-3)">从子智能体面板钻取一个 agent 查看详情;或继续当前线程,这里是只读视图。</p>
        </div>
      </div>
    </SideTask>

    <!-- 子智能体面板 -->
    <AgentPanel
      :active="activeSubagents"
      :completed="completedSubagents"
      :open="agentPanelOpen"
      @inspect="openTranscript"
      @close="agentPanelOpen = false"
    />

    <!-- Review pane(⌘B,有改动文件时出现) -->
    <ReviewPane
      v-if="changedFiles.length"
      :files="changedFiles"
      :hunks-by-file="hunksByFile"
      :branch="client.gitInfo.value?.branch ?? ''"
      @select-file="onSelectDiffFile"
    />

    <OfficialModelPicker
      v-if="showModelPicker"
      :models="client.models.value ?? []"
      :current="composerCurrentModel"
      :starred-ids="client.starredModelIds.value ?? []"
      @select="onPickModelOverlay"
      @toggle-star="(id: string) => client.toggleStarModel(id)"
      @close="showModelPicker = false"
    />

    <!-- 首次引导(语言/主题/accent) -->
    <Onboarding
      v-if="showOnboarding"
      @complete="() => { client.setOnboarded(true); showOnboarding = false; }"
      @skip="() => { client.setOnboarded(true); showOnboarding = false; }"
    />
  </AppShell>
  <Toast />
</template>
