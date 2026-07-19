<script setup lang="ts">
/**
 * StatusFilter —— 侧栏状态过滤 chips(prototype v2:全部 / 运行中 / 待审批)
 * 纯展示组件,选中态由父级(Sidebar)通过 filter prop 驱动。
 */
import type { SessionFilter } from '../../../types/codex';

const props = defineProps<{ filter: SessionFilter }>();
const emit = defineEmits<{ (e: 'set-filter', f: SessionFilter): void }>();

const CHIPS: { id: SessionFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'running', label: '运行中' },
  { id: 'pending_approval', label: '待审批' },
];
</script>

<template>
  <div class="side-filter">
    <button
      v-for="c in CHIPS"
      :key="c.id"
      class="sf-chip"
      :class="{ active: props.filter === c.id }"
      @click="emit('set-filter', c.id)"
    >
      {{ c.label }}
    </button>
  </div>
</template>
