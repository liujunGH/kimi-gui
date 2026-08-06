<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import type { ChatTurn } from '../../../types';
import CodexIcon from './CodexIcon.vue';

const props = defineProps<{ turns: ChatTurn[] }>();
const emit = defineEmits<{
  (e: 'undo', count: number, text: string): void;
  (e: 'close'): void;
}>();

const choices = computed(() => {
  const lastCompaction = props.turns.findLastIndex((turn) => turn.role === 'compaction');
  const users = props.turns
    .slice(lastCompaction + 1)
    .filter((turn) => turn.role === 'user' && turn.text.trim());
  return users.slice(-20).reverse().map((turn, index) => ({
    id: turn.id,
    count: index + 1,
    text: turn.text.trim(),
    time: turn.createdAt ? new Date(turn.createdAt).toLocaleString() : '',
  }));
});

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.stopPropagation();
    emit('close');
  }
}
onMounted(() => document.addEventListener('keydown', onKeydown));
onUnmounted(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="undo-overlay" @click.self="emit('close')">
    <section class="undo-dialog" role="dialog" aria-modal="true" aria-labelledby="undo-title">
      <header>
        <div><h2 id="undo-title">撤销到这里</h2><p>选择一条用户消息；该消息及之后的上下文会被移除，原文会回填到输入框。</p></div>
        <button class="icon-btn" aria-label="关闭" @click="emit('close')"><CodexIcon name="x" /></button>
      </header>
      <div v-if="choices.length" class="undo-list">
        <button v-for="choice in choices" :key="choice.id" type="button" @click="emit('undo', choice.count, choice.text)">
          <span class="undo-count">撤销 {{ choice.count }} 轮</span>
          <strong>{{ choice.text }}</strong>
          <small v-if="choice.time">{{ choice.time }}</small>
        </button>
      </div>
      <div v-else class="undo-empty">最近一次上下文压缩之后没有可撤销的消息。</div>
    </section>
  </div>
</template>

<style scoped>
.undo-overlay { position: fixed; inset: 0; z-index: 96; display: grid; place-items: center; padding: 24px; background: rgba(20, 23, 28, .38); }
.undo-dialog { width: min(620px, 94vw); max-height: min(700px, 86vh); display: flex; flex-direction: column; overflow: hidden; background: var(--bg); border: 1px solid var(--border); border-radius: var(--r-lg); box-shadow: var(--shadow-lg); }
.undo-dialog header { display: flex; align-items: flex-start; gap: 16px; padding: 18px 20px 14px; border-bottom: 1px solid var(--border-soft); }
.undo-dialog header > div { flex: 1; min-width: 0; }
.undo-dialog h2 { margin: 0; font-size: 18px; }
.undo-dialog p { margin: 5px 0 0; color: var(--text-3); font-size: var(--text-sm); line-height: 1.5; }
.undo-list { min-height: 0; overflow: auto; padding: 10px; }
.undo-list button { display: grid; grid-template-columns: 82px 1fr auto; align-items: center; gap: 10px; width: 100%; padding: 10px; border: 0; border-radius: var(--r-md); background: transparent; color: var(--text); text-align: left; cursor: pointer; }
.undo-list button:hover { background: var(--hover); }
.undo-count { color: var(--accent); font-size: var(--text-sm); }
.undo-list strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-sm); }
.undo-list small { color: var(--text-3); white-space: nowrap; }
.undo-empty { padding: 30px 20px; text-align: center; color: var(--text-3); }
@media (max-width: 640px) { .undo-list button { grid-template-columns: 76px 1fr; } .undo-list small { display: none; } }
</style>
