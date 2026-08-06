<script setup lang="ts">
/**
 * WorkspaceGroup —— 侧栏工作区分组(折叠 + ⋯ 菜单 + 排序)
 *
 * 交互(组件内行为,kimi3 域):
 * - ws-toggle 折叠分组(.ws-closed)
 * - ⋯ 打开菜单(点外部 / Esc 关闭),排序项单选勾选,emit set-sort
 * - 菜单其余项(重命名/复制路径/归档)原型期占位,不 emit
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { WorkspaceGroupProps, WorkspaceSortMode } from '../../../types/codex';
import CodexIcon from '../layout/CodexIcon.vue';
import ThreadRow from './ThreadRow.vue';
import { sessionToThreadStatus } from './threadStatus';

const props = defineProps<WorkspaceGroupProps & {
  pinnedIds?: string[];
  activeWorkspace?: boolean;
  trusted?: boolean | null;
  trustBusy?: boolean;
  dragging?: boolean;
}>();
const emit = defineEmits<{
  (e: 'select-session', id: string): void;
  (e: 'toggle-pin', id: string): void;
  (e: 'archive-session', id: string): void;
  (e: 'rename-session', id: string): void;
  (e: 'export-session', id: string): void;
  (e: 'copy-session-id', id: string): void;
  (e: 'fork-session', id: string): void;
  (e: 'set-sort', mode: WorkspaceSortMode): void;
  (e: 'select-workspace', id: string): void;
  (e: 'rename-workspace', id: string): void;
  (e: 'delete-workspace', id: string): void;
  (e: 'copy-path', root: string): void;
  (e: 'toggle-workspace-pin', id: string): void;
  (e: 'edit-workspace-emoji', id: string): void;
  (e: 'inspect-trust', id: string): void;
  (e: 'set-trust', id: string, trusted: boolean): void;
  (e: 'drag-start', event: DragEvent, id: string): void;
  (e: 'drag-over', event: DragEvent, id: string): void;
  (e: 'drop', event: DragEvent, id: string): void;
  (e: 'drag-end'): void;
}>();

const SORTS: { id: WorkspaceSortMode; label: string }[] = [
  { id: 'recent', label: '最近编辑' },
  { id: 'manual', label: '手动排序' },
  { id: 'created', label: '最早编辑' },
];

const closed = ref(false);
const menuOpen = ref(false);
const emptyWorkspace = computed(() => props.workspace.sessionCount === 0);
const workspaceName = computed(
  () => props.workspace.name.trim() || props.workspace.root || props.workspace.id || '未命名工作区',
);

const sortedSessions = computed(() => {
  const list = [...props.sessions];
  if (props.sortMode === 'recent') {
    list.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  } else if (props.sortMode === 'created') {
    list.sort((a, b) => (a.updatedAt ?? '').localeCompare(b.updatedAt ?? ''));
  }
  return list;
});

function pickSort(m: WorkspaceSortMode) {
  emit('set-sort', m);
  menuOpen.value = false;
}

function toggleMenu(): void {
  menuOpen.value = !menuOpen.value;
  if (menuOpen.value) emit('inspect-trust', props.workspace.id);
}

function onDocClick(e: MouseEvent) {
  if (!(e.target as HTMLElement | null)?.closest('.workspace-header')) menuOpen.value = false;
}
onMounted(() => document.addEventListener('click', onDocClick));
onUnmounted(() => document.removeEventListener('click', onDocClick));
</script>

<template>
  <section
    class="workspace-group"
    :class="{ 'ws-closed': closed, 'workspace-group--dragging': props.dragging }"
    draggable="true"
    @dragstart="emit('drag-start', $event, props.workspace.id)"
    @dragover="emit('drag-over', $event, props.workspace.id)"
    @drop="emit('drop', $event, props.workspace.id)"
    @dragend="emit('drag-end')"
  >
    <div class="workspace-header" :class="{ 'menu-open': menuOpen }">
      <button class="ws-toggle" :title="closed ? '展开分组' : '折叠分组'" @click="closed = !closed">
        <CodexIcon name="chevron-down" />
      </button>
      <button
        class="ws-name"
        :class="{ 'ws-active': props.activeWorkspace }"
        :title="props.activeWorkspace ? '活跃工作区' : '设为活跃工作区'"
        @click.stop="emit('select-workspace', props.workspace.id)"
      >
        <span v-if="props.workspace.emoji" class="ws-emoji">{{ props.workspace.emoji }}</span>
        {{ workspaceName }}
        <span v-if="props.workspace.pinned" class="ws-pinned" title="已置顶"><CodexIcon name="pin" /></span>
      </button>
      <button class="ws-action" title="更多" @click.stop="toggleMenu">
        <CodexIcon name="more" />
      </button>
      <div class="ws-menu" :class="{ open: menuOpen }">
        <div class="menu-label">排序方式</div>
        <button
          v-for="s in SORTS"
          :key="s.id"
          class="menu-item"
          :class="{ active: props.sortMode === s.id }"
          @click.stop="pickSort(s.id)"
        >
          <CodexIcon name="check" class="menu-check" />
          <span class="mi-label">{{ s.label }}</span>
        </button>
        <div class="menu-sep"></div>
        <button class="menu-item" @click.stop="emit('rename-workspace', props.workspace.id); menuOpen = false"><span class="mi-label">重命名工作区</span></button>
        <button class="menu-item" @click.stop="emit('edit-workspace-emoji', props.workspace.id); menuOpen = false"><span class="mi-label">{{ props.workspace.emoji ? '更改工作区图标' : '设置工作区图标' }}</span></button>
        <button class="menu-item" @click.stop="emit('toggle-workspace-pin', props.workspace.id); menuOpen = false"><span class="mi-label">{{ props.workspace.pinned ? '取消置顶工作区' : '置顶工作区' }}</span></button>
        <button class="menu-item" @click.stop="emit('copy-path', props.workspace.root); menuOpen = false"><span class="mi-label">复制路径</span></button>
        <button
          class="menu-item"
          :disabled="props.trustBusy || props.trusted == null"
          @click.stop="emit('set-trust', props.workspace.id, !props.trusted); menuOpen = false"
        >
          <span class="mi-label">{{ props.trustBusy ? '正在读取信任状态…' : (props.trusted === null ? '重新添加后可设置信任' : (props.trusted ? '取消信任工作区' : '信任工作区')) }}</span>
        </button>
        <div class="menu-sep"></div>
        <button class="menu-item" @click.stop="emit('delete-workspace', props.workspace.id); menuOpen = false"><span class="mi-label">{{ emptyWorkspace ? '移除空工作区' : '移除工作区' }}</span></button>
      </div>
    </div>
    <div class="ws-threads">
      <ThreadRow
        v-for="s in sortedSessions"
        :key="s.id"
        :session="s"
        :active="s.id === props.currentSessionId"
        :status="sessionToThreadStatus(s)"
        :pinned="props.pinnedIds?.includes(s.id) ?? false"
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
</template>

<style scoped>
.ws-name {
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
}
.ws-name:hover {
  color: var(--text);
}
.ws-name.ws-active {
  color: var(--accent);
}
.workspace-group--dragging { opacity: .48; }
.workspace-group[draggable="true"] > .workspace-header { cursor: grab; }
.workspace-group[draggable="true"] > .workspace-header:active { cursor: grabbing; }
.ws-emoji { margin-right: 5px; }
.ws-pinned { display: inline-grid; margin-left: 5px; color: var(--text-3); vertical-align: -2px; }
.ws-pinned .ic { width: 12px; height: 12px; }
</style>
