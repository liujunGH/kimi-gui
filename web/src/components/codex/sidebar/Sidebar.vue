<script setup lang="ts">
/**
 * Sidebar —— 左栏(品牌 / 新建任务 / 搜索 / 状态过滤 / 置顶组 + 工作区分组 / 底栏)
 *
 * props 契约见 types/codex.ts SidebarProps。
 * pinnedIds:置顶的 session id 列表(契约外补充,轮次 0.3 后加;轮次 3 由 ZCode 接真源)。
 * emits 契约见 SidebarEmits;'open-settings' 是补充 emit(底栏设置入口)。
 */
import { computed, ref, watch } from 'vue';
import type { Session } from '../../../types';
import type { SidebarProps, SidebarEmits, WorkspaceSortMode } from '../../../types/codex';
import CodexIcon from '../layout/CodexIcon.vue';
import WorkspaceGroup from './WorkspaceGroup.vue';
import ThreadRow from './ThreadRow.vue';
import StatusFilter from './StatusFilter.vue';
import AccountRow from './AccountRow.vue';
import { sessionToThreadStatus } from './threadStatus';
import { useTauriDaemon } from '../../../composables/codex/useTauriDaemon';

const { startWindowDragging } = useTauriDaemon();

const props = defineProps<SidebarProps & {
  pinnedIds?: string[];
  workspaceTrust?: Record<string, boolean | null | undefined>;
  workspaceTrustBusy?: string[];
}>();
const emit = defineEmits<SidebarEmits & {
  (e: 'open-settings'): void;
  (e: 'select-workspace', id: string): void;
  (e: 'archive-session', id: string): void;
  (e: 'rename-session', id: string): void;
  (e: 'export-session', id: string): void;
  (e: 'copy-session-id', id: string): void;
  (e: 'fork-session', id: string): void;
  (e: 'set-workspace-sort', mode: WorkspaceSortMode): void;
  (e: 'rename-workspace', id: string): void;
  (e: 'delete-workspace', id: string): void;
  (e: 'copy-path', root: string): void;
  (e: 'toggle-workspace-pin', id: string): void;
  (e: 'edit-workspace-emoji', id: string): void;
  (e: 'inspect-workspace-trust', id: string): void;
  (e: 'set-workspace-trust', id: string, trusted: boolean): void;
  (e: 'reorder-workspaces', ids: string[]): void;
}>();

/** 工作区排序模式:接 client.setWorkspaceSortMode(持久化) */
const sortModes = ref<Record<string, WorkspaceSortMode>>({});
function sortOf(name: string): WorkspaceSortMode {
  return sortModes.value[name] ?? 'recent';
}
function onSetSort(wsId: string, mode: WorkspaceSortMode) {
  sortModes.value[wsId] = mode;
  emit('set-workspace-sort', mode);
}

const draggingWorkspaceId = ref('');
function onWorkspaceDragStart(event: DragEvent, id: string): void {
  draggingWorkspaceId.value = id;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  }
}
function onWorkspaceDragOver(event: DragEvent): void {
  if (!draggingWorkspaceId.value) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}
function onWorkspaceDrop(event: DragEvent, targetId: string): void {
  event.preventDefault();
  const sourceId = draggingWorkspaceId.value || event.dataTransfer?.getData('text/plain') || '';
  draggingWorkspaceId.value = '';
  if (!sourceId || sourceId === targetId) return;
  const ids = props.workspaces.map((workspace) => workspace.id);
  const sourceIndex = ids.indexOf(sourceId);
  const targetIndex = ids.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  ids.splice(sourceIndex, 1);
  ids.splice(targetIndex, 0, sourceId);
  emit('reorder-workspaces', ids);
}

const filteredSessions = computed(() => {
  if (props.filter === 'running') return props.sessions.filter((s) => s.busy);
  if (props.filter === 'pending_approval')
    return props.sessions.filter((s) => s.pendingInteraction && s.pendingInteraction !== 'none');
  return props.sessions;
});

const pinnedSessions = computed(() =>
  filteredSessions.value.filter((s) => props.pinnedIds?.includes(s.id)),
);

/** 筛选态下没有匹配会话的项目不展示(会话级筛选);all 态保留空项目 */
const visibleWorkspaces = computed(() => {
  if (props.filter === 'all') return props.workspaces;
  return props.workspaces.filter((ws) => sessionsOf(ws.name).length > 0);
});

// A large Kimi home can contain dozens of one-off workspaces. Mounting every
// WorkspaceGroup also mounts every group header/menu and one document listener,
// even though most rows are far below the scroll viewport. Keep the sidebar
// progressive while always retaining the active workspace as an escape hatch.
const WORKSPACE_PAGE = 12;
const workspaceLimit = ref(WORKSPACE_PAGE);
const displayedWorkspaces = computed(() => {
  const visible = visibleWorkspaces.value;
  if (visible.length <= workspaceLimit.value) return visible;
  const included = new Set(visible.slice(0, workspaceLimit.value).map((ws) => ws.id));
  const active = visible.find((ws) => ws.id === props.currentWorkspaceId);
  if (active) included.add(active.id);
  return visible.filter((ws) => included.has(ws.id));
});
const hiddenWorkspaceCount = computed(
  () => visibleWorkspaces.value.length - displayedWorkspaces.value.length,
);
const canCollapseWorkspaces = computed(
  () => workspaceLimit.value > WORKSPACE_PAGE && visibleWorkspaces.value.length > WORKSPACE_PAGE,
);
watch(() => props.filter, () => { workspaceLimit.value = WORKSPACE_PAGE; });
/** 筛选零匹配空态 */
const showFilterEmpty = computed(() => props.filter !== 'all' && filteredSessions.value.length === 0);

