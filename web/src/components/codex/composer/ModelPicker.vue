<script setup lang="ts">
/**
 * ModelPicker —— 模型 + 思考深度弹层
 *
 * 翻译自 prototype/mock/shared.js 的 bindModelPicker;样式类对齐 composer.css
 *(.model-pill / .model-pop / .mp-*)。弹层结构对齐官方截图:
 * mp-label「MANAGED:KIMI-CODE」→ 模型列表(选中 ✓ + 高亮)→ 思考 Low/High/Max
 * 三段 →「更多模型…」(死链,点击仅关弹层)。
 *
 * 行为(组件内):
 * - pill 点击开关弹层;点外部 / Esc 关闭(document 监听在 onUnmounted 移除)
 * - 选模型后关弹层;切思考深度不收起(可继续对比)
 * - 真源是 daemon(client.models/defaultModel);不做 localStorage 回写,
 *   避免挂载时拿缓存覆盖会话真实模型(原型 proto-model 残留已清)
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { EffortLevel, ModelInfo } from '../../../types/codex';
import CodexIcon from '../layout/CodexIcon.vue';

const props = defineProps<{
  models: ModelInfo[];
  current: string;
  effort: EffortLevel | null;
}>();
const emit = defineEmits<{
  (e: 'set-model', id: string): void;
  (e: 'set-effort', lv: EffortLevel): void;
  (e: 'pick-model'): void;
}>();

/** EffortLevel 联合类型的全部成员(类型域,非 mock 数据) */
const EFFORTS: EffortLevel[] = ['Low', 'High', 'Max'];

const open = ref(false);

const currentName = computed(
  () => props.models.find((m) => m.id === props.current)?.name ?? props.current,
);

function pickModel(id: string) {
  emit('set-model', id);
  open.value = false;
}
function pickEffort(lv: EffortLevel) {
  emit('set-effort', lv);
  /* 切深度不收起,可继续对比 */
}

function onDocClick(e: MouseEvent) {
  if (!(e.target as HTMLElement | null)?.closest('.model-picker')) open.value = false;
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
  <button class="model-pill model-picker" :class="{ open }" title="模型" @click="open = !open">
    {{ currentName }}<span v-if="props.effort" class="model-thinking">&nbsp;· {{ props.effort }}</span>
    <CodexIcon name="chevron-down" size="sm" />
  </button>

  <div class="model-pop model-picker" :class="{ open }">
    <div class="mp-label">MANAGED:KIMI-CODE</div>
    <button
      v-for="m in props.models"
      :key="m.id"
      class="mp-item"
      :class="{ active: m.id === props.current }"
      @click="pickModel(m.id)"
    >
      <CodexIcon name="check" class="mp-check" />
      <span class="mp-name">{{ m.name }}</span>
    </button>
    <div class="mp-sep"></div>
    <div class="mp-row">
      <span class="mp-row-label">思考</span>
      <span class="mp-seg">
        <button
          v-for="lv in EFFORTS"
          :key="lv"
          :class="{ active: lv === props.effort }"
          @click="pickEffort(lv)"
        >
          {{ lv }}
        </button>
      </span>
    </div>
    <div class="mp-sep"></div>
    <button class="mp-more" @click="emit('pick-model'); open = false">更多模型…</button>
  </div>
</template>
