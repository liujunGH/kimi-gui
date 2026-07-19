<script setup lang="ts">
/**
 * ThinkingBlock —— 思考块(内联折叠 + 流式 + 全局开关 + steer 标记)
 *
 * 行为(组件内,kimi3 域):
 * - 点击 summary 折叠/展开;流式开始(streaming 转 true)自动展开
 * - globalShow = false 时强制全部折叠(含流式),见 useUIState.globalThinking
 * - duration:可选耗时标签(契约外补充 prop,已报备)
 */
import { computed, ref, watch } from 'vue';
import type { ThinkingBlockProps, ThinkingBlockEmits } from '../../../types/codex';
import CodexIcon from '../layout/CodexIcon.vue';

const props = defineProps<ThinkingBlockProps & { duration?: string }>();
const emit = defineEmits<ThinkingBlockEmits>();

const open = ref(true);
watch(
  () => props.streaming,
  (s) => {
    if (s) open.value = true;
  },
);

/** 全局开关关 → 全部折叠(含流式) */
const shown = computed(() => props.globalShow && open.value);
const segments = computed(() => props.text.split(/\n\n+/).filter(Boolean));
const teaser = computed(() => props.text.replace(/\s+/g, ' ').slice(0, 60));

function toggle() {
  open.value = !open.value;
  emit('toggle');
}
</script>

<template>
  <div class="think" :class="{ open: shown, thinking: props.streaming }">
    <div class="think-summary" @click="toggle">
      <span class="think-chevron"><CodexIcon name="chevron-right" /></span>
      <span class="think-label">{{ props.streaming ? '思考中' : '思考过程' }}</span>
      <span class="think-teaser">{{ teaser }}</span>
      <span v-if="props.duration" class="think-time">{{ props.duration }}</span>
    </div>
    <div class="think-body">
      <div v-if="props.steerMark" class="think-user-steer">
        <span class="steer-icon"><CodexIcon name="flag" /></span>
        <span class="steer-label">用户引导</span>
        <span class="steer-text">{{ props.steerMark.text }}</span>
      </div>
      <div v-for="(seg, i) in segments" :key="i" class="think-content">{{ seg }}</div>
    </div>
  </div>
</template>
