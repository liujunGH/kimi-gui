<script setup lang="ts">
/**
 * CodexApp —— codex UI 的真产品入口(替代 codex-demo/DemoApp.vue)
 *
 * 与 DemoApp 区别:
 * - DemoApp 用 mock 数据(codex-demo/mock.ts),7 场景切换,给 kimi3 验收用
 * - CodexApp 用真 useKimiWebClient 数据,单场景(当前 session),给产品用
 *
 * C1 阶段:先接 Sidebar + ConversationPane + Composer
 * 其他组件(DetailPane/DiffView/SettingsPage 等)留空或最小,后续阶段补。
 */
import { computed, provide, watch, ref } from 'vue';
import { useKimiWebClient } from '../composables/useKimiWebClient';
import { KIMI_CLIENT_KEY } from '../composables/codex/useKimiClient';
import { useUIState } from '../composables/codex/useUIState';
import { useHotkeys } from '../composables/codex/useHotkeys';
import { useTheme } from '../composables/codex/useTheme';
import type { ChatTurn } from '../types';
import type { ComposerMode, SessionFilter } from '../types/codex';

import AppShell from '../components/codex/AppShell.vue';
import Sidebar from '../components/codex/sidebar/Sidebar.vue';
import ConversationPane from '../components/codex/chat/ConversationPane.vue';
import Composer from '../components/codex/composer/Composer.vue';

// 1. 顶层 client 装配 + provide(整个 codex UI 的数据源)
const client = useKimiWebClient();
provide(KIMI_CLIENT_KEY, client);

// 启动连接 + 首轮数据拉取:官方 App.vue 的 client.load()(web/src/App.vue:181)。
// 不调用它,client 永远不发起 REST/WS —— 轮次 3 遗留「未连接」的根因。
void client.load();

// 诊断:Tauri 环境检测(排查 token 注入)
const diagTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const diagToken = ref<string | null>(null);
// 监听 localStorage 变化(serverAuth setCredential 会写 localStorage)
diagToken.value = localStorage.getItem('kimi-web.server-credential');
// eslint-disable-next-line no-console
console.info('[CodexApp] diag: tauri =', diagTauri, 'token in localStorage =', !!diagToken.value, 'connection =', client.connection.value);

// 2. UI 状态
const ui = useUIState();
useTheme();
useHotkeys([
  { key: 'i', meta: true, handler: () => { ui.openDetail('thread'); return true; } },
  { key: 'Escape', handler: () => ui.escClose() },
]);

// 3. 侧栏 + Composer 状态
const filter = ref<SessionFilter>('all');
const pinnedIds = ref<string[]>([]);
const composerMode = ref<ComposerMode>('queue');

// --- 数据映射:client ref → 组件 props ---

// client.workspaceGroups 是 [{ workspace, sessions, hasMore, ... }] 分组包装,
// 不能直接当 Workspace[] 传;Sidebar 要的是扁平 WorkspaceView + 扁平 sessions
const sidebarWorkspaces = computed(() =>
  (client.workspacesView.value ?? []).map((w) => ({ name: w.name, branch: '', id: w.id })),
);
const sidebarSessions = computed(() => client.sessionsForView.value ?? []);
const sidebarCurrentWs = computed(() => {
  const id = client.activeWorkspaceId.value ?? '';
  return (client.workspacesView.value ?? []).find((w) => w.id === id)?.name ?? id;
});
const sidebarCurrentSession = computed(() => client.activeSessionId.value ?? '');

const conversationTurns = computed<ChatTurn[]>(() => client.turns.value ?? []);
const conversationRunning = computed(() => client.working.value || client.turnActive.value);

const composerPermission = computed(() => client.permission.value ?? 'manual');
// client.models 形状是 { id, provider, model, displayName?, ... },映射到契约 ModelInfo
const composerModels = computed(() =>
  (client.models.value ?? []).map((m) => ({
    id: m.id,
    name: (m as { displayName?: string }).displayName ?? m.model ?? m.id,
  })),
);
const composerCurrentModel = computed(() => {
  // client.backend 是 'v1' | 'v2',模型 ID 从 models 里取第一个 starred 或第一个
  const models = client.models.value;
  if (!models || models.length === 0) return '';
  const starred = models.find((m: any) => client.starredModelIds.value?.includes(m.id));
  return (starred ?? models[0])?.id ?? '';
});

