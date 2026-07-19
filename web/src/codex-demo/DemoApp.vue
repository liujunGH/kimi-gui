<script setup lang="ts">
/**
 * DemoApp —— codex 组件验收沙箱(codex.html 入口)
 *
 * 7 个场景对应 prototype v2 的 7 页:?scene=index|running|steer|approval|multi-agent|diff|settings
 * 数据全部来自 ./mock.ts(原型期 mock,经 props 进组件,不污染产品组件)。
 * 快捷键走 GLM 的 useHotkeys 注册表(handler 显式 return true):
 *   ⌘B review / ⌘I inspect / ⌥⌘S 侧边任务 / ⌥⌘P 置顶 / Esc 分层关闭
 */
import { computed, reactive, ref } from 'vue';
import type { ChatTurn, PermissionMode } from '../types';
import type {
  ComposerMode,
  EffortLevel,
  ModeFlags,
  SessionFilter,
} from '../types/codex';
import { useUIState } from '../composables/codex/useUIState';
import { useHotkeys } from '../composables/codex/useHotkeys';
import { useTheme } from '../composables/codex/useTheme';
import { useTauriDaemon } from '../composables/codex/useTauriDaemon';
import AppShell from '../components/codex/AppShell.vue';
import Sidebar from '../components/codex/sidebar/Sidebar.vue';
import ConversationPane from '../components/codex/chat/ConversationPane.vue';
import MessageUser from '../components/codex/chat/MessageUser.vue';
import MessageAssistant from '../components/codex/chat/MessageAssistant.vue';
import ThinkingBlock from '../components/codex/chat/ThinkingBlock.vue';
import ToolCallCard from '../components/codex/chat/ToolCallCard.vue';
import Composer from '../components/codex/composer/Composer.vue';
import QueuePanel from '../components/codex/composer/QueuePanel.vue';
import ApprovalCard from '../components/codex/approval/ApprovalCard.vue';
import DiffView from '../components/codex/diff/DiffView.vue';
import ReviewPane from '../components/codex/diff/ReviewPane.vue';
import DetailPane from '../components/codex/detail/DetailPane.vue';
import SideTask from '../components/codex/layout/SideTask.vue';
import ThreadMenu from '../components/codex/layout/ThreadMenu.vue';
import FileMenu from '../components/codex/layout/FileMenu.vue';
import Toast, { useToast } from '../components/codex/layout/Toast.vue';
import AgentPanel from '../components/codex/agents/AgentPanel.vue';
import SubagentCard from '../components/codex/agents/SubagentCard.vue';
import AgentTranscript from '../components/codex/agents/AgentTranscript.vue';
import SettingsPage from '../components/codex/settings/SettingsPage.vue';
import CodexIcon from '../components/codex/layout/CodexIcon.vue';
import * as M from './mock';

// ---------------------------------------------------------------- 场景

const SCENES = [
  { id: 'index', name: '空闲态' },
  { id: 'running', name: '运行态' },
  { id: 'steer', name: '插话反馈' },
  { id: 'approval', name: '审批' },
  { id: 'multi-agent', name: '多 Agent' },
  { id: 'diff', name: 'Diff' },
  { id: 'settings', name: '设置' },
] as const;
type SceneId = (typeof SCENES)[number]['id'];

const scene = computed<SceneId>(() => {
  const s = new URLSearchParams(location.search).get('scene') ?? 'index';
  return (SCENES.some((x) => x.id === s) ? s : 'index') as SceneId;
});
function go(id: string) {
  location.search = '?scene=' + id;
}

const sceneTitles: Record<SceneId, string> = {
  index: '重构 Composer 双模交互',
  running: '重构 Composer 双模交互',
  steer: '重构 Composer 双模交互',
  approval: '添加 JWT 鉴权中间件',
  'multi-agent': '/swarm 重构 4 个组件',
  diff: 'DiffView 重做',
  settings: '设置',
};
const sceneSession: Record<SceneId, string> = {
  index: 's1',
  running: 's1',
  steer: 's1',
  approval: 's3',
  'multi-agent': 's5',
  diff: 's2',
  settings: 's1',
};

// ---------------------------------------------------------------- 侧栏状态

