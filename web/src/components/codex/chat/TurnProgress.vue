<script setup lang="ts">
/**
 * TurnProgress —— 轮次进度条(对齐 Codex)
 * 有 current/total 时显示「第 N/M 步」;daemon 无步数源时不传,显示「工作中」。
 * 文件改动 +x −y 仅在非零时显示。
 */
import type { TurnProgressProps } from '../../../types/codex';
import CodexIcon from '../layout/CodexIcon.vue';

const props = defineProps<TurnProgressProps>();
</script>

<template>
  <div class="turn-progress">
    <span class="tp-spin"><CodexIcon name="spinner" /></span>
    <span v-if="props.current != null && props.total != null">第 {{ props.current }} / {{ props.total }} 步</span>
    <span v-else>工作中</span>
    <template v-if="props.additions || props.deletions">
      <span class="tp-files">· 文件已更改</span>
      <span class="tp-add">+{{ props.additions }}</span>
      <span class="tp-del">−{{ props.deletions }}</span>
    </template>
  </div>
</template>
