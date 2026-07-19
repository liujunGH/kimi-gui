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
import { computed, provide, ref } from 'vue';
import { useKimiWebClient } from '../composables/useKimiWebClient';
import { KIMI_CLIENT_KEY } from '../composables/codex/useKimiClient';
import { useUIState } from '../composables/codex/useUIState';
import { useHotkeys } from '../composables/codex/useHotkeys';
import { useTheme } from '../composables/codex/useTheme';
import { SLASH_COMMANDS } from '../lib/slashCommands';
import i18n from '../i18n';
import type { ChatTurn, TodoView } from '../types';
import type {
  ContextInfo,
  ComposerMode,
  ModeFlags,
  QueuedPrompt,
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
import CodexIcon from '../components/codex/layout/CodexIcon.vue';

// 1. 顶层 client 装配 + provide(整个 codex UI 的数据源)
const client = useKimiWebClient();
provide(KIMI_CLIENT_KEY, client);

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

const thinkingFullText = computed(() =>
  conversationTurns.value
    .flatMap((t) => (t.blocks ?? []).filter((b) => b.kind === 'thinking'))
    .map((b) => (b.kind === 'thinking' ? b.thinking : ''))
    .join('\n\n'),
);
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
function qSteer(i: number) {
  const q = queueItems.value[i];
  if (!q) return;
  void client.steerPrompt(q.text);
  client.unqueue(i);
}
function qEdit(_i: number) {
  toast('回填编辑待轮次 4(editQueued)');
}
function qRemove(i: number) {
  client.unqueue(i);
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
      >
        <template #new-task>
          <WorkspacePicker
            :workspaces="client.workspacesView.value ?? []"
            :current-id="client.activeWorkspaceId.value ?? ''"
            @select="onPickWorkspace"
          />
        </template>
      </Sidebar>
    </template>

    <!-- toolbar -->
    <header class="app-toolbar">
      <span class="toolbar-title">{{ activeSession?.title || sidebarCurrentWs || 'Kimi Code' }}</span>
      <ThreadMenu @pin="togglePin(client.activeSessionId.value)" @open-side-task="ui.openSideTask('thread')" />
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
    </header>

    <!-- 对话流(审批卡由 MessageAssistant 按 turn.approval 内联渲染) -->
    <ConversationPane
      :turns="conversationTurns"
      :todos-by-turn="todosByTurn"
      :running="conversationRunning"
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
          :running="conversationRunning"
          :mode="composerMode"
          :permission="composerPermission"
          :modes="composerModes"
          :models="composerModels"
          :current-model="composerCurrentModel"
          :effort="null"
          :context="ctxInfo"
          :quota="{ q5h: 0, q5hReset: '', qWeek: 0, qWeekReset: '' }"
          :builtin="builtinCommands"
          :skills="composerSkills"
          :files="[]"
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
          @set-model="(id: string) => client.setModel(id)"
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
  </AppShell>
  <Toast />
</template>