const filter = ref<SessionFilter>('all');
const pinnedIds = ref<string[]>([]);
function togglePin(id: string) {
  pinnedIds.value = pinnedIds.value.includes(id)
    ? pinnedIds.value.filter((x) => x !== id)
    : [...pinnedIds.value, id];
  toast(pinnedIds.value.includes(id) ? '已置顶' : '已取消置顶');
}

// ---------------------------------------------------------------- Composer / 面板状态

const ui = useUIState();

// 轮次 3 阶段 C:挂载时调 daemon wire-up(Tauri 环境拿真 base,浏览器走 no-tauri)
const tauri = useTauriDaemon();
tauri.fetch().catch(() => {/* 静默:浏览器环境/daemon 未启动都正常 */});
const { toast } = useToast();
const { theme, toggle: toggleTheme } = useTheme();

/* useUIState 返回的 ref 在模板里需要解包别名(嵌套 ref 不会被模板自动解包) */
const gThinking = computed(() => ui.globalThinking.value);
const detailOpen = computed(() => ui.detailPaneOpen.value);
const detailTab = computed(() => ui.detailPaneTab.value);
const sideKind = computed(() => ui.sideTaskKind.value);
const sideSubId = computed(() => ui.sideTaskSubagentId.value);

const running = computed(() => ['running', 'steer', 'multi-agent'].includes(scene.value));
const composerMode = ref<ComposerMode>(scene.value === 'steer' ? 'steer' : 'queue');
const permission = ref<PermissionMode>('manual');
const modes = reactive<ModeFlags>({ ...M.defaultModes, swarm: scene.value === 'multi-agent' });
const currentModel = ref('k3');
const effort = ref<EffortLevel>('High');

const queued = ref(
  (scene.value === 'steer' ? M.steerQueue : M.runningQueue).map((q) => ({ ...q })),
);

function onSend(_text: string, mode: ComposerMode) {
  toast(mode === 'steer' ? '已插话到当前轮(原型)' : running.value ? '已排队(原型)' : '已发送(原型)');
}
function qSteer(id: string) {
  queued.value = queued.value.filter((q) => q.id !== id);
  toast('已插话到当前轮 · 1 段引导(原型)');
}
function qEdit(id: string) {
  queued.value = queued.value.filter((q) => q.id !== id);
  toast('已回填输入框(原型)');
}
function qRemove(id: string) {
  queued.value = queued.value.filter((q) => q.id !== id);
}

const agentPanelOpen = ref(false);
function openTranscript(id: string) {
  agentPanelOpen.value = false;
  ui.openSideTask('agent-transcript', id);
}

function toggleReview() {
  if (ui.reviewPaneOpen.value) ui.closeReview();
  else ui.openReview();
}
function toggleDetail() {
  if (ui.detailPaneOpen.value) ui.closeDetail();
  else ui.openDetail();
}
function toggleSideTask() {
  if (ui.sideTaskOpen.value) ui.closeSideTask();
  else ui.openSideTask('thread');
}

useHotkeys([
  {
    key: 'b',
    meta: true,
    handler: () => {
      if (scene.value === 'diff') {
        toggleReview();
        return true;
      }
    },
  },
  {
    key: 'i',
    meta: true,
    handler: () => {
      if (scene.value === 'index') {
        toggleDetail();
        return true;
      }
    },
  },
  {
    key: 's',
    meta: true,
    alt: true,
    handler: () => {
      toggleSideTask();
      return true;
    },
  },
  {
    key: 'p',
    meta: true,
    alt: true,
    handler: () => {
      togglePin(sceneSession[scene.value]);
      return true;
    },
  },
  { key: 'Escape', handler: () => ui.escClose() },
]);

// ---------------------------------------------------------------- 场景内联 mock(单 turn 小数据)

const steerUserTurn: ChatTurn = {
  id: 'sf1',
  role: 'user',
  no: 1,
  text: '插话 steer 的按钮用 warning 色高亮,跟排队区分开。',
  createdAt: '2026-07-19T14:35:00',
};
const steerThinkingText =
  '收到引导,先停下配色方案的收尾:现在 .mode-steer.active 只是普通白底,和「排队下轮」的高亮几乎一样,运行中快速操作时容易误插话,这正是要修的点。\n\n调整:.mode-btn.mode-steer.active 改为 warning-soft 底 + warning 字,去掉投影,与排队的 accent 蓝中性高亮拉开;mode-steer-on 下 textarea 的 placeholder 同步染 warning 色,输入前就有预期。只改 composer.css,不动 token。';
