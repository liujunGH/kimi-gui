<script setup lang="ts">
/**
 * TodoCard —— Kimi 独有的任务清单卡(无头衔浮动卡,对齐 Codex 形态)
 * 状态映射:done → ✓ 灰;in_progress → 蓝点半圆;pending → 灰圈。
 */
import type { TodoCardProps } from '../../../types/codex';
import CodexIcon from '../layout/CodexIcon.vue';

const props = defineProps<TodoCardProps>();

const STATE: Record<string, { cls: string; icon: string }> = {
  done: { cls: 'done', icon: 'check-circle' },
  in_progress: { cls: 'progress', icon: 'circle-dot' },
  pending: { cls: 'pending', icon: 'circle' },
};
</script>

<template>
  <div class="todo-card">
    <div v-for="(t, i) in props.todos" :key="i" class="todo-item" :class="STATE[t.status]?.cls">
      <span class="todo-state"><CodexIcon :name="STATE[t.status]?.icon ?? 'circle'" /></span>
      <span class="todo-text">{{ t.title }}</span>
    </div>
  </div>
</template>
