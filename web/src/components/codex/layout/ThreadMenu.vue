<script setup lang="ts">
/**
 * ThreadMenu —— 工具栏标题 ⋯ 任务菜单(样式在 base.css 的 .thread-menu)
 *
 * 所有菜单项都有真实 emit(轮次 4e 补全):
 * - pin / rename / archive / open-side-task / copy / fork / export / new-window
 */
import { onMounted, onUnmounted, ref } from 'vue';
import CodexIcon from './CodexIcon.vue';

const emit = defineEmits<{
  (e: 'pin'): void;
  (e: 'rename'): void;
  (e: 'archive'): void;
  (e: 'open-side-task'): void;
  (e: 'copy'): void;
  (e: 'fork'): void;
  (e: 'export'): void;
}>();

interface MenuEntry {
  kind: 'item' | 'sep';
  icon?: string;
  label?: string;
  kbd?: string;
  action?: 'pin' | 'rename' | 'archive' | 'open-side-task' | 'copy' | 'fork' | 'export';
  sub?: boolean;
}

const ENTRIES: MenuEntry[] = [
  { kind: 'item', icon: 'pin', label: '置顶任务', kbd: '⌥⌘P', action: 'pin' },
  { kind: 'item', icon: 'pencil', label: '重命名任务', kbd: '⌥⌘R', action: 'rename' },
  { kind: 'item', icon: 'archive', label: '归档任务', kbd: '⇧⌘A', action: 'archive' },
  { kind: 'sep' },
  { kind: 'item', icon: 'panel-side', label: '打开侧边任务', kbd: '⌥⌘S', action: 'open-side-task' },
  { kind: 'sep' },
  { kind: 'item', icon: 'copy', label: '复制', action: 'copy' },
  { kind: 'item', icon: 'git-branch', label: '分叉会话', action: 'fork' },
  { kind: 'item', icon: 'download', label: '导出对话', action: 'export' },
];

const open = ref(false);

function onItem(entry: MenuEntry) {
  if (entry.action) emit(entry.action as any);
  open.value = false;
}

function onDocClick(e: MouseEvent) {
  if (!(e.target as HTMLElement | null)?.closest('.thread-menu')) open.value = false;
}
function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) open.value = false;
}
onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onDocKeydown);
});
onUnmounted(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onDocKeydown);
});
</script>

<template>
  <button class="icon-btn title-more" title="任务菜单" @click.stop="open = !open">
    <CodexIcon name="more" />
  </button>
  <div class="thread-menu" :class="{ open }">
    <template v-for="(entry, i) in ENTRIES" :key="i">
      <div v-if="entry.kind === 'sep'" class="menu-sep"></div>
      <button v-else class="menu-item" @click="onItem(entry)">
        <span class="mi-ic"><CodexIcon :name="entry.icon!" /></span>
        <span class="mi-label">{{ entry.label }}</span>
        <span v-if="entry.kbd" class="mi-kbd"><span class="kbd">{{ entry.kbd }}</span></span>
      </button>
    </template>
  </div>
</template>