const swarmUserTurn: ChatTurn = {
  id: 'sw1',
  role: 'user',
  no: 1,
  text: '/swarm 重构 4 个组件:ThinkingBlock、Composer、ApprovalCard、DiffView',
  createdAt: '2026-07-19T15:02:00',
};

const sideTaskProps = computed(() => {
  if (ui.sideTaskKind.value === 'agent-transcript' && ui.sideTaskSubagentId.value) {
    const id = ui.sideTaskSubagentId.value;
    const sa = [...M.multiSubagents, ...M.agentPanelCompleted].find((x) => x.id === id);
    return {
      title: sa?.name ?? id,
      status:
        sa?.status === 'completed'
          ? { text: '已完成', kind: 'success' as const }
          : sa?.status === 'suspended'
            ? { text: '待输入', kind: 'warning' as const }
            : { text: '运行中', kind: 'accent' as const },
      thread: { name: sa?.name ?? id, ws: '子智能体 · /swarm 重构 4 个组件', dot: 'running' as const },
    };
  }
  return {
    title: '侧边任务',
    status: { text: '运行中', kind: 'accent' as const },
    thread: { name: 'DiffView 重做', ws: 'kimi-gui', dot: 'running' as const },
  };
});

const fileMenuRef = ref<InstanceType<typeof FileMenu> | null>(null);
const barOpen = ref(false);
function openFM(e: MouseEvent, file: string) {
  (fileMenuRef.value as { openFileMenu?: (ev: MouseEvent, f: string) => void } | null)?.openFileMenu?.(e, file);
}
</script>

