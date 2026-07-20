<script setup lang="ts">
/**
 * PromptDialog —— 应用内输入/确认弹层
 *
 * 替代 window.prompt / window.confirm(macOS WKWebView 不实现 prompt,点了没反应;
 * confirm 也与应用视觉脱节)。两种模式:
 * - input(默认):单行输入,Enter 确认 / Esc 取消,空串不确认
 * - input=false:纯确认,danger 时确认键红色
 * Esc 自管且 stopPropagation(不触发全局 escClose 连带关底层浮层)。
 */
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    placeholder?: string;
    initial?: string;
    confirmLabel?: string;
    danger?: boolean;
    input?: boolean;
  }>(),
  { description: '', placeholder: '', initial: '', confirmLabel: '确定', danger: false, input: true },
);
const emit = defineEmits<{ (e: 'confirm', value: string): void; (e: 'cancel'): void }>();

const text = ref(props.initial);
const inputEl = ref<HTMLInputElement | null>(null);

function confirm() {
  const v = text.value.trim();
  if (props.input && !v) return;
  emit('confirm', v);
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    emit('cancel');
  }
}
watch(
  () => props.initial,
  (v) => {
    text.value = v;
  },
);
onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  void nextTick(() => {
    inputEl.value?.focus();
    inputEl.value?.select();
  });
});
onUnmounted(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="pd-overlay" @click.self="emit('cancel')">
    <div class="prompt-dialog" role="dialog" :aria-label="props.title">
      <div class="pd-title">{{ props.title }}</div>
      <div v-if="props.description" class="pd-desc">{{ props.description }}</div>
      <input
        v-if="props.input"
        ref="inputEl"
        v-model="text"
        class="pd-input"
        :placeholder="props.placeholder"
        @keydown.enter.prevent="confirm"
      />
      <div class="pd-actions">
        <button class="btn" @click="emit('cancel')">取消</button>
        <button class="btn pd-confirm" :class="{ danger: props.danger }" @click="confirm">
          {{ props.confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pd-overlay {
  position: fixed; inset: 0; z-index: 90;
  display: grid; place-items: center;
  background: rgba(20, 23, 28, 0.36);
}
.prompt-dialog {
  width: 380px; max-width: 90vw;
  display: flex; flex-direction: column; gap: 10px;
  padding: 16px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-lg);
}
.pd-title { font-size: var(--text-md); font-weight: 600; }
.pd-desc { font-size: var(--text-sm); color: var(--text-2); line-height: 1.5; }
.pd-input {
  height: 32px; padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--bg);
  color: var(--text);
  font-size: var(--text-md);
  outline: none;
}
.pd-input:focus { border-color: var(--accent); }
.pd-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 2px; }
.pd-confirm { background: var(--accent); color: #fff; }
.pd-confirm:hover { background: var(--accent); filter: brightness(1.06); }
.pd-confirm.danger { background: var(--danger); }
.pd-confirm.danger:hover { background: var(--danger); filter: brightness(1.06); }
</style>