// --- 事件处理:组件 emit → client action ---

function onSend(text: string, mode: ComposerMode) {
  if (!text.trim()) return;
  if (mode === 'steer' && conversationRunning.value) {
    client.steerPrompt(text);
  } else {
    client.sendPrompt(text);
  }
}

function onSelectSession(id: string) {
  client.selectSession(id);
}

function onNewTask() {
  client.clearActiveSession();
}

function onComposerMode(m: ComposerMode) {
  composerMode.value = m;
}

// 自动选中第一个 session(首次加载后)
watch(
  () => client.initialized.value,
  (ready) => {
    if (ready && !client.activeSessionId.value) {
      const sessions = client.sessions.value;
      if (sessions && sessions.length > 0) {
        const first = sessions[0];
        if (first?.id) client.selectSession(first.id);
      }
    }
  },
);
</script>

<template>
  <AppShell>
    <template #sidebar="{ toggleCollapsed }">
      <Sidebar
        :workspaces="sidebarWorkspaces as any"
        :sessions="sidebarSessions as any"
        :current-workspace-id="sidebarCurrentWs"
        :current-session-id="sidebarCurrentSession"
        :filter="filter"
        :collapsed="false"
        :pinned-ids="pinnedIds"
        @collapse="toggleCollapsed"
        @select-session="onSelectSession"
        @new-task="onNewTask"
        @set-filter="(f: SessionFilter) => (filter = f)"
        @open-settings="() => {}"
      />
    </template>

    <!-- toolbar -->
    <header class="app-toolbar">
      <span class="toolbar-title">
        {{ sidebarCurrentWs || 'Kimi Code' }}
      </span>
      <span class="toolbar-spacer" />
      <!-- 诊断(临时)-->
      <span class="pill" style="font-size:10px;opacity:0.5">
        diag: tauri={{ diagTauri }} token={{ !!diagToken }} conn={{ client.connection.value }}
      </span>
      <span
        v-if="client.connection.value === 'connected'"
        class="pill pill-success"
      ><span class="dot dot-done" />已连接</span>
      <span
        v-else-if="client.connection.value === 'connecting'"
        class="pill"
      ><span class="dot dot-running" />连接中</span>
      <span v-else class="pill pill-warning"><span class="dot dot-waiting" />未连接</span>

      <div
        class="toolbar-thinking-toggle"
        :class="{ on: ui.globalThinking.value }"
        title="全局思考开关"
        @click="ui.toggleGlobalThinking()"
      >
        <span>思考</span>
        <span class="tt-switch" />
      </div>
    </header>

    <!-- 对话流 -->
    <div class="app-conversation">
      <ConversationPane
        :turns="conversationTurns"
        :todos-by-turn="{}"
        :running="conversationRunning"
        @cancel-turn="() => client.abortCurrentPrompt()"
      />
    </div>

    <!-- Composer -->
    <div class="app-dock">
      <Composer
        :running="conversationRunning"
        :mode="composerMode"
        :permission="composerPermission"
        :modes="{ plan: client.planMode.value || false, swarm: client.swarmMode.value || false, goal: client.goalMode.value || false }"
        :models="composerModels"
        :current-model="composerCurrentModel"
        :effort="null"
        :context="{ used: '0', total: '0', pct: 0 }"
        :quota="{ q5h: 0, q5hReset: '', qWeek: 0, qWeekReset: '' }"
        :session-title="sidebarCurrentWs"
        @send="onSend"
        @set-mode="onComposerMode"
        @cancel="() => client.abortCurrentPrompt()"
        @toggle-mode="(m: 'plan' | 'swarm' | 'goal') => {
          if (m === 'plan') client.togglePlanMode();
          else if (m === 'swarm') client.toggleSwarmMode();
          else if (m === 'goal') client.toggleGoalMode();
        }"
        @set-permission="(p: any) => client.setPermission(p)"
      />
    </div>
  </AppShell>
</template>
