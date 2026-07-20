<script setup lang="ts">
/**
 * MessageAssistant —— 助手消息(按 ChatTurn.blocks 有序渲染:思考/正文/工具卡)
 *
 * 文本块用官方 Markdown.vue(markstream-vue)渲染:
 * - 流式 markdown + 代码高亮 + KaTeX + Mermaid
 * - streaming = true 时 markstream 做平滑流式动画
 * - 跟官方 ChatPane.vue:640 一致(<Markdown :text :streaming :open-file>)
 *
 * 替代了 codex-demo 时代的极简 renderRich(正则替换),
 * 现在产品入口用真 markdown 渲染。
 */
import { computed } from 'vue';
import type { ChatTurn, TodoView } from '../../../types';
import Markdown from '../../chat/Markdown.vue';
import CodexIcon from '../layout/CodexIcon.vue';
import ThinkingBlock from './ThinkingBlock.vue';
import ToolCallCard from './ToolCallCard.vue';
import TodoCard from './TodoCard.vue';
import ApprovalCard from '../approval/ApprovalCard.vue';
import { fromApprovalBlock } from '../approval/approvalMapper';
import { useUIState } from '../../../composables/codex/useUIState';

const ui = useUIState();
const globalThinking = computed(() => ui.globalThinking.value);

const props = withDefaults(
  defineProps<{ turn: ChatTurn; todos?: TodoView[]; running?: boolean; openFile?: (target: { path: string; line?: number }) => void }>(),
  { todos: () => [], running: false, openFile: undefined },
);
const emit = defineEmits<{ (e: 'inspect', tab: 'thinking' | 'tools'): void }>();

const blocks = computed(() => props.turn.blocks ?? []);
const lastThinkingIdx = computed(() => {
  for (let i = blocks.value.length - 1; i >= 0; i--) {
    const b = blocks.value[i];
    if (b && b.kind === 'thinking') return i;
  }
  return -1;
});

/** 最后一个 text block 是否流式中(传给 Markdown.vue 的 streaming prop) */
const lastTextIdx = computed(() => {
  for (let i = blocks.value.length - 1; i >= 0; i--) {
    const b = blocks.value[i];
    if (b && b.kind === 'text') return i;
  }
  return -1;
});

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
    /* 忽略 */
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
        @inspect="emit('inspect', 'thinking')"
      />
      <div v-else-if="b.kind === 'text' && b.text" class="a-content">
        <Markdown
          :text="b.text"
          :streaming="props.running && i === lastTextIdx"
          :open-file="props.openFile"
        />
      </div>
      <ToolCallCard v-else-if="b.kind === 'tool'" :call="b.tool" @inspect="emit('inspect', 'tools')" />
    </template>

    <TodoCard v-if="props.todos.length" :todos="props.todos" />

    <!-- 审批卡:turn.approval 内联渲染(批准/拒绝经 inject client 回 daemon) -->
    <ApprovalCard
      v-if="props.turn.approval"
      v-bind="fromApprovalBlock(props.turn.approval, props.turn.approvalId ?? '')"
    />

    <div class="a-foot">
      <span v-if="duration">{{ duration }}</span>
      <button type="button" class="icon-btn foot-copy" title="复制" aria-label="复制" @click="copyAll">
        <CodexIcon name="copy" size="sm" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* hover 操作区:与 MessageUser 的 u-actions 同一套视觉(24px icon-btn,
   hover / 键盘 focus-within 时显形);基础规则在 conversation.css,这里补键盘可达 */
.foot-copy { width: 24px; height: 24px; opacity: 0; transition: opacity var(--dur-1); }
.msg-assistant:hover .foot-copy,
.msg-assistant:focus-within .foot-copy { opacity: 1; }
.foot-copy:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
</style>
