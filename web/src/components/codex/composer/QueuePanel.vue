<script setup lang="ts">
/**
 * QueuePanel —— 队列指示器 + 队列面板
 *
 * 行为(组件内):
 * - 指示器开合面板;条数空时自动收起并隐藏
 * - 行操作:引导(转插话)/ 编辑 / 删除,经 emit 上抛
 * - defaultOpen:steer 场景用,初始即展开
 * - reorder:拖拽重排本阶段只做 grip 暗示,emit 保留
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
</script>

<template>
  <template v-if="count">
    <div class="queue-indicator" :class="{ open }" title="查看队列" @click="open = !open">
      <CodexIcon name="list" />
      <span class="qi-count">{{ count }} 条</span>排队中
      <span class="qi-chevron"><CodexIcon name="chevron-down" /></span>
    </div>

    <div class="queue-panel" :class="{ open }">
      <div class="qp-head">
        消息队列
        <span class="qp-hint">{{ count }} 条 · 拖拽重排</span>
      </div>
      <div v-for="(q, i) in props.queuedPrompts" :key="q.id" class="qp-row">
        <span class="qp-grip" title="拖拽重排"><CodexIcon name="grip" /></span>
        <span class="qp-num">{{ i + 1 }}</span>
        <span class="qp-text">{{ q.text }}</span>
        <span class="qp-actions">
          <button
            class="qp-steer"
            title="转为引导:立即插话到当前轮"
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
