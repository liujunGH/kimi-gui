<script setup lang="ts">
/**
 * AgentTranscript —— 子 agent transcript(SideTask slot 的内容组件)
 *
 * props 契约见 types/codex.ts AgentTranscriptProps(subagentId/turns);
 * 契约外补充(已报备):ask? —— 待输入 agent 末尾的提问块(.st-ask,样式在 base.css)。
 *
 * 直接复用 chat/ 的 MessageUser / MessageAssistant 按 turns 渲染;
 * 多根 fragment:渲染产物作为 .st-body 的直接子节点,保住 flex gap 节奏。
 */
import type { AgentTranscriptProps } from '../../../types/codex';
import MessageUser from '../chat/MessageUser.vue';
import MessageAssistant from '../chat/MessageAssistant.vue';

const props = withDefaults(defineProps<AgentTranscriptProps & { ask?: string }>(), { ask: '' });
</script>

<template>
  <template v-for="t in props.turns" :key="props.subagentId + ':' + t.id">
    <MessageUser v-if="t.role === 'user'" :turn="t" />
    <MessageAssistant v-else-if="t.role === 'assistant'" :turn="t" />
  </template>
  <div v-if="props.ask" class="st-ask">{{ props.ask }}</div>
</template>
