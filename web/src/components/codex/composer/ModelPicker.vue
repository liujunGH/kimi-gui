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
 * - localStorage('proto-model')持久化 { model, effort };挂载时读回经 emit 同步父级
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
const STORAGE_KEY = 'proto-model';

const open = ref(false);

const currentName = computed(
  () => props.models.find((m) => m.id === props.current)?.name ?? props.current,
);

function persist(patch: { model?: string; effort?: EffortLevel }) {
  try {
    const prev = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, string>;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prev, ...patch }));
  } catch {
    /* ignore */
  }
}

function pickModel(id: string) {
  persist({ model: id });
  emit('set-model', id);
  open.value = false;
}
function pickEffort(lv: EffortLevel) {
  persist({ effort: lv });
  emit('set-effort', lv);
  /* 切深度不收起,可继续对比 */
}

function onDocClick(e: MouseEvent) {
  if (!(e.target as HTMLElement | null)?.closest('.model-picker')) open.value = false;
}
function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) open.value = false;
}
onMounted(() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as { model?: unknown; effort?: unknown };
      if (
        typeof s.model === 'string' &&
        props.models.some((m) => m.id === s.model) &&
        s.model !== props.current
      ) {
        emit('set-model', s.model);
      }
      if (
        typeof s.effort === 'string' &&
        (EFFORTS as string[]).includes(s.effort) &&
        s.effort !== props.effort
      ) {
        emit('set-effort', s.effort as EffortLevel);
      }
    }
  } catch {
    /* ignore */
  }
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
