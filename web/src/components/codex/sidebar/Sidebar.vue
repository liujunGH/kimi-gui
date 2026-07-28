<script setup lang="ts">
/**
 * Sidebar —— 左栏(品牌 / 新建任务 / 搜索 / 状态过滤 / 置顶组 + 工作区分组 / 底栏)
 *
 * props 契约见 types/codex.ts SidebarProps。
 * pinnedIds:置顶的 session id 列表(契约外补充,轮次 0.3 后加;轮次 3 由 ZCode 接真源)。
 * emits 契约见 SidebarEmits;'open-settings' 是补充 emit(底栏设置入口)。
 */
import { computed, ref } from 'vue';
import type { Session } from '../../../types';
import type { SidebarProps, SidebarEmits, WorkspaceSortMode } from '../../../types/codex';
import CodexIcon from '../layout/CodexIcon.vue';
import WorkspaceGroup from './WorkspaceGroup.vue';
import ThreadRow from './ThreadRow.vue';
import StatusFilter from './StatusFilter.vue';
import AccountRow from './AccountRow.vue';
import { sessionToThreadStatus } from './threadStatus';
import { useTauriDaemon } from '../../../composables/codex/useTauriDaemon';

const { toggleWindowZoom } = useTauriDaemon();
/** 品牌区双击放大/还原窗口(折叠按钮不算) */
function onBrandDblclick(e: MouseEvent) {
  if ((e.target as HTMLElement | null)?.closest('button')) return;
  void toggleWindowZoom();
}

const props = defineProps<SidebarProps & { pinnedIds?: string[] }>();
const emit = defineEmits<SidebarEmits & {
  (e: 'open-settings'): void;
  (e: 'select-workspace', id: string): void;
  (e: 'archive-session', id: string): void;
  (e: 'rename-session', id: string): void;
  (e: 'export-session', id: string): void;
  (e: 'copy-session-id', id: string): void;
  (e: 'set-workspace-sort', mode: WorkspaceSortMode): void;
  (e: 'rename-workspace', id: string): void;
  (e: 'delete-workspace', id: string): void;
  (e: 'copy-path', root: string): void;
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
    <div class="sidebar-brand" @dblclick="onBrandDblclick">
      <span class="brand-logo" data-tauri-drag-region>K</span>
      <span class="brand-name" data-tauri-drag-region>Kimi Code</span>
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

    <div class="sidebar-search" title="搜索线程 ⌘K" @click="emit('search')">
      <div class="search-box">
        <CodexIcon name="search" />
        <span>搜索线程</span>
        <span class="kbd">⌘K</span>
      </div>
    </div>

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
          />
        </div>
      </section>

      <WorkspaceGroup
        v-for="ws in visibleWorkspaces"
        :key="ws.id"
        :workspace="ws"
        :sessions="sessionsOf(ws.name)"
        :current-session-id="props.currentSessionId"
        :sort-mode="sortOf(ws.name)"
        :pinned-ids="props.pinnedIds"
        :active-workspace="ws.id === props.currentWorkspaceId"
        @select-session="(id) => emit('select-session', id)"
        @toggle-pin="(id) => emit('toggle-pin', id)"
        @archive-session="emit('archive-session', $event)"
        @rename-session="emit('rename-session', $event)"
        @export-session="emit('export-session', $event)"
        @copy-session-id="emit('copy-session-id', $event)"
        @set-sort="(m) => onSetSort(ws.name, m)"
        @select-workspace="emit('select-workspace', $event)"
        @rename-workspace="emit('rename-workspace', $event)"
        @delete-workspace="emit('delete-workspace', $event)"
        @copy-path="emit('copy-path', $event)"
      />
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
