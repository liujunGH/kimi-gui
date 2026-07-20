<script setup lang="ts">
/**
 * ModePicker —— 模式开关弹层(计划 / Swarm / 目标,三个独立 toggle)
 *
 * 翻译自 prototype/mock/shared.js 的 bindModePicker;样式类对齐 composer.css
 *(.perm-pill.mode-pill / .model-pop.mode-pop / .mode-row / .mode-sw / .mode-tag)。
 *
 * 行为(组件内):
 * - pill 点击开关弹层;点外部 / Esc 关闭(document 监听在 onUnmounted 移除)
 * - 开关行切换不收弹层;激活模式即时回显在 pill 的 .mode-tag(「计划 · Swarm」)
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { ModeFlags } from '../../../types/codex';
import CodexIcon from '../layout/CodexIcon.vue';

const props = defineProps<{ modes: ModeFlags }>();
const emit = defineEmits<{ (e: 'toggle-mode', m: keyof ModeFlags): void }>();

interface ModeOption {
  id: keyof ModeFlags;
  name: string;
  desc: string;
  icon: string;
}

/** ModeFlags 三个键的固定展示文案(类型域,非 mock 数据) */
const OPTIONS: ModeOption[] = [
  { id: 'plan', name: '计划', desc: '先让智能体梳理计划,再修改文件', icon: 'plan' },
  { id: 'swarm', name: 'Swarm', desc: '并行运行多个智能体,适合大范围探索', icon: 'sparkle' },
  { id: 'goal', name: '目标', desc: '持续跟踪一个目标,直到任务完成', icon: 'target' },
];

const open = ref(false);
const activeNames = computed(() => OPTIONS.filter((o) => props.modes[o.id]).map((o) => o.name));

function onDocClick(e: MouseEvent) {
  if (!(e.target as HTMLElement | null)?.closest('.mode-picker')) open.value = false;
}
function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) {
    e.stopPropagation(); // 防穿透:全局 escClose 在 window 相,别连带关底层浮层
    open.value = false;
  }
}
onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onDocKeydown);
});
onUnmounted(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onDocKeydown);
});
</script>

<template>
  <button
    class="perm-pill mode-pill mode-picker"
    :class="{ open }"
    title="模式"
    @click="open = !open"
  >
    <CodexIcon name="sliders" />
    模式
    <span v-if="activeNames.length" class="mode-tag">{{ activeNames.join(' · ') }}</span>
    <CodexIcon name="chevron-down" size="sm" />
  </button>

  <div class="model-pop mode-pop mode-picker" :class="{ open }">
    <div class="mp-label">模式</div>
    <label
      v-for="o in OPTIONS"
      :key="o.id"
      class="mp-row mode-row"
      :class="{ 'mode-on': props.modes[o.id] }"
    >
      <span class="mi-ic"><CodexIcon :name="o.icon" /></span>
      <span class="mp-text">
        <span class="mp-name">{{ o.name }}</span>
        <span class="mp-desc">{{ o.desc }}</span>
      </span>
      <span class="mode-sw">
        <input
          type="checkbox"
          :checked="props.modes[o.id]"
          @change="emit('toggle-mode', o.id)"
        />
        <span class="mode-sw-slider"></span>
      </span>
    </label>
  </div>
</template>
