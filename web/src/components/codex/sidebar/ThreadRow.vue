<script setup lang="ts">
/**
 * ThreadRow —— 侧栏线程行(状态点 + 标题 + meta)
 * child = true 时渲染为子 agent 缩进行(prototype 的 .thread-child)。
 */
import { computed } from 'vue';
import type { ThreadRowProps, ThreadRowEmits, ThreadStatus } from '../../../types/codex';
import { threadMetaOf } from './threadStatus';

const props = withDefaults(defineProps<ThreadRowProps & { child?: boolean }>(), { child: false });
const emit = defineEmits<ThreadRowEmits>();

const DOT: Record<ThreadStatus, string> = {
  running: 'dot dot-running',
  needs_input: 'dot dot-waiting',
  done: 'dot dot-done',
  failed: 'dot dot-error',
  idle: 'dot',
};
const dotClass = computed(() => DOT[props.status]);
const meta = computed(() => threadMetaOf(props.session));
</script>

<template>
  <button
    type="button"
    class="thread-row"
    :class="{ active: props.active, 'thread-child': props.child }"
    @click="emit('select')"
  >
    <span :class="dotClass"></span>
    <span class="thread-title">{{ props.session.title }}</span>
    <span class="thread-meta">{{ meta }}</span>
  </button>
</template>

<style scoped>
/* div → button 的 UA 样式 reset:类名未动,布局/配色仍由 sidebar.css 的 .thread-row 承担 */
.thread-row {
  border: none;
  background: none;
  font-family: inherit;
  font-size: inherit;
  text-align: left;
}
.thread-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
</style>
