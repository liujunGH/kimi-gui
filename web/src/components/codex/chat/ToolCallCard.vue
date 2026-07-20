<script setup lang="ts">
/**
 * ToolCallCard —— 工具调用卡(克制版展开)
 *
 * - 头部单击:有 output 或可构造 diff 时可展开/收起(chevron 旋转);
 *   不可展开时保持旧行为,emit('inspect') 开右栏 Tools 面板
 * - 展开区:edit/write 形态(old_string/new_string 或 path+content)优先渲染
 *   codex DiffLines(compact,单 hunk,LCS 由 lib/diffLines 计算);通用 output
 *   等宽 <pre>(max-height 内部滚动,超 200 行截断并提示);末尾 <details> 收着
 *   完整 arg JSON
 * - 状态:ok → 绿色对勾;running → 蓝点呼吸(保留);error → 红
 */
import { computed, ref } from 'vue';
import type { DiffHunk, ToolCallCardProps, ToolCallCardEmits } from '../../../types/codex';
import { buildDiffLines } from '../../../lib/diffLines';
import CodexIcon from '../layout/CodexIcon.vue';
import DiffLines from '../diff/DiffLines.vue';

const props = defineProps<ToolCallCardProps>();
const emit = defineEmits<ToolCallCardEmits>();

const statusIcon = computed(() =>
  props.call.status === 'ok' ? 'check' : props.call.status === 'error' ? 'x' : null,
);

// ---------------------------------------------------------------------------
// arg 解析(arg 恒为字符串:messagesToTurns 对 object input 做 JSON.stringify)
// ---------------------------------------------------------------------------
const argObj = computed<Record<string, unknown> | null>(() => {
  const s = (props.call.arg ?? '').trim();
  if (!s.startsWith('{')) return null;
  try {
    const v: unknown = JSON.parse(s);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
});

/**
 * edit/write 工具的行级 diff:edit(old_string/new_string)走 LCS,context 行
 * 保留;write(path+content)无 before 可读,构造 from-empty 的全 add diff(覆写
 * 场景会显示为纯新增,见交接说明)。replace_all / 超大输入(LCS 上限)构造不了,
 * 返回 null 退化 <pre>。单 hunk、行号从 1 起(与官方 buildEditDiffLines 一致)。
 */
const editHunks = computed<DiffHunk[] | null>(() => {
  const d = argObj.value;
  if (!d || d.replace_all === true) return null;
  const oldS = typeof d.old_string === 'string' ? d.old_string : undefined;
  const newS = typeof d.new_string === 'string' ? d.new_string : undefined;
  let rows = null as ReturnType<typeof buildDiffLines>;
  if (oldS !== undefined && newS !== undefined) {
    rows = buildDiffLines(oldS, newS);
  } else {
    const kind = props.call.name.trim().toLowerCase().replace(/[\s-]+/g, '_');
    const writeLike = kind === 'write' || kind === 'write_file' || kind === 'writefile';
    const content = typeof d.content === 'string' ? d.content : undefined;
    if (content !== undefined && (writeLike || typeof d.path === 'string')) {
      rows = buildDiffLines('', content);
    }
  }
  if (!rows || rows.length === 0) return null;
  return [
    {
      oldStart: 1,
      newStart: 1,
      lines: rows.map((r) => ({ kind: r.type, text: r.text })),
    },
  ];
});

// ---------------------------------------------------------------------------
// output:截断渲染 + 提示
// ---------------------------------------------------------------------------
const MAX_OUTPUT_LINES = 200;
const outputLines = computed(() => props.call.output ?? []);
const hasOutput = computed(() => outputLines.value.length > 0);
const truncated = computed(() => outputLines.value.length > MAX_OUTPUT_LINES);
const outputText = computed(() =>
  (truncated.value ? outputLines.value.slice(0, MAX_OUTPUT_LINES) : outputLines.value).join('\n'),
);

const hasArg = computed(() => (props.call.arg ?? '').trim().length > 0);
const prettyArg = computed(() => {
  const d = argObj.value;
  if (d) {
    try {
      return JSON.stringify(d, null, 2);
    } catch {
      /* fall through to raw */
    }
  }
  return props.call.arg;
});

// ---------------------------------------------------------------------------
// 展开/收起
// ---------------------------------------------------------------------------
const expandable = computed(() => hasOutput.value || editHunks.value !== null);
const open = ref(props.call.defaultExpanded === true && expandable.value);

function onHeadClick(): void {
  if (expandable.value) open.value = !open.value;
  else emit('inspect');
}
</script>

<template>
  <div class="tool-call">
    <button
      type="button"
      class="tool-head"
      :aria-expanded="expandable ? open : undefined"
      @click="onHeadClick"
    >
      <span class="tool-icon"><CodexIcon name="terminal" /></span>
      <span class="tool-name">{{ props.call.name }}</span>
      <span class="tool-detail">{{ props.call.arg }}</span>
      <span class="tool-status">
        <CodexIcon v-if="statusIcon" :name="statusIcon" />
        <span v-else class="dot dot-running"></span>
      </span>
      <span v-if="expandable" class="tool-chevron" :class="{ open }">
        <CodexIcon name="chevron-down" />
      </span>
    </button>

    <div v-if="open && expandable" class="tool-body">
      <DiffLines v-if="editHunks" :hunks="editHunks" compact />
      <template v-if="hasOutput">
        <pre class="tool-out">{{ outputText }}</pre>
        <div v-if="truncated" class="tool-note">
          输出过长已截断,仅显示前 {{ MAX_OUTPUT_LINES }} / {{ outputLines.length }} 行
        </div>
      </template>
      <details v-if="hasArg" class="tool-args">
        <summary>参数</summary>
        <pre class="tool-out">{{ prettyArg }}</pre>
      </details>
    </div>
  </div>
</template>

<style scoped>
/* 全局 .tool-call 带 cursor:pointer(整卡可点的旧行为);现在只有头部可点,
   展开区恢复文本光标以便选中复制 */
.tool-call {
  cursor: default;
}
.tool-head {
  cursor: pointer;
  /* div → button 的 UA 样式 reset:布局/配色仍由 conversation.css 的 .tool-head 承担 */
  width: 100%;
  border: none;
  background: none;
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  text-align: left;
}
.tool-head:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.tool-chevron {
  width: 16px;
  height: 16px;
  flex: none;
  display: grid;
  place-items: center;
  color: var(--text-3);
  transform: rotate(-90deg);
  transition: transform var(--dur-1) var(--ease);
}
.tool-chevron.open {
  transform: none;
}
.tool-chevron .ic {
  width: 12px;
  height: 12px;
}
/* .tool-body 容器沿用 conversation.css 全局样式(border-top + padding + 等宽) */
.tool-body > * + * {
  margin-top: 8px;
}
.tool-out {
  margin: 0;
  padding: 8px 10px;
  max-height: 240px;
  overflow: auto;
  white-space: pre;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--text-2);
  background: var(--bg);
  border: 1px solid var(--border-soft);
  border-radius: var(--r-md);
}
.tool-note {
  font-size: var(--text-xs);
  color: var(--text-3);
}
.tool-args summary {
  cursor: pointer;
  font-size: var(--text-xs);
  color: var(--text-3);
}
.tool-args summary:hover {
  color: var(--text-2);
}
.tool-args .tool-out {
  margin-top: 6px;
}
</style>