<template>
  <AppShell>
    <template #sidebar="{ toggleCollapsed }">
      <Sidebar
        :workspaces="M.workspaces"
        :sessions="M.sessions"
        current-workspace-id="kimi-gui"
        :current-session-id="sceneSession[scene]"
        :filter="filter"
        :collapsed="false"
        :pinned-ids="pinnedIds"
        @collapse="toggleCollapsed"
        @select-session="() => {}"
        @new-task="toast('新建任务(原型)')"
        @set-filter="(f: SessionFilter) => (filter = f)"
        @toggle-pin="togglePin"
        @open-settings="go('settings')"
      />
    </template>

    <!-- ================= toolbar ================= -->
    <header class="app-toolbar">
      <template v-if="scene !== 'settings'">
        <span class="toolbar-title">{{ sceneTitles[scene] }}</span>
        <ThreadMenu
          @pin="togglePin(sceneSession[scene])"
          @open-side-task="ui.openSideTask('thread')"
        />
        <span class="toolbar-spacer"></span>
        <!-- 轮次 3 阶段 C:daemon wire-up 状态指示(证明 B+D 端到端通) -->
        <span
          v-if="tauri.daemonInfo.value"
          class="pill pill-success"
          :title="`base: ${tauri.daemonInfo.value.base}`"
        >
          <span class="dot dot-done"></span>daemon 已连
        </span>
        <span
          v-else-if="tauri.loading.value"
          class="pill"
          title="invoke('daemon_info') 中"
        ><span class="dot dot-running"></span>连接中</span>
        <span
          v-else
          class="pill"
          :title="`error: ${tauri.error.value ?? '未知'}`"
        >{{ tauri.error.value === 'no-tauri' ? '浏览器模式' : 'daemon 未连' }}</span>
        <div
          v-if="scene !== 'multi-agent'"
          class="toolbar-thinking-toggle"
          :class="{ on: gThinking }"
          title="全局思考开关"
          @click="ui.toggleGlobalThinking()"
        >
          <span>思考</span>
          <span class="tt-switch"></span>
        </div>
        <span v-if="scene === 'index'" class="pill pill-success"><span class="dot dot-done"></span>已连接</span>
        <span v-if="scene === 'running'" class="pill pill-accent"><span class="dot dot-running"></span>运行中 · 18s</span>
        <span v-if="scene === 'steer'" class="pill pill-accent"><span class="dot dot-running"></span>运行中 · 23s</span>
        <span v-if="scene === 'approval'" class="pill pill-warning"><span class="dot dot-waiting"></span>等待批准 · 2 项</span>
        <span v-if="scene === 'multi-agent'" class="pill pill-accent"><span class="dot dot-running"></span>2 运行 · 1 待输入 · 1 完成</span>
        <button v-if="scene === 'multi-agent'" class="icon-btn" title="子智能体" @click="agentPanelOpen = !agentPanelOpen">
          <CodexIcon name="bot" />
        </button>
        <button v-if="scene === 'index'" class="icon-btn" title="Inspect ⌘I" @click="toggleDetail">
          <CodexIcon name="panel-right" />
        </button>
        <span v-if="scene === 'diff'" class="pill pill-success"><span class="dot dot-done"></span>已完成</span>
        <button v-if="scene === 'diff'" class="btn" @click="toggleReview">
          <CodexIcon name="git-branch" />
          Review
          <span class="kbd">⌘B</span>
        </button>
      </template>
      <template v-else>
        <span class="toolbar-title">设置</span>
      </template>
    </header>

    <!-- ================= index ================= -->
    <template v-if="scene === 'index'">
      <ConversationPane
        :turns="M.indexTurns"
        :todos-by-turn="M.indexTodos"
        :turn-progress="M.indexProgress"
        :running="false"
      />
      <div class="app-dock">
        <div class="dock-inner">
          <Composer
            :running="false"
            mode="queue"
            :permission="permission"
            :modes="modes"
            :models="M.models"
            :current-model="currentModel"
            :effort="effort"
            :context="M.contextInfo"
            :quota="M.quotaInfo"
            :builtin="M.builtin"
            :skills="M.skills"
            :files="M.files"
            :session-title="sceneTitles.index"
            @send="onSend"
            @set-mode="(m: ComposerMode) => (composerMode = m)"
            @cancel="toast('已中断(原型)')"
            @set-model="(id: string) => (currentModel = id)"
            @set-effort="(lv: EffortLevel) => (effort = lv)"
            @set-permission="(p: PermissionMode) => (permission = p)"
            @toggle-mode="(m: keyof ModeFlags) => (modes[m] = !modes[m])"
          />
        </div>
      </div>
      <DetailPane
        :open="detailOpen"
        :tab="detailTab"
        :thread-info="{
          workspace: 'kimi-gui',
          createdAt: '今天 14:32',
          model: 'kimi-k2-thinking',
          permission,
          context: M.contextInfo,
        }"
        :thinking-full-text="M.indexThinkingFull"
        :tool-calls="M.indexToolCalls"
        :tasks="M.indexTodos.t2 ?? []"
        @set-tab="(t) => ui.setDetailTab(t)"
        @close="ui.closeDetail()"
      />
    </template>

    <!-- ================= running ================= -->
    <template v-else-if="scene === 'running'">
      <ConversationPane
        :turns="M.runningTurns"
        :todos-by-turn="{}"
        :turn-progress="M.runningProgress"
        :running="true"
      />
      <div class="app-dock">
        <div class="dock-inner">
          <QueuePanel
            :queued-prompts="queued"
            @promote-to-steer="qSteer"
            @edit="qEdit"
            @remove="qRemove"
          />
          <Composer
            :running="true"
            :mode="composerMode"
            :permission="permission"
            :modes="modes"
            :models="M.models"
            :current-model="currentModel"
            :effort="effort"
            :context="M.contextInfo"
            :quota="M.quotaInfo"
            :builtin="M.builtin"
            :skills="M.skills"
            :files="M.files"
            :session-title="sceneTitles.running"
            @send="onSend"
            @set-mode="(m: ComposerMode) => (composerMode = m)"
            @cancel="toast('已中断(原型)')"
            @set-model="(id: string) => (currentModel = id)"
            @set-effort="(lv: EffortLevel) => (effort = lv)"
            @set-permission="(p: PermissionMode) => (permission = p)"
            @toggle-mode="(m: keyof ModeFlags) => (modes[m] = !modes[m])"
          />
        </div>
      </div>
    </template>

    <!-- ================= steer ================= -->
    <template v-else-if="scene === 'steer'">
      <div class="app-conversation">
        <div class="conversation">
          <MessageUser :turn="steerUserTurn" />
          <div class="msg-assistant">
            <ThinkingBlock
              :text="steerThinkingText"
              :streaming="true"
              :global-show="gThinking"
              :steer-mark="{ text: steerUserTurn.text, at: 0 }"
            />
            <div class="a-content"><p>收到,已切换 steer 按钮配色:</p></div>
            <ToolCallCard
              :call="{ id: 'tc3', name: 'edit_file', arg: 'composer.css · +12 −6', status: 'running' }"
              @inspect="() => {}"
            />
          </div>
        </div>
      </div>
      <div class="app-dock">
        <div class="dock-inner">
          <QueuePanel
            :queued-prompts="queued"
            :default-open="true"
            @promote-to-steer="qSteer"
            @edit="qEdit"
            @remove="qRemove"
          />
          <div class="steer-feedback">
            <CodexIcon name="flag" />
            <span>已插话到当前轮 · 1 段引导</span>
          </div>
          <Composer
            :running="true"
            :mode="composerMode"
            :permission="permission"
            :modes="modes"
            :models="M.models"
            :current-model="currentModel"
            :effort="effort"
            :context="M.contextInfo"
            :quota="M.quotaInfo"
            :builtin="M.builtin"
            :skills="M.skills"
            :files="M.files"
            :session-title="sceneTitles.steer"
            @send="onSend"
            @set-mode="(m: ComposerMode) => (composerMode = m)"
            @cancel="toast('已中断(原型)')"
            @set-model="(id: string) => (currentModel = id)"
            @set-effort="(lv: EffortLevel) => (effort = lv)"
            @set-permission="(p: PermissionMode) => (permission = p)"
            @toggle-mode="(m: keyof ModeFlags) => (modes[m] = !modes[m])"
          />
        </div>
      </div>
    </template>

    <!-- ================= approval ================= -->
    <template v-else-if="scene === 'approval'">
      <div class="app-conversation">
        <div class="conversation">
          <MessageUser :turn="M.approvalTurns[0]!" />
          <MessageAssistant :turn="M.approvalTurns[1]!" :running="false" />
          <div class="msg-assistant">
            <ApprovalCard v-for="req in M.approvalRequests" :key="req.approvalId" v-bind="req" />
          </div>
        </div>
      </div>
      <div class="app-dock">
        <div class="dock-inner">
          <Composer
            :running="false"
            mode="queue"
            :permission="permission"
            :modes="modes"
            :models="M.models"
            :current-model="currentModel"
            :effort="effort"
            :context="M.contextInfo"
            :quota="M.quotaInfo"
            :builtin="M.builtin"
            :skills="M.skills"
            :files="M.files"
            :session-title="sceneTitles.approval"
            placeholder="等待审批中 · 可继续输入下一条消息…"
            @send="onSend"
            @set-mode="(m: ComposerMode) => (composerMode = m)"
            @cancel="toast('已中断(原型)')"
            @set-model="(id: string) => (currentModel = id)"
            @set-effort="(lv: EffortLevel) => (effort = lv)"
            @set-permission="(p: PermissionMode) => (permission = p)"
            @toggle-mode="(m: keyof ModeFlags) => (modes[m] = !modes[m])"
          />
        </div>
      </div>
    </template>

    <!-- ================= multi-agent ================= -->
    <template v-else-if="scene === 'multi-agent'">
      <div class="app-conversation">
        <div class="conversation">
          <MessageUser :turn="swarmUserTurn" />
          <div class="msg-assistant">
            <div class="a-content"><p>已拆分为 4 个子任务并行执行(点卡片钻取子 agent):</p></div>
            <div class="subagent-grid">
              <SubagentCard
                v-for="sa in M.multiSubagents"
                :key="sa.id"
                :subagent="sa"
                @inspect="openTranscript(sa.id)"
              />
            </div>
          </div>
        </div>
      </div>
      <div class="app-dock">
        <div class="dock-inner">
          <Composer
            :running="true"
            :mode="composerMode"
            :permission="permission"
            :modes="modes"
            :models="M.models"
            :current-model="currentModel"
            :effort="effort"
            :context="M.contextInfo"
            :quota="M.quotaInfo"
            :builtin="M.builtin"
            :skills="M.skills"
            :files="M.files"
            :session-title="sceneTitles['multi-agent']"
            @send="onSend"
            @set-mode="(m: ComposerMode) => (composerMode = m)"
            @cancel="toast('已中断(原型)')"
            @set-model="(id: string) => (currentModel = id)"
            @set-effort="(lv: EffortLevel) => (effort = lv)"
            @set-permission="(p: PermissionMode) => (permission = p)"
            @toggle-mode="(m: keyof ModeFlags) => (modes[m] = !modes[m])"
          />
        </div>
      </div>
      <AgentPanel
        :active="M.multiSubagents.filter((s) => s.status === 'working')"
        :completed="M.agentPanelCompleted"
        :open="agentPanelOpen"
        @inspect="openTranscript"
        @close="agentPanelOpen = false"
      />
    </template>

    <!-- ================= diff ================= -->
    <template v-else-if="scene === 'diff'">
      <div class="app-conversation">
        <div class="conversation">
          <MessageUser :turn="M.diffTurns[0]!" />
          <MessageAssistant :turn="M.diffTurns[1]!" :running="false" />
          <div class="msg-assistant">
            <div @contextmenu.prevent="openFM($event, 'DiffView.vue')">
              <DiffView
                :files="[M.diffFiles[0]!]"
                :hunks-by-file="{ 'DiffView.vue': M.hunksByFile['DiffView.vue']! }"
                :syntax-highlight="true"
              />
            </div>
            <div @contextmenu.prevent="openFM($event, 'diffHighlight.ts')">
              <DiffView
                :files="[M.diffFiles[1]!]"
                :hunks-by-file="{ 'diffHighlight.ts': M.hunksByFile['diffHighlight.ts']! }"
                :syntax-highlight="true"
              />
            </div>
          </div>
        </div>
      </div>
      <div class="app-dock">
        <div class="dock-inner">
          <Composer
            :running="false"
            mode="queue"
            :permission="permission"
            :modes="modes"
            :models="M.models"
            :current-model="currentModel"
            :effort="effort"
            :context="M.contextInfo"
            :quota="M.quotaInfo"
            :builtin="M.builtin"
            :skills="M.skills"
            :files="M.files"
            :session-title="sceneTitles.diff"
            @send="onSend"
            @set-mode="(m: ComposerMode) => (composerMode = m)"
            @cancel="toast('已中断(原型)')"
            @set-model="(id: string) => (currentModel = id)"
            @set-effort="(lv: EffortLevel) => (effort = lv)"
            @set-permission="(p: PermissionMode) => (permission = p)"
            @toggle-mode="(m: keyof ModeFlags) => (modes[m] = !modes[m])"
          />
        </div>
      </div>
      <ReviewPane :files="M.diffFiles" :hunks-by-file="M.hunksByFile" branch="feat/diff-redo" />
    </template>

    <!-- ================= settings ================= -->
    <template v-else-if="scene === 'settings'">
      <SettingsPage />
    </template>
  </AppShell>

  <!-- ================= 全局覆盖物 ================= -->
  <SideTask v-bind="sideTaskProps">
    <AgentTranscript
      v-if="sideKind === 'agent-transcript' && sideSubId"
      :subagent-id="sideSubId"
      :turns="M.agentTranscripts[sideSubId] ?? M.sideThreadTurns"
      :ask="M.agentAsks[sideSubId] ?? ''"
    />
    <AgentTranscript v-else subagent-id="side" :turns="M.sideThreadTurns" />
  </SideTask>
  <Toast />
  <FileMenu ref="fileMenuRef" />

  <!-- 验收导航(原型 chrome,非产品;默认收起为小 chip,不挡 Composer) -->
  <div class="prototype-bar" :class="{ mini: !barOpen }">
    <button class="pb-chip" title="场景导航" @click="barOpen = !barOpen">
      轮次 2 验收
      <CodexIcon name="chevron-down" />
    </button>
    <div class="pb-inner">
      <a v-for="s in SCENES" :key="s.id" :href="'?scene=' + s.id" :class="{ active: scene === s.id }">
        {{ s.name }}
      </a>
      <span class="pb-divider"></span>
      <button class="pb-theme" title="切换主题" @click="toggleTheme">
        <CodexIcon :name="theme === 'dark' ? 'sun' : 'moon'" size="sm" />
      </button>
    </div>
  </div>
</template>
