<script setup lang="ts">
/**
 * CommandPalette —— ⌘K 命令面板(命令 + 会话双区,替代纯会话搜索弹层)
 *
 * - 输入过滤:命令按 label 模糊;会话按 title(上限 8 条)
 * - ↑↓ 跨区移动光标(环形),Enter 执行;鼠标移动即选中
 * - Esc 关闭(stopPropagation,不触发全局 escClose 连关底层);点遮罩关闭;挂载自动聚焦
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import CodexIcon from './CodexIcon.vue';

export interface PaletteAction {
  id: string;
  label: string;
  icon: string;
  kbd?: string;
}
export interface PaletteSession {
  id: string;
  title: string;
  meta?: string;
}

const props = defineProps<{
  actions: PaletteAction[];
  sessions: PaletteSession[];
}>();
const emit = defineEmits<{
  (e: 'select-action', id: string): void;
  (e: 'select-session', id: string): void;
  (e: 'close'): void;
}>();

const query = ref('');
const inputEl = ref<HTMLInputElement | null>(null);
const cursor = ref(0);

const q = computed(() => query.value.trim().toLowerCase());
const filteredActions = computed(() =>
  q.value ? props.actions.filter((a) => a.label.toLowerCase().includes(q.value)) : props.actions,
);
const filteredSessions = computed(() => {
  const list = q.value
    ? props.sessions.filter((s) => s.title.toLowerCase().includes(q.value))
    : props.sessions;
  return list.slice(0, 8);
});

interface Row {
  kind: 'action' | 'session';
  id: string;
}
const rows = computed<Row[]>(() => [
  ...filteredActions.value.map((a) => ({ kind: 'action' as const, id: a.id })),
  ...filteredSessions.value.map((s) => ({ kind: 'session' as const, id: s.id })),
]);
watch(rows, () => {
  cursor.value = 0;
});

function exec(row: Row | undefined) {
  if (!row) return;
  if (row.kind === 'action') emit('select-action', row.id);
  else emit('select-session', row.id);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = rows.value.length;
    if (!n) return;
    cursor.value = (cursor.value + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
  } else if (e.key === 'Enter') {
    e.preventDefault();
    exec(rows.value[cursor.value]);
  } else if (e.key === 'Escape') {
    e.stopPropagation();
    emit('close');
  }
}
onMounted(() => void nextTick(() => inputEl.value?.focus()));
</script>

<template>
  <div class="cp-overlay" @click.self="emit('close')">
    <div class="command-palette" role="dialog" aria-label="命令面板">
      <div class="cp-input-row">
        <CodexIcon name="search" />
        <input
          ref="inputEl"
          v-model="query"
          class="cp-input"
          placeholder="输入命令或搜索会话…"
          @keydown="onKeydown"
        />
        <span class="kbd">Esc</span>
      </div>
      <div v-if="rows.length" class="cp-list">
        <template v-if="filteredActions.length">
          <div class="cp-label">命令</div>
          <button
            v-for="(a, i) in filteredActions"
            :key="a.id"
            type="button"
            class="cp-item"
            :class="{ active: cursor === i }"
            @click="exec({ kind: 'action', id: a.id })"
            @mousemove="cursor = i"
          >
            <span class="mi-ic"><CodexIcon :name="a.icon" /></span>
            <span class="cp-text">{{ a.label }}</span>
            <span v-if="a.kbd" class="kbd">{{ a.kbd }}</span>
          </button>
        </template>
        <template v-if="filteredSessions.length">
          <div class="cp-label">会话</div>
          <button
            v-for="(s, j) in filteredSessions"
            :key="s.id"
            type="button"
            class="cp-item"
            :class="{ active: cursor === filteredActions.length + j }"
            @click="exec({ kind: 'session', id: s.id })"
            @mousemove="cursor = filteredActions.length + j"
          >
            <span class="mi-ic"><CodexIcon name="list" /></span>
            <span class="cp-text">{{ s.title }}</span>
            <span v-if="s.meta" class="cp-meta">{{ s.meta }}</span>
          </button>
        </template>
      </div>
      <div v-else class="cp-empty">无匹配结果</div>
    </div>
  </div>
</template>

<style scoped>
.cp-overlay {
  position: fixed; inset: 0; z-index: 95;
  display: flex; justify-content: center; align-items: flex-start;
  padding-top: 18vh;
  background: rgba(20, 23, 28, 0.32);
}
.command-palette {
  width: 520px; max-width: 92vw;
  max-height: 60vh;
  display: flex; flex-direction: column;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.cp-input-row {
  flex: none;
  display: flex; align-items: center; gap: 9px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-soft);
  color: var(--text-3);
}
.cp-input-row .ic { width: 15px; height: 15px; flex: none; }
.cp-input {
  flex: 1; min-width: 0;
  border: none; outline: none; background: none;
  color: var(--text);
  font-size: var(--text-md);
}
.cp-input::placeholder { color: var(--text-3); }
.cp-list {
  flex: 1; min-height: 0;
  overflow-y: auto;
  padding: 6px;
}
.cp-label {
  padding: 8px 8px 5px;
  font-size: 10.5px; font-weight: 700;
  letter-spacing: 0.05em; text-transform: uppercase;
  color: var(--text-3);
}
.cp-item {
  display: flex; align-items: center; gap: 9px;
  width: 100%;
  padding: 8px;
  border: none; border-radius: var(--r-md);
  background: none;
  font: inherit; text-align: left;
  color: var(--text-2);
  cursor: pointer;
}
.cp-item.active { background: var(--accent-soft); color: var(--text); }
.cp-text {
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cp-meta { flex: none; font-size: 11px; color: var(--text-3); }
.cp-empty {
  padding: 28px 0;
  text-align: center;
  font-size: var(--text-sm);
  color: var(--text-3);
}
</style>
