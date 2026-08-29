<script setup lang="ts">
/**
 * QueuePanel —— 队列指示器 + 队列面板
 *
 * 行为:
 * - 指示器开合面板;条数空时自动收起并隐藏
 * - 整队操作:立即插话；条操作仅编辑 / 删除，避免把单条动作伪装成整队动作
 * - 拖拽或键盘按钮重排 → emit reorder(from, to)
 */
import { computed, ref, watch } from 'vue';
import type { QueuePanelProps, QueuePanelEmits, QueuedPrompt } from '../../../types/codex';
import CodexIcon from '../layout/CodexIcon.vue';

const props = withDefaults(defineProps<QueuePanelProps & { defaultOpen?: boolean }>(), {
  defaultOpen: false,
});
const emit = defineEmits<QueuePanelEmits>();

/** 契约 QueuedPrompt 之外,CodexApp 传入的条目还带附件计数(有附件时行内显示) */
type QueueRow = QueuedPrompt & { attachmentCount?: number };
const rows = computed<QueueRow[]>(() => props.queuedPrompts as QueueRow[]);

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
        <span class="qp-hint">{{ count }} 条 · 可拖拽或按键重排</span>
        <button
          type="button"
          class="qp-steer"
          title="合并全部排队消息，立即插话到当前轮"
          @click="emit('steer-all')"
        >
          <CodexIcon name="reply" />整队立即插话
        </button>
      </div>
      <div
        v-for="(q, i) in rows"
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
        <span
          v-if="q.attachmentCount"
          class="qp-att"
          :title="`该消息含 ${q.attachmentCount} 个附件,编辑后需重新添加`"
        >
          <CodexIcon name="paperclip" size="sm" />{{ q.attachmentCount }}
        </span>
        <span class="qp-actions">
          <button class="icon-btn qp-move" :disabled="i === 0" title="上移" :aria-label="`上移第 ${i + 1} 条消息`" @click="emit('reorder', i, i - 1)">
            <CodexIcon name="chevron-up" size="sm" />
          </button>
          <button class="icon-btn qp-move" :disabled="i === count - 1" title="下移" :aria-label="`下移第 ${i + 1} 条消息`" @click="emit('reorder', i, i + 1)">
            <CodexIcon name="chevron-down" size="sm" />
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
.qp-head .qp-hint { margin-left: auto; }
.qp-head .qp-steer { margin-left: 4px; }
.qp-actions .icon-btn:disabled { opacity: 0.35; cursor: default; }
.qp-row .qp-actions .qp-move { opacity: 0.6; }
.qp-row .qp-actions .qp-move:hover,
.qp-row .qp-actions .qp-move:focus-visible { opacity: 1; }
/* 行内附件计数(仅布局微调,配色仍走 token) */
.qp-att { flex: none; display: inline-flex; align-items: center; gap: 3px; color: var(--text-3); font-size: var(--text-sm); }
</style>
