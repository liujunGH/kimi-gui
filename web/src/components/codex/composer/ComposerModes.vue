<script setup lang="ts">
/**
 * ComposerModes —— 运行态双模分段控件(排队下轮 / 插话 steer)
 * 插话激活态为 warning 黄(prototype v2 决策:两个端点,UI 显式区分)。
 */
import type { ComposerMode } from '../../../types/codex';
import CodexIcon from '../layout/CodexIcon.vue';

const props = defineProps<{ mode: ComposerMode }>();
const emit = defineEmits<{ (e: 'set-mode', m: ComposerMode): void }>();
</script>

<template>
  <div class="composer-modes">
    <div class="mode-seg">
      <button
        class="mode-btn"
        :class="{ active: props.mode === 'queue' }"
        @click="emit('set-mode', 'queue')"
      >
        <CodexIcon name="list" />
        排队下轮
      </button>
      <button
        class="mode-btn mode-steer"
        :class="{ active: props.mode === 'steer' }"
        @click="emit('set-mode', 'steer')"
      >
        <CodexIcon name="flag" />
        插话 steer
      </button>
    </div>
    <span class="mode-hint" :class="{ 'hint-warning': props.mode === 'steer' }">
      {{ props.mode === 'steer' ? 'Enter 插话 · 立即注入当前轮' : 'Enter 排队' }}
    </span>
  </div>
</template>
