<script setup lang="ts">
/**
 * ThreadRow —— 侧栏线程行(状态点 + 标题 + meta + ⋯ 菜单)
 * child = true 时渲染为子 agent 缩进行(prototype 的 .thread-child)。
 */
import { computed, ref } from 'vue';
import type { ThreadRowProps, ThreadRowEmits, ThreadStatus } from '../../../types/codex';
import type { ContextMenuItem } from '../../../lib/contextMenu';
import { threadMetaOf } from './threadStatus';
import CodexIcon from '../layout/CodexIcon.vue';
import ContextMenu from '../layout/ContextMenu.vue';

const props = withDefaults(defineProps<ThreadRowProps & { child?: boolean }>(), { child: false });
const emit = defineEmits<ThreadRowEmits & {
  (e: 'archive', id: string): void;
  (e: 'rename', id: string): void;
  (e: 'export', id: string): void;
  (e: 'copy-id', id: string): void;
  (e: 'fork', id: string): void;
}>();

const DOT: Record<ThreadStatus, string> = {
  running: 'dot dot-running',
  needs_input: 'dot dot-waiting',
  done: 'dot dot-done',
  failed: 'dot dot-error',
  idle: 'dot',
};
const dotClass = computed(() => DOT[props.status]);
const meta = computed(() => threadMetaOf(props.session));

// ---------------------------------------------------------------------------
// Kebab menu —— 行内归档/重命名/导出/复制 ID
// ---------------------------------------------------------------------------
const menuOpen = ref(false);
const menuPos = ref({ x: 0, y: 0 });
const menuItems = computed<ContextMenuItem[]>(() => [
  ...(!props.active ? [{ id: 'open', label: '打开任务', icon: 'external' }] : []),
  { id: 'pin', label: props.pinned ? '取消置顶' : '置顶任务', icon: 'pin' },
  { id: 'rename', label: '重命名任务', icon: 'pencil' },
  { id: 'fork', label: '分叉任务', icon: 'git-branch', separatorBefore: true },
  { id: 'export', label: '导出对话', icon: 'download' },
  { id: 'copy-id', label: '复制会话 ID', icon: 'copy' },
  { id: 'archive', label: '归档任务', icon: 'archive', danger: true, separatorBefore: true },
]);

function toggleMenu(e: MouseEvent) {
  e.stopPropagation();
  if (menuOpen.value) {
    menuOpen.value = false;
    return;
  }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  menuPos.value = { x: rect.right, y: rect.bottom + 4 };
  menuOpen.value = true;
}

function openContextMenu(e: MouseEvent): void {
  menuPos.value = { x: e.clientX, y: e.clientY };
  menuOpen.value = true;
}

function onMenuSelect(id: string): void {
  menuOpen.value = false;
  if (id === 'open') emit('select');
  else if (id === 'pin') emit('toggle-pin');
  else if (id === 'rename') emit('rename', props.session.id);
  else if (id === 'fork') emit('fork', props.session.id);
  else if (id === 'export') emit('export', props.session.id);
  else if (id === 'copy-id') emit('copy-id', props.session.id);
  else if (id === 'archive') emit('archive', props.session.id);
}
</script>

<template>
  <div
    class="thread-row-wrap"
    :class="{ active: props.active, 'thread-child': props.child, 'menu-open': menuOpen }"
    @contextmenu.prevent.stop="openContextMenu"
  >
    <button
      type="button"
      class="thread-row"
      @click="emit('select')"
    >
      <span :class="dotClass"></span>
      <span class="thread-title">{{ props.session.title }}</span>
      <span class="thread-meta">{{ meta }}</span>
    </button>
    <button
      type="button"
      class="thread-kebab"
      :class="{ open: menuOpen }"
      title="更多"
      @click="toggleMenu"
    >
      <CodexIcon name="more" />
    </button>
    <ContextMenu
      :open="menuOpen"
      :x="menuPos.x"
      :y="menuPos.y"
      :items="menuItems"
      aria-label="任务操作"
      @select="onMenuSelect"
      @close="menuOpen = false"
    />
  </div>
</template>

<style scoped>
/* div → button 的 UA 样式 reset:类名未动,布局/配色仍由 sidebar.css 的 .thread-row 承担 */
.thread-row-wrap {
  position: relative;
  border-radius: var(--r-md);
}
.thread-row {
  border: none;
  background: none;
  font-family: inherit;
  font-size: inherit;
  text-align: left;
}
.thread-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }

/* 行内 ⋯ 菜单按钮:默认隐藏,hover / 菜单打开时显示 */
.thread-kebab {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-3);
  opacity: 0;
  transition: opacity var(--dur-1), background var(--dur-1), color var(--dur-1);
}
.thread-kebab .ic { width: 14px; height: 14px; }
.thread-row-wrap:hover .thread-kebab,
.thread-row-wrap.menu-open .thread-kebab { opacity: 1; }
.thread-kebab:hover { background: var(--hover); color: var(--text); }

</style>
