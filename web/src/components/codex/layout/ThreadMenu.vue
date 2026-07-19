<script setup lang="ts">
/**
 * ThreadMenu —— 工具栏标题 ⋯ 任务菜单(样式在 base.css 的 .thread-menu)
 *
 * 用法:父组件把本组件放进 .app-toolbar 标题旁;组件自身渲染 ⋯ 按钮 + 菜单
 * (菜单相对 .app-toolbar 绝对定位,对齐原型 shared.js bindThreadChrome)。
 *
 * 行为(组件内):
 * - ⋯ 点击开关;点外部 / Esc 关闭(document 监听在 onUnmounted 移除)
 * - 置顶任务 / 打开侧边任务 emit;其余项原型占位,点击仅关菜单
 */
import { onMounted, onUnmounted, ref } from 'vue';
import CodexIcon from './CodexIcon.vue';

const emit = defineEmits<{
  (e: 'pin'): void;
  (e: 'open-side-task'): void;
}>();

interface MenuEntry {
  kind: 'item' | 'sep';
  icon?: string;
  label?: string;
  kbd?: string;
  /** 'pin' | 'open-side-task' 有真实 emit;undefined = 占位(仅关菜单) */
  action?: 'pin' | 'open-side-task';
  /** 右侧 ›(二级菜单占位) */
  sub?: boolean;
}

const ENTRIES: MenuEntry[] = [
  { kind: 'item', icon: 'pin', label: '置顶任务', kbd: '⌥⌘P', action: 'pin' },
  { kind: 'item', icon: 'pencil', label: '重命名任务', kbd: '⌥⌘R' },
  { kind: 'item', icon: 'archive', label: '归档任务', kbd: '⇧⌘A' },
  { kind: 'sep' },
  { kind: 'item', icon: 'panel-side', label: '打开侧边任务', kbd: '⌥⌘S', action: 'open-side-task' },
  { kind: 'sep' },
  { kind: 'item', icon: 'copy', label: '复制', sub: true },
  { kind: 'item', icon: 'play', label: '在…中继续', sub: true },
  { kind: 'item', icon: 'clock', label: '添加计划任务…' },
  { kind: 'sep' },
  { kind: 'item', icon: 'external', label: '在新窗口中打开' },
];

const open = ref(false);

function onItem(entry: MenuEntry) {
  if (entry.action === 'pin') emit('pin');
  else if (entry.action === 'open-side-task') emit('open-side-task');
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
        <span v-else-if="entry.sub" class="mi-kbd"><CodexIcon name="chevron-right" /></span>
      </button>
    </template>
  </div>
</template>
