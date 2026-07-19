<script setup lang="ts">
/**
 * MessageAssistant —— 助手消息(按 ChatTurn.blocks 有序渲染:思考/正文/工具卡)
 *
 * - 文本块做极简行内渲染:段落分段 + `code` + **bold**(先转义,防注入)
 * - streaming = true 时,最后一个思考块呈流式态(光标)
 * - todos 非空时尾部挂 TodoCard;a-foot 显示用时 + 复制
 */
import { computed } from 'vue';
import type { ChatTurn, TodoView } from '../../../types';
import CodexIcon from '../layout/CodexIcon.vue';
import ThinkingBlock from './ThinkingBlock.vue';
import ToolCallCard from './ToolCallCard.vue';
import TodoCard from './TodoCard.vue';
import { useUIState } from '../../../composables/codex/useUIState';

const ui = useUIState();
const globalThinking = computed(() => ui.globalThinking.value);

const props = withDefaults(
  defineProps<{ turn: ChatTurn; todos?: TodoView[]; running?: boolean }>(),
  { todos: () => [], running: false },
);
const emit = defineEmits<{ (e: 'inspect-tools'): void }>();

const blocks = computed(() => props.turn.blocks ?? []);
const lastThinkingIdx = computed(() => {
  for (let i = blocks.value.length - 1; i >= 0; i--) {
    const b = blocks.value[i];
    if (b && b.kind === 'thinking') return i;
  }
  return -1;
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function inlineMd(s: string): string {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
/** 极简渲染:转义后 `code` → <code>,**bold** → <strong>;按空行分段,连续 "- " 行包成 <ul><li> */
function renderRich(text: string): string {
  return text
    .split(/\n\n+/)
    .map((para) => {
      const out: string[] = [];
      let inList = false;
      for (const line of para.split('\n')) {
        const m = line.match(/^[-•]\s+(.*)$/);
        if (m) {
          if (!inList) {
            out.push('<ul>');
            inList = true;
          }
          out.push(`<li>${inlineMd(m[1] ?? '')}</li>`);
        } else {
          if (inList) {
            out.push('</ul>');
            inList = false;
          }
          if (line.trim()) out.push(inlineMd(line), '<br>');
        }
      }
      if (inList) out.push('</ul>');
      const body = out.join('').replace(/(<br>)+$/, '');
      return body ? `<p>${body}</p>` : '';
    })
    .join('');
}

const duration = computed(() => {
  const ms = props.turn.durationMs;
  if (!ms) return '';
  return `用时 ${Math.max(1, Math.round(ms / 1000))}s`;
});

function copyAll() {
  const text = blocks.value
    .filter((b) => b.kind === 'text')
    .map((b) => (b.kind === 'text' ? b.text : ''))
    .join('\n\n');
  try {
    if (navigator.clipboard) navigator.clipboard.writeText(text);
  } catch {
    /* 原型期忽略 */
  }
}
</script>

<template>
  <div class="msg-assistant">
    <template v-for="(b, i) in blocks" :key="i">
      <ThinkingBlock
        v-if="b.kind === 'thinking'"
        :text="b.thinking"
        :streaming="props.running && i === lastThinkingIdx"
        :global-show="globalThinking"
      />
      <div v-else-if="b.kind === 'text'" class="a-content" v-html="renderRich(b.text)"></div>
      <ToolCallCard v-else :call="b.tool" @inspect="emit('inspect-tools')" />
    </template>

    <TodoCard v-if="props.todos.length" :todos="props.todos" />

    <div class="a-foot">
      <span v-if="duration">{{ duration }}</span>
      <button class="icon-btn foot-copy" title="复制" @click="copyAll">
        <CodexIcon name="copy" size="sm" />
      </button>
    </div>
  </div>
</template>
