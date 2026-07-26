<script setup lang="ts">
/**
 * ThreadRow —— 侧栏线程行(状态点 + 标题 + meta + ⋯ 菜单)
 * child = true 时渲染为子 agent 缩进行(prototype 的 .thread-child)。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { ThreadRowProps, ThreadRowEmits, ThreadStatus } from '../../../types/codex';
import { threadMetaOf } from './threadStatus';
import CodexIcon from '../layout/CodexIcon.vue';

const props = withDefaults(defineProps<ThreadRowProps & { child?: boolean }>(), { child: false });
const emit = defineEmits<ThreadRowEmits & {
  (e: 'archive', id: string): void;
  (e: 'rename', id: string): void;
  (e: 'export', id: string): void;
  (e: 'copy-id', id: string): void;
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

function toggleMenu(e: MouseEvent) {
  e.stopPropagation();
  menuOpen.value = !menuOpen.value;
}

function onDocClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (!target?.closest('.thread-row-wrap')) menuOpen.value = false;
}

function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && menuOpen.value) {
    e.stopPropagation();
    menuOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onDocKeydown);
});
onUnmounted(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onDocKeydown);
});

function onArchive() {
  menuOpen.value = false;
  emit('archive', props.session.id);
}
function onRename() {
  menuOpen.value = false;
  emit('rename', props.session.id);
}
function onExport() {
  menuOpen.value = false;
  emit('export', props.session.id);
}
function onCopyId() {
  menuOpen.value = false;
  emit('copy-id', props.session.id);
}
</script>

<template>
  <div class="thread-row-wrap" :class="{ active: props.active, 'thread-child': props.child, 'menu-open': menuOpen }">
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
    <div v-if="menuOpen" class="ws-menu thread-menu open" @click.stop>
      <button class="menu-item" @click="onRename">
        <CodexIcon name="pencil" />
        <span class="mi-label">重命名任务</span>
      </button>
      <button class="menu-item" @click="onExport">
        <CodexIcon name="download" />
        <span class="mi-label">导出对话</span>
      </button>
      <button class="menu-item" @click="onCopyId">
        <CodexIcon name="copy" />
        <span class="mi-label">复制会话 ID</span>
      </button>
      <div class="menu-sep"></div>
      <button class="menu-item" @click="onArchive">
        <CodexIcon name="archive" />
        <span class="mi-label">归档任务</span>
      </button>
    </div>
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

/* 行内菜单定位:与 ws-menu 同样式,但锚定到行右侧 */
.thread-menu {
  position: absolute;
  top: 26px;
  right: 0;
  z-index: 70;
  min-width: 160px;
}
</style>
