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
import { computed, nextTick, ref, watch } from 'vue';
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

// ---------- 流式跟随(滚锚):新思考内容自动滚到最新,用户上滚则暂停 ----------
const bodyRef = ref<HTMLElement | null>(null);
const follow = ref(true);
const showJump = ref(false);

function onBodyScroll() {
  const el = bodyRef.value;
  if (!el) return;
  follow.value = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  if (follow.value) showJump.value = false;
}

watch(
  () => props.text,
  () => {
    const el = bodyRef.value;
    if (!el) return;
    if (follow.value) {
      nextTick(() => {
        el.scrollTop = el.scrollHeight;
      });
    } else {
      showJump.value = true;
    }
  },
);

function jumpToLatest() {
  const el = bodyRef.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
  follow.value = true;
  showJump.value = false;
}
</script>

<template>
  <div class="think" :class="{ open, thinking: props.streaming }">
    <button type="button" class="think-summary" :aria-expanded="open" @click="toggle">
      <span class="think-chevron"><CodexIcon name="chevron-right" /></span>
      <span class="think-label">{{ props.streaming ? '思考中' : '思考过程' }}</span>
      <span class="think-teaser">{{ teaser }}</span>
      <span v-if="props.duration" class="think-time">{{ props.duration }}</span>
    </button>
    <div ref="bodyRef" class="think-body" @scroll.passive="onBodyScroll">
      <div v-if="props.steerMark" class="think-user-steer">
        <span class="steer-icon"><CodexIcon name="flag" /></span>
        <span class="steer-label">用户引导</span>
        <span class="steer-text">{{ props.steerMark.text }}</span>
      </div>
      <div v-for="(seg, i) in segments" :key="i" class="think-content">{{ seg }}</div>
    </div>
    <button v-if="showJump" type="button" class="think-scroll-pill" @click.stop="jumpToLatest">↓ 最新</button>
  </div>
</template>

<style scoped>
/* div → button 的 UA 样式 reset:类名未动,布局/配色仍由 thinking.css 的 .think-summary 承担 */
.think-summary {
  width: 100%;
  border: none;
  background: none;
  font-family: inherit;
  text-align: left;
}
.think-summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
</style>
