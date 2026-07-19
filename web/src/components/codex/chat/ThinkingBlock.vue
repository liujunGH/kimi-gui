<script setup lang="ts">
/**
 * ThinkingBlock —— 思考块(内联折叠 + 流式 + 全局开关 + steer 标记)
 *
 * 行为修正(轮次 4):
 * - globalShow = "新思考默认展开"（不是"强制全部展开/折叠"）
 *   - 开：新出现的思考块默认展开，但不影响手动折叠过的
 *   - 关：新出现的思考块默认折叠，但不影响手动展开过的
 * - 流式中也可以手动折叠（原 bug：.think.thinking .think-body 无条件 240px，
 *   不受 .open 控制，导致流式中点折叠无效）
 * - 流式开始时：如果 globalShow=true 自动展开；globalShow=false 不抢展开
 */
import { computed, ref, watch } from 'vue';
import type { ThinkingBlockProps, ThinkingBlockEmits } from '../../../types/codex';
import CodexIcon from '../layout/CodexIcon.vue';

const props = defineProps<ThinkingBlockProps & { duration?: string }>();
const emit = defineEmits<ThinkingBlockEmits>();

// open = 这个思考块是否展开（用户可手动切换）
// 初始值跟随 globalShow（全局开关 = 新思考的默认展开状态）
const open = ref(props.globalShow);

// 流式开始时：如果全局开关开，自动展开（不抢用户已手动折叠的）
watch(
  () => props.streaming,
  (s) => {
    if (s && props.globalShow) open.value = true;
  },
);

const teaser = computed(() => props.text.replace(/\s+/g, ' ').slice(0, 60));
const segments = computed(() => props.text.split(/\n\n+/).filter(Boolean));

function toggle() {
  open.value = !open.value;
  emit('toggle');
}
</script>

<template>
  <div class="think" :class="{ open, thinking: props.streaming }">
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
