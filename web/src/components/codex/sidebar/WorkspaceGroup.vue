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

const props = defineProps<WorkspaceGroupProps & { pinnedIds?: string[] }>();
const emit = defineEmits<{
  (e: 'select-session', id: string): void;
  (e: 'toggle-pin', id: string): void;
  (e: 'set-sort', mode: WorkspaceSortMode): void;
}>();

const SORTS: { id: WorkspaceSortMode; label: string }[] = [
  { id: 'recent', label: '最近编辑' },
  { id: 'manual', label: '手动排序' },
  { id: 'created', label: '创建时间' },
];

const closed = ref(false);
const menuOpen = ref(false);

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

function onDocClick(e: MouseEvent) {
  if (!(e.target as HTMLElement | null)?.closest('.workspace-header')) menuOpen.value = false;
}
onMounted(() => document.addEventListener('click', onDocClick));
onUnmounted(() => document.removeEventListener('click', onDocClick));
</script>

<template>
  <section class="workspace-group" :class="{ 'ws-closed': closed }">
    <div class="workspace-header" :class="{ 'menu-open': menuOpen }">
      <button class="ws-toggle" :title="closed ? '展开分组' : '折叠分组'" @click="closed = !closed">
        <CodexIcon name="chevron-down" />
      </button>
      <span class="ws-name">{{ props.workspace.name }}</span>
      <button class="ws-action" title="更多" @click.stop="menuOpen = !menuOpen">
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
        <button class="menu-item"><span class="mi-label">重命名工作区</span></button>
        <button class="menu-item"><span class="mi-label">复制路径</span></button>
        <div class="menu-sep"></div>
        <button class="menu-item"><span class="mi-label">归档工作区…</span></button>
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
      />
    </div>
  </section>
</template>
