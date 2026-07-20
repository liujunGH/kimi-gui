<script setup lang="ts">
/**
 * QueuePanel —— 队列指示器 + 队列面板
 *
 * 行为:
 * - 指示器开合面板;条数空时自动收起并隐藏
 * - 条操作:引导(转插话)/ 编辑 / 删除,经 emit 上抛
 * - 拖拽重排:grip 拖动 → emit reorder(from, to)
 */
import { computed, ref, watch } from 'vue';
import type { QueuePanelProps, QueuePanelEmits } from '../../../types/codex';
import CodexIcon from '../layout/CodexIcon.vue';

const props = withDefaults(defineProps<QueuePanelProps & { defaultOpen?: boolean }>(), {
  defaultOpen: false,
});
const emit = defineEmits<QueuePanelEmits>();

const open = ref(props.defaultOpen);
const count = computed(() => props.queuedPrompts.length);
watch(count, (n) => {
  if (n === 0) open.value = false;
});

// ---------- 拖拽重排 ----------
const dragIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);

function onDragStart(e: DragEvent, index: number) {
  dragIndex.value = index;
  e.dataTransfer?.setData('text/plain', String(index));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}

function onDragOver(e: DragEvent, index: number) {
  e.preventDefault();
  dragOverIndex.value = index;
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
}

function onDrop(e: DragEvent, index: number) {
  e.preventDefault();
  const from = dragIndex.value;
  dragIndex.value = null;
  dragOverIndex.value = null;
  if (from === null || from === index) return;
  emit('reorder', from, index);
}

function onDragEnd() {
  dragIndex.value = null;
  dragOverIndex.value = null;
}
</script>

<template>
  <template v-if="count">
    <button
      type="button"
      class="queue-indicator"
      :class="{ open }"
      title="查看队列"
      :aria-expanded="open"
      @click="open = !open"
    >
      <CodexIcon name="list" />
      <span class="qi-count">{{ count }} 条</span>排队中
      <span class="qi-chevron"><CodexIcon name="chevron-down" /></span>
    </button>

    <div class="queue-panel" :class="{ open }">
      <div class="qp-head">
        消息队列
        <span class="qp-hint">{{ count }} 条 · 拖拽重排</span>
      </div>
      <div
        v-for="(q, i) in props.queuedPrompts"
        :key="q.id"
        class="qp-row"
        :class="{
          dragging: dragIndex === i,
          'drag-over': dragOverIndex === i && dragIndex !== i,
        }"
        draggable="true"
        @dragstart="(e) => onDragStart(e, i)"
        @dragover="(e) => onDragOver(e, i)"
        @drop="(e) => onDrop(e, i)"
        @dragend="onDragEnd"
      >
        <span class="qp-grip" title="拖拽重排"><CodexIcon name="grip" /></span>
        <span class="qp-num">{{ i + 1 }}</span>
        <span class="qp-text">{{ q.text }}</span>
        <span class="qp-actions">
          <button
            class="qp-steer"
            title="转为引导:合并全部排队消息,立即插话到当前轮(TUI 对等行为)"
            @click="emit('promote-to-steer', q.id)"
          >
            <CodexIcon name="reply" />
            引导
          </button>
          <button class="icon-btn" title="编辑" @click="emit('edit', q.id)">
            <CodexIcon name="pencil" size="sm" />
          </button>
          <button class="icon-btn" title="删除" @click="emit('remove', q.id)">
            <CodexIcon name="trash" size="sm" />
          </button>
        </span>
      </div>
    </div>
  </template>
</template>

<style scoped>
/* div → button 的 UA 样式 reset:类名未动,布局/配色仍由 composer.css 的 .queue-indicator 承担 */
.queue-indicator {
  border: none;
  background: none;
  font-family: inherit;
}
.queue-indicator:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
</style>
