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
import { computed, defineAsyncComponent, ref } from 'vue';
import type { ChatTurn, TodoView } from '../../../types';
import type { ContextMenuItem } from '../../../lib/contextMenu';
import CodexIcon from '../layout/CodexIcon.vue';
import ContextMenu from '../layout/ContextMenu.vue';
import WorkSummary from './WorkSummary.vue';
import TodoCard from './TodoCard.vue';
import ApprovalCard from '../approval/ApprovalCard.vue';
import { fromApprovalBlock } from '../approval/approvalMapper';
import { useUIState } from '../../../composables/codex/useUIState';
import { needsRichMarkdown } from '../../../lib/markdownPerformance';
import { groupAssistantWork } from '../../../lib/workSummary';
import { copyTextToClipboard } from '../../../lib/clipboard';

const Markdown = defineAsyncComponent(() => import('../../chat/Markdown.vue'));

const ui = useUIState();
const globalThinking = computed(() => ui.globalThinking.value);

const props = withDefaults(
  defineProps<{ turn: ChatTurn; todos?: TodoView[]; running?: boolean; openFile?: (target: { path: string; line?: number }) => void }>(),
  { todos: () => [], running: false, openFile: undefined },
);
const emit = defineEmits<{
  (e: 'inspect', tab: 'thinking' | 'tools'): void;
  (e: 'quote', text: string): void;
  (e: 'fork'): void;
}>();

const blocks = computed(() => props.turn.blocks ?? []);
const displayUnits = computed(() => groupAssistantWork(blocks.value));
const lastWorkUnitIndex = computed(() => {
  for (let i = displayUnits.value.length - 1; i >= 0; i--) {
    if (displayUnits.value[i]?.kind === 'work') return i;
  }
  return -1;
});
const hasWork = computed(() => lastWorkUnitIndex.value >= 0);
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

const responseText = computed(() => blocks.value
    .filter((b) => b.kind === 'text')
    .map((b) => (b.kind === 'text' ? b.text : ''))
    .join('\n\n'));
const hasThinking = computed(() => blocks.value.some((block) => block.kind === 'thinking'));
const hasTools = computed(() => blocks.value.some((block) => block.kind === 'tool'));
const contextOpen = ref(false);
const contextPos = ref({ x: 0, y: 0 });
const rootEl = ref<HTMLElement | null>(null);
const selectedText = ref('');
const contextItems = computed<ContextMenuItem[]>(() => [
  ...(selectedText.value ? [{ id: 'copy-selection', label: '复制所选内容', icon: 'copy' }] : []),
  { id: 'copy', label: '复制回复', icon: 'copy', disabled: !responseText.value },
  { id: 'quote', label: '引用到输入框', icon: 'reply', disabled: !responseText.value },
  { id: 'thinking', label: '查看完整思考', icon: 'sparkle', disabled: !hasThinking.value, separatorBefore: true },
  { id: 'tools', label: '查看工具调用', icon: 'terminal', disabled: !hasTools.value },
  { id: 'fork', label: '分叉当前会话', icon: 'git-branch', separatorBefore: true },
]);

function copyAll() {
  void copyTextToClipboard(responseText.value);
}

function openContextMenu(event: MouseEvent): void {
  const selection = window.getSelection();
  selectedText.value = selection && rootEl.value?.contains(selection.anchorNode)
    ? selection.toString().trim()
    : '';
  contextPos.value = { x: event.clientX, y: event.clientY };
  contextOpen.value = true;
}

function onContextSelect(id: string): void {
  contextOpen.value = false;
  if (id === 'copy-selection') void copyTextToClipboard(selectedText.value);
  else if (id === 'copy') copyAll();
  else if (id === 'quote') emit('quote', responseText.value);
  else if (id === 'thinking') emit('inspect', 'thinking');
  else if (id === 'tools') emit('inspect', 'tools');
  else if (id === 'fork') emit('fork');
}
</script>

<template>
  <div ref="rootEl" class="msg-assistant" @contextmenu.prevent="openContextMenu">
    <template v-for="(unit, i) in displayUnits" :key="`${unit.kind}-${unit.sourceIndex}`">
      <WorkSummary
        v-if="unit.kind === 'work'"
        :entries="unit.entries"
        :running="props.running && i === lastWorkUnitIndex"
        :duration-ms="i === lastWorkUnitIndex ? props.turn.durationMs : undefined"
        :global-thinking="globalThinking"
        :streaming-thinking-source-index="lastThinkingIdx"
        @inspect="emit('inspect', $event)"
      />
      <div v-else class="a-content">
        <Markdown
          v-if="(props.running && unit.sourceIndex === lastTextIdx) || needsRichMarkdown(unit.block.text)"
          :text="unit.block.text"
          :streaming="props.running && unit.sourceIndex === lastTextIdx"
          :open-file="props.openFile"
        />
        <div v-else class="plain-assistant-text">{{ unit.block.text }}</div>
      </div>
    </template>

    <TodoCard v-if="props.todos.length" :todos="props.todos" />

    <!-- 审批卡:turn.approval 内联渲染(批准/拒绝经 inject client 回 daemon) -->
    <ApprovalCard
      v-if="props.turn.approval"
      v-bind="fromApprovalBlock(props.turn.approval, props.turn.approvalId ?? '')"
    />

    <div class="a-foot">
      <span v-if="duration && !hasWork">{{ duration }}</span>
      <button type="button" class="icon-btn foot-copy" title="复制" aria-label="复制" @click="copyAll">
        <CodexIcon name="copy" size="sm" />
      </button>
    </div>
    <ContextMenu
      :open="contextOpen"
      :x="contextPos.x"
      :y="contextPos.y"
      :items="contextItems"
      aria-label="助手回复操作"
      @select="onContextSelect"
      @close="contextOpen = false"
    />
  </div>
</template>

<style scoped>
/* hover 操作区:与 MessageUser 的 u-actions 同一套视觉(24px icon-btn,
   hover / 键盘 focus-within 时显形);基础规则在 conversation.css,这里补键盘可达 */
.foot-copy { width: 24px; height: 24px; opacity: 0; transition: opacity var(--dur-1); }
.msg-assistant:hover .foot-copy,
.msg-assistant:focus-within .foot-copy { opacity: 1; }
.foot-copy:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.plain-assistant-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
