<script setup lang="ts">
/**
 * TurnProgress —— 轮次进度条(第 N/M 步 · 文件改动 +x −y,对齐 Codex)
 */
import type { TurnProgressProps } from '../../../types/codex';
import CodexIcon from '../layout/CodexIcon.vue';

const props = defineProps<TurnProgressProps>();
</script>

<template>
  <div class="turn-progress">
    <span class="tp-spin"><CodexIcon name="spinner" /></span>
    <span>第 {{ props.current }} / {{ props.total }} 步</span>
    <span class="tp-files">· 文件已更改</span>
    <span class="tp-add">+{{ props.additions }}</span>
    <span class="tp-del">−{{ props.deletions }}</span>
  </div>
</template>
