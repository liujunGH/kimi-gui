<script setup lang="ts">
/**
 * SubagentCard —— 子 agent 卡(对话流网格用,multi-agent 场景)
 *
 * props/emit 契约见 types/codex.ts SubagentCardProps / SubagentCardEmits。
 * 状态映射(working→无变体;completed→is-done;suspended/queued→is-waiting):
 * - dot:working→dot-running / completed→dot-done / suspended·queued→dot-waiting
 * - failed(契约里有、原型未展示):无变体 + dot-error(契约外补充,已报备)
 * 点击卡片 emit('inspect') → 父级钻取该 agent 的 transcript 分栏。
 * 结构对齐 prototype/multi-agent.html;样式类全部在 conversation.css。
 */
import { computed } from 'vue';
import type {
  SubagentCardProps,
  SubagentCardEmits,
  SubagentStatus,
} from '../../../types/codex';

const props = defineProps<SubagentCardProps>();
const emit = defineEmits<SubagentCardEmits>();

const VARIANT: Record<SubagentStatus, string> = {
  working: '',
  completed: 'is-done',
  suspended: 'is-waiting',
  queued: 'is-waiting',
  failed: '',
};
const DOT: Record<SubagentStatus, string> = {
  working: 'dot-running',
  completed: 'dot-done',
  suspended: 'dot-waiting',
  queued: 'dot-waiting',
  failed: 'dot-error',
};
const STATUS_TEXT: Record<SubagentStatus, string> = {
  working: '运行中',
  queued: '排队中',
  suspended: '待输入',
  completed: '已完成',
  failed: '已失败',
};

const status = computed(() => props.subagent.status);

/** 进度条百分比;无 progress 时 0(空条,对齐原型结构) */
const pct = computed(() => {
  const p = props.subagent.progress;
  if (!p || !p.total) return 0;
  return Math.min(100, Math.round((p.current / p.total) * 100));
});
</script>

<template>
  <div class="subagent-card" :class="VARIANT[status]" @click="emit('inspect')">
    <div class="sa-head">
      <span class="dot" :class="DOT[status]"></span>
      <span class="sa-name">{{ props.subagent.name }}</span>
      <span class="sa-status">{{ STATUS_TEXT[status] }}</span>
      <span v-if="props.subagent.progress" class="sa-progress">
        {{ props.subagent.progress.current }}/{{ props.subagent.progress.total }}
      </span>
      <span v-if="props.subagent.elapsed" class="sa-elapsed">· {{ props.subagent.elapsed }}</span>
    </div>
    <div v-if="props.subagent.summary" class="sa-body">{{ props.subagent.summary }}</div>
    <div class="sa-bar"><div class="sa-bar-fill" :style="{ width: pct + '%' }"></div></div>
  </div>
</template>
