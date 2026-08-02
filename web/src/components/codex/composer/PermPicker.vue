<script setup lang="ts">
/**
 * PermPicker —— 权限三档弹层(逐条确认 / YOLO / 自动)
 *
 * 翻译自 prototype/mock/shared.js 的 bindPermPicker;样式类对齐 composer.css
 *(.perm-pill / .model-pop.perm-pop / .mp-*),弹层相对 .composer 绝对定位。
 *
 * 行为(组件内):
 * - pill 点击开关弹层;点外部 / Esc 关闭(document 监听在 onUnmounted 移除)
 * - 选中打勾 + 当前档高亮,选完关弹层更新 pill
 * - pill 变体类:manual 无 / yolo → perm-yolo(琥珀)/ auto → perm-danger(红)
 * - localStorage('proto-perm')持久化;挂载时读回,经 emit 同步父级
 *
 * Kimi CLI 语义:YOLO 自动批准工具但仍可提问；Auto 完全自主且不再提问。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { PermissionMode } from '../../../types';
import CodexIcon from '../layout/CodexIcon.vue';

const props = defineProps<{ permission: PermissionMode }>();
const emit = defineEmits<{ (e: 'set-permission', p: PermissionMode): void }>();

interface PermOption {
  id: PermissionMode;
  name: string;
  desc: string;
  /** pill 变体类(manual 无) */
  cls: '' | 'perm-yolo' | 'perm-danger';
}

/** 协议枚举 PermissionMode 的固定展示文案(类型域,非 mock 数据) */
const OPTIONS: PermOption[] = [
  { id: 'manual', name: '逐条确认', desc: '每个工具操作都需要你手动确认', cls: '' },
  { id: 'yolo', name: 'YOLO', desc: '自动批准工具操作，但 Agent 仍可能向你提问', cls: 'perm-yolo' },
  { id: 'auto', name: '自动', desc: '完全自主运行，不再请求批准或向你提问', cls: 'perm-danger' },
];

const open = ref(false);
const cur = computed(() => OPTIONS.find((o) => o.id === props.permission) ?? (OPTIONS[0] as PermOption));

function pick(p: PermissionMode) {
  emit('set-permission', p);
  open.value = false;
}

function onDocClick(e: MouseEvent) {
  if (!(e.target as HTMLElement | null)?.closest('.perm-picker')) open.value = false;
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
    class="perm-pill perm-picker"
    :class="[cur.cls, { open }]"
    :title="`权限模式:${cur.name}`"
    @click="open = !open"
  >
    <CodexIcon name="shield" />
    {{ cur.name }}
    <CodexIcon name="chevron-down" size="sm" />
  </button>

  <div class="model-pop perm-pop perm-picker" :class="{ open }">
    <div class="mp-label">权限模式</div>
    <button
      v-for="o in OPTIONS"
      :key="o.id"
      class="mp-item"
      :class="{ active: o.id === props.permission }"
      @click="pick(o.id)"
    >
      <CodexIcon name="check" class="mp-check" />
      <span class="mp-text">
        <span class="mp-name">{{ o.name }}</span>
        <span class="mp-desc">{{ o.desc }}</span>
      </span>
    </button>
  </div>
</template>
