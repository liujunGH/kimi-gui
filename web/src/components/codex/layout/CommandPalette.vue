<script setup lang="ts">
/**
 * CommandPalette —— ⌘K 命令面板(命令 + 会话双区,替代纯会话搜索弹层)
 *
 * - 输入过滤:命令按 label 模糊;会话按标题、最近提问和工作区搜索
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
  lastPrompt?: string;
  workspaceName?: string;
}

const props = withDefaults(defineProps<{
  actions: PaletteAction[];
  sessions: PaletteSession[];
  searchLoading?: boolean;
  searchHint?: string;
}>(), { searchLoading: false, searchHint: '' });
const emit = defineEmits<{
  (e: 'select-action', id: string): void;
  (e: 'select-session', id: string): void;
  (e: 'query', value: string): void;
  (e: 'close'): void;
}>();

const query = ref('');
const mode = ref<'sessions' | 'commands'>('sessions');
const inputEl = ref<HTMLInputElement | null>(null);
const cursor = ref(0);

const q = computed(() => query.value.trim().toLowerCase());
const filteredActions = computed(() =>
  q.value ? props.actions.filter((a) => a.label.toLowerCase().includes(q.value)) : props.actions,
);
const filteredSessions = computed(() => {
  const list = q.value
    ? props.sessions.filter((s) =>
        [s.title, s.lastPrompt, s.workspaceName, s.meta]
          .some((value) => value?.toLowerCase().includes(q.value)),
      )
    : props.sessions;
  return list.slice(0, 50);
});
const visibleActions = computed(() => mode.value === 'commands' ? filteredActions.value : []);
const visibleSessions = computed(() => mode.value === 'sessions' ? filteredSessions.value : []);

interface Row {
  kind: 'action' | 'session';
  id: string;
}
const rows = computed<Row[]>(() => [
  ...visibleActions.value.map((a) => ({ kind: 'action' as const, id: a.id })),
  ...visibleSessions.value.map((s) => ({ kind: 'session' as const, id: s.id })),
]);
watch(rows, () => {
  cursor.value = 0;
});
watch([query, mode], ([value, currentMode]) => emit('query', currentMode === 'sessions' ? value : ''));

function selectMode(value: 'sessions' | 'commands'): void {
  mode.value = value;
  cursor.value = 0;
  void nextTick(() => inputEl.value?.focus());
}

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
          :placeholder="mode === 'sessions' ? '搜索会话…' : '搜索命令…'"
          @keydown="onKeydown"
        />
        <span class="kbd">Esc</span>
      </div>
      <div class="cp-tabs" role="tablist" aria-label="命令面板内容">
        <button type="button" role="tab" :aria-selected="mode === 'sessions'" :class="{ active: mode === 'sessions' }" @click="selectMode('sessions')">
          会话
        </button>
        <button type="button" role="tab" :aria-selected="mode === 'commands'" :class="{ active: mode === 'commands' }" @click="selectMode('commands')">
          命令
        </button>
      </div>
      <div v-if="rows.length" class="cp-list">
        <template v-if="visibleActions.length">
          <div class="cp-label">命令</div>
          <button
            v-for="(a, i) in visibleActions"
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
        <div v-if="mode === 'sessions' && q && !visibleSessions.length" class="cp-search-state-row">
          {{ props.searchLoading ? '正在搜索全部历史…' : (props.searchHint || '没有匹配的会话') }}
        </div>
        <template v-if="visibleSessions.length">
          <div class="cp-label cp-session-label">
            <span>会话</span>
            <span v-if="props.searchLoading" class="cp-search-state">搜索全部历史中…</span>
            <span v-else-if="props.searchHint" class="cp-search-state">{{ props.searchHint }}</span>
          </div>
          <button
            v-for="(s, j) in visibleSessions"
            :key="s.id"
            type="button"
            class="cp-item"
            :class="{ active: cursor === j }"
            @click="exec({ kind: 'session', id: s.id })"
            @mousemove="cursor = j"
          >
            <span class="mi-ic"><CodexIcon name="list" /></span>
            <span class="cp-session-text">
              <span class="cp-text">{{ s.title }}</span>
              <span v-if="s.lastPrompt" class="cp-snippet">{{ s.lastPrompt }}</span>
            </span>
            <span v-if="s.meta" class="cp-meta">{{ s.meta }}</span>
          </button>
        </template>
      </div>
      <div v-else-if="props.searchLoading" class="cp-empty">正在搜索全部历史…</div>
      <div v-else class="cp-empty">{{ props.searchHint || '无匹配结果' }}</div>
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
.cp-tabs {
  flex: none;
  display: flex;
  gap: 4px;
  padding: 6px 8px 0;
  border-bottom: 1px solid var(--border-soft);
}
.cp-tabs button {
  min-width: 64px;
  padding: 7px 10px 8px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-3);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
}
.cp-tabs button:hover { color: var(--text-2); }
.cp-tabs button.active { border-bottom-color: var(--accent); color: var(--text); font-weight: var(--weight-semibold); }
.cp-tabs button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
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
.cp-session-label { display: flex; justify-content: space-between; gap: 12px; }
.cp-search-state {
  max-width: 70%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-weight: 500; letter-spacing: 0; text-transform: none;
}
.cp-search-state-row {
  padding: 12px 8px;
  color: var(--text-3);
  font-size: var(--text-sm);
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
  min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.cp-session-text {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 2px;
}
.cp-snippet {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 11px; color: var(--text-3);
}
.cp-meta { flex: none; font-size: 11px; color: var(--text-3); }
.cp-empty {
  padding: 28px 0;
  text-align: center;
  font-size: var(--text-sm);
  color: var(--text-3);
}
</style>
