<script setup lang="ts">
/**
 * MessageUser —— 用户消息气泡(右对齐,中性灰)
 */
import { computed } from 'vue';
import type { ChatTurn } from '../../../types';

const props = defineProps<{ turn: ChatTurn }>();

const meta = computed(() => {
  const t = props.turn.createdAt;
  return t ? t.slice(11, 16) : '';
});
</script>

<template>
  <div class="msg-user">
    <div class="u-bubble">{{ props.turn.text }}</div>
    <div v-if="meta" class="u-meta">{{ meta }}</div>
  </div>
</template>
