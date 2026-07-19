<script setup lang="ts">
/**
 * ToolCallCard —— 工具调用卡(点击查看完整输出)
 * 状态:ok → 绿色对勾;running → 蓝点呼吸;error → 红。
 */
import { computed } from 'vue';
import type { ToolCallCardProps, ToolCallCardEmits } from '../../../types/codex';
import CodexIcon from '../layout/CodexIcon.vue';

const props = defineProps<ToolCallCardProps>();
const emit = defineEmits<ToolCallCardEmits>();

const statusIcon = computed(() =>
  props.call.status === 'ok' ? 'check' : props.call.status === 'error' ? 'x' : null,
);
</script>

<template>
  <div class="tool-call" @click="emit('inspect')">
    <div class="tool-head">
      <span class="tool-icon"><CodexIcon name="terminal" /></span>
      <span class="tool-name">{{ props.call.name }}</span>
      <span class="tool-detail">{{ props.call.arg }}</span>
      <span class="tool-status">
        <CodexIcon v-if="statusIcon" :name="statusIcon" />
        <span v-else class="dot dot-running"></span>
      </span>
    </div>
  </div>
</template>