/** 失败/待输入优先(C9):稳定分区排序,不打乱组内原有顺序 */
function rankOf(s: Session): number {
  const st = sessionToThreadStatus(s);
  if (st === 'failed') return 0;
  if (st === 'needs_input') return 1;
  return 2;
}
function sessionsOf(wsName: string): Session[] {
  return filteredSessions.value
    .filter((s) => (s.workspaceName ?? '') === wsName)
    .map((s, i) => [s, i] as const)
    .sort((a, b) => rankOf(a[0]) - rankOf(b[0]) || a[1] - b[1])
    .map(([s]) => s);
}
</script>

<template>
  <aside class="app-sidebar">
    <div
      class="sidebar-brand"
      data-tauri-drag-region="deep"
      @mousedown="startWindowDragging"
    >
      <span class="brand-logo" data-tauri-drag-region>K</span>
      <span class="brand-name" data-tauri-drag-region>Kimi Studio</span>
      <button class="icon-btn brand-collapse" title="折叠侧栏" @click="emit('collapse')">
        <CodexIcon name="panel-left" />
      </button>
    </div>

    <div class="sidebar-new">
      <slot name="new-task">
        <button class="new-task" @click="emit('new-task')">
          <CodexIcon name="plus" />
          新建任务
        </button>
      </slot>
    </div>

    <button type="button" class="sidebar-search" title="搜索线程 ⌘K" @click="emit('search')">
      <div class="search-box">
        <CodexIcon name="search" />
        <span>搜索线程</span>
        <span class="kbd">⌘K</span>
      </div>
    </button>

    <StatusFilter :filter="props.filter" @set-filter="(f) => emit('set-filter', f)" />

    <div class="ws-list-head">
      <span class="ws-list-label">工作区</span>
      <button class="ws-add" title="添加工作区" @click="emit('add-workspace')">
        <CodexIcon name="plus" />
      </button>
    </div>

    <div class="sidebar-list">
      <!-- 置顶组 -->
      <section v-if="pinnedSessions.length" class="workspace-group pin-group">
        <div class="workspace-header">
          <span class="ws-name">置顶</span>
        </div>
        <div class="ws-threads">
          <ThreadRow
            v-for="s in pinnedSessions"
            :key="'pin-' + s.id"
            :session="s"
            :active="s.id === props.currentSessionId"
            :status="sessionToThreadStatus(s)"
            :pinned="true"
            @select="emit('select-session', s.id)"
            @toggle-pin="emit('toggle-pin', s.id)"
            @archive="emit('archive-session', s.id)"
            @rename="emit('rename-session', s.id)"
            @export="emit('export-session', s.id)"
            @copy-id="emit('copy-session-id', s.id)"
            @fork="emit('fork-session', s.id)"
          />
        </div>
      </section>

      <WorkspaceGroup
        v-for="ws in displayedWorkspaces"
        :key="ws.id"
        :workspace="ws"
        :sessions="sessionsOf(ws.name)"
        :current-session-id="props.currentSessionId"
        :sort-mode="sortOf(ws.name)"
        :pinned-ids="props.pinnedIds"
        :active-workspace="ws.id === props.currentWorkspaceId"
        :trusted="props.workspaceTrust?.[ws.id]"
        :trust-busy="props.workspaceTrustBusy?.includes(ws.id)"
        :dragging="draggingWorkspaceId === ws.id"
        @select-session="(id) => emit('select-session', id)"
        @toggle-pin="(id) => emit('toggle-pin', id)"
        @archive-session="emit('archive-session', $event)"
        @rename-session="emit('rename-session', $event)"
        @export-session="emit('export-session', $event)"
        @copy-session-id="emit('copy-session-id', $event)"
        @fork-session="emit('fork-session', $event)"
        @set-sort="(m) => onSetSort(ws.name, m)"
        @select-workspace="emit('select-workspace', $event)"
        @rename-workspace="emit('rename-workspace', $event)"
        @delete-workspace="emit('delete-workspace', $event)"
        @copy-path="emit('copy-path', $event)"
        @toggle-workspace-pin="emit('toggle-workspace-pin', $event)"
        @edit-workspace-emoji="emit('edit-workspace-emoji', $event)"
        @inspect-trust="emit('inspect-workspace-trust', $event)"
        @set-trust="(id, trusted) => emit('set-workspace-trust', id, trusted)"
        @drag-start="onWorkspaceDragStart"
        @drag-over="onWorkspaceDragOver"
        @drop="onWorkspaceDrop"
        @drag-end="draggingWorkspaceId = ''"
      />
      <div v-if="hiddenWorkspaceCount > 0 || canCollapseWorkspaces" class="workspace-pager">
        <button
          v-if="hiddenWorkspaceCount > 0"
          type="button"
          class="workspace-pager-btn"
          @click="workspaceLimit += WORKSPACE_PAGE"
        >
          显示更多工作区（剩余 {{ hiddenWorkspaceCount }}）
        </button>
        <button
          v-else
          type="button"
          class="workspace-pager-btn"
          @click="workspaceLimit = WORKSPACE_PAGE"
        >
          收起工作区
        </button>
      </div>
      <div v-if="showFilterEmpty" class="sf-empty">没有符合筛选的会话</div>
    </div>

    <div class="sidebar-footer">
      <AccountRow />
      <a class="footer-link" href="#" @click.prevent="emit('open-settings')">
        <CodexIcon name="settings" />
        设置
      </a>
    </div>
  </aside>
</template>
