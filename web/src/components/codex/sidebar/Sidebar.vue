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
import { sessionToThreadStatus } from './threadStatus';

const props = defineProps<SidebarProps & { pinnedIds?: string[] }>();
const emit = defineEmits<SidebarEmits & { (e: 'open-settings'): void }>();

/** 工作区排序模式(每组独立,组件内 UI 状态;轮次 3 可挪 daemon 持久化) */
const sortModes = ref<Record<string, WorkspaceSortMode>>({});
function sortOf(name: string): WorkspaceSortMode {
  return sortModes.value[name] ?? 'recent';
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

function sessionsOf(wsName: string): Session[] {
  return filteredSessions.value.filter((s) => (s.workspaceName ?? '') === wsName);
}
</script>

<template>
  <aside class="app-sidebar">
    <div class="sidebar-brand">
      <span class="brand-logo">K</span>
      <span class="brand-name">Kimi Code</span>
      <button class="icon-btn brand-collapse" title="折叠侧栏" @click="emit('collapse')">
        <CodexIcon name="panel-left" />
      </button>
    </div>

    <div class="sidebar-new">
      <button class="new-task" @click="emit('new-task')">
        <CodexIcon name="plus" />
        新建任务
      </button>
    </div>

    <div class="sidebar-search">
      <div class="search-box">
        <CodexIcon name="search" />
        <span>搜索线程</span>
        <span class="kbd">⌘K</span>
      </div>
    </div>

    <StatusFilter :filter="props.filter" @set-filter="(f) => emit('set-filter', f)" />

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
          />
        </div>
      </section>

      <WorkspaceGroup
        v-for="ws in props.workspaces"
        :key="(ws as unknown as { id?: string }).id ?? ws.name"
        :workspace="ws"
        :sessions="sessionsOf(ws.name)"
        :current-session-id="props.currentSessionId"
        :sort-mode="sortOf(ws.name)"
        :pinned-ids="props.pinnedIds"
        @select-session="(id) => emit('select-session', id)"
        @toggle-pin="(id) => emit('toggle-pin', id)"
        @set-sort="(m) => (sortModes[ws.name] = m)"
      />
    </div>

    <div class="sidebar-footer">
      <a class="footer-link" href="#" @click.prevent="emit('open-settings')">
        <CodexIcon name="settings" />
        设置
      </a>
    </div>
  </aside>
</template>
