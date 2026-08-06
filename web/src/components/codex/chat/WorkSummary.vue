<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { IndexedWorkBlock } from '../../../lib/workSummary';
import { workStats } from '../../../lib/workSummary';
import CodexIcon from '../layout/CodexIcon.vue';
import ThinkingBlock from './ThinkingBlock.vue';
import ToolCallCard from './ToolCallCard.vue';

const props = withDefaults(defineProps<{
  entries: IndexedWorkBlock[];
  running?: boolean;
  durationMs?: number;
  globalThinking?: boolean;
  streamingThinkingSourceIndex?: number;
}>(), {
  running: false,
  durationMs: undefined,
  globalThinking: false,
  streamingThinkingSourceIndex: -1,
});

const emit = defineEmits<{ (e: 'inspect', tab: 'thinking' | 'tools'): void }>();
const stats = computed(() => workStats(props.entries));
const hasError = computed(() => stats.value.errors > 0);

// Live work and failures deserve attention. Completed historical work starts
// quiet; its expensive Markdown/diff/output children mount only after expand.
const open = ref(props.running || hasError.value);
watch(hasError, (value) => {
  if (value) open.value = true;
});
watch(() => props.running, (value) => {
  if (value) open.value = true;
});

const durationLabel = computed(() => {
  if (!props.durationMs) return '';
  const seconds = Math.max(1, Math.round(props.durationMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
});

const title = computed(() => {
  if (props.running || stats.value.running > 0) return '正在工作';
  if (hasError.value) return durationLabel.value ? `工作 ${durationLabel.value}` : '工作出现错误';
  return durationLabel.value ? `已工作 ${durationLabel.value}` : '已完成工作';
});

const detail = computed(() => {
  const parts: string[] = [];
  if (stats.value.tools) parts.push(`${stats.value.tools} 个工具`);
  if (stats.value.thinking) parts.push(`${stats.value.thinking} 段思考`);
  if (stats.value.errors) parts.push(`${stats.value.errors} 个错误`);
  return parts.join(' · ');
});
</script>

<template>
  <section class="work-summary" :class="{ open, error: hasError, running: props.running }">
    <button
      type="button"
      class="work-summary-head"
      :aria-expanded="open"
      :aria-label="`${title}${detail ? `，${detail}` : ''}`"
      @click="open = !open"
    >
      <span class="work-state" aria-hidden="true">
        <span v-if="props.running" class="work-pulse"></span>
        <CodexIcon v-else :name="hasError ? 'x' : 'check'" />
      </span>
      <span class="work-title">{{ title }}</span>
      <span v-if="detail" class="work-detail">{{ detail }}</span>
      <CodexIcon name="chevron-down" class="work-chevron" />
    </button>

    <div v-if="open" class="work-summary-body">
      <template v-for="entry in props.entries" :key="`${entry.block.kind}-${entry.sourceIndex}`">
        <ThinkingBlock
          v-if="entry.block.kind === 'thinking'"
          :text="entry.block.thinking"
          :streaming="props.running && entry.sourceIndex === props.streamingThinkingSourceIndex"
          :global-show="props.globalThinking"
          @inspect="emit('inspect', 'thinking')"
        />
        <ToolCallCard
          v-else
          :call="entry.block.tool"
          @inspect="emit('inspect', 'tools')"
        />
      </template>
    </div>
  </section>
</template>

<style scoped>
.work-summary {
  margin: 8px 0 12px;
  border-left: 2px solid var(--border-soft);
  padding-left: 10px;
}
.work-summary.running { border-left-color: color-mix(in srgb, var(--accent) 55%, var(--border-soft)); }
.work-summary.error { border-left-color: color-mix(in srgb, var(--danger) 60%, var(--border-soft)); }
.work-summary-head {
  width: 100%;
  min-height: 30px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 3px 6px;
  border: 0;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text-2);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.work-summary-head:hover { background: var(--bg-hover); color: var(--text); }
.work-summary-head:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.work-state {
  width: 16px;
  height: 16px;
  flex: none;
  display: grid;
  place-items: center;
  color: var(--success);
}
.error .work-state { color: var(--danger); }
.work-state :deep(.ic) { width: 13px; height: 13px; }
.work-pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 14%, transparent);
  animation: work-pulse 1.4s ease-in-out infinite;
}
.work-title { font-size: var(--text-sm); font-weight: var(--weight-semibold); }
.work-detail {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-xs);
  color: var(--text-3);
}
.work-chevron {
  width: 13px;
  height: 13px;
  margin-left: auto;
  flex: none;
  color: var(--text-3);
  transform: rotate(-90deg);
  transition: transform var(--dur-1) var(--ease);
}
.open .work-chevron { transform: none; }
.work-summary-body {
  display: grid;
  gap: 7px;
  padding: 6px 4px 2px 6px;
}
@keyframes work-pulse {
  0%, 100% { opacity: 0.55; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .work-pulse { animation: none; }
  .work-chevron { transition: none; }
}
</style>
