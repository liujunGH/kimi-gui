<script setup lang="ts">
/**
 * DiffLines —— diff 行渲染器(.diff-lines > .dl 体系,样式见 styles/diff.css)
 *
 * - 双 gutter:del 行只左号(旧)、add 行只右号(新)、context 双号、hunk 行无号
 * - 着色:原型期用简单正则近似 GitHub token 配色(tk-kw/str/cmt/num);
 *   ⚠️ 真实高亮轮次 3+ 接 shiki(决策见 prototype/diff.html 思考块),此处只是近似
 * - 折叠 hunk:单个 hunk 行数 > 8 时中间收起(头 5 + 尾 2 可见),
 *   渲染 .dl-collapsed「⋯ 显示折叠的 N 行 ⋯」,点击展开(组件内行为,
 *   对应 prototype mock/shared.js bindCollapsedHunks)
 *
 * highlight:契约外补充 prop(默认 true),DiffView 用它接 DiffViewProps.syntaxHighlight。
 */
import { computed, reactive, watch } from 'vue';
import type { DiffHunk } from '../../../types/codex';

const props = withDefaults(defineProps<{ hunks: DiffHunk[]; highlight?: boolean }>(), {
  highlight: true,
});

// ---------------------------------------------------------------------------
// 简化着色(轮次 3+ 换 shiki,token class 保持 tk-* 不变)
// 分组顺序即优先级:注释 > 字符串 > 关键字 > 数字
// ---------------------------------------------------------------------------
const HL_RE =
  /(\/\/.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|\b(import|export|from|const|await|function|return)\b|(\d+(?:\.\d+)?)/g;

interface DiffTok {
  t: string;
  c?: string;
}

function tokenize(text: string): DiffTok[] {
  if (!props.highlight || !text) return [{ t: text }];
  const out: DiffTok[] = [];
  let last = 0;
  for (const m of text.matchAll(HL_RE)) {
    const i = m.index;
    if (i > last) out.push({ t: text.slice(last, i) });
    const c = m[1] ? 'tk-cmt' : m[2] ? 'tk-str' : m[3] ? 'tk-kw' : 'tk-num';
    out.push({ t: m[0], c });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}

// ---------------------------------------------------------------------------
// 行模型:行号计数 + 大 hunk 折叠标记
// ---------------------------------------------------------------------------
const COLLAPSE_THRESHOLD = 8;
const COLLAPSE_HEAD = 5;
const COLLAPSE_TAIL = 2;

interface Row {
  kind: 'context' | 'add' | 'del' | 'hunk';
  toks: DiffTok[];
  oldNo?: number;
  newNo?: number;
  hidden: boolean;
}

interface HunkView {
  rows: Row[];
  /** 折叠条插入位置(某行之前);-1 = 不折叠 */
  barAt: number;
  collapsed: number;
}

const hunkViews = computed<HunkView[]>(() =>
  props.hunks.map((h) => {
    let oldNo = h.oldStart;
    let newNo = h.newStart;
    const lines = h.lines;
    const collapsible = lines.length > COLLAPSE_THRESHOLD;
    const hiddenEnd = lines.length - COLLAPSE_TAIL;
    const rows: Row[] = lines.map((l, i) => {
      const row: Row = {
        kind: l.kind,
        // hunk 头(@@ …)不着色,保持 .dl-hunk 的纯色样式
        toks: l.kind === 'hunk' ? [{ t: l.text }] : tokenize(l.text),
        hidden: collapsible && i >= COLLAPSE_HEAD && i < hiddenEnd,
      };
      if (l.kind === 'context') {
        row.oldNo = oldNo++;
        row.newNo = newNo++;
      } else if (l.kind === 'del') {
        row.oldNo = oldNo++;
      } else if (l.kind === 'add') {
        row.newNo = newNo++;
      }
      return row;
    });
    return {
      rows,
      barAt: collapsible ? COLLAPSE_HEAD : -1,
      collapsed: collapsible ? hiddenEnd - COLLAPSE_HEAD : 0,
    };
  }),
);

/** 已展开的 hunk 下标(组件内状态) */
const expanded = reactive(new Set<number>());
function expand(hi: number) {
  expanded.add(hi);
}
watch(
  () => props.hunks,
  () => expanded.clear(),
);
</script>

<template>
  <div class="diff-lines">
    <template v-for="(h, hi) in hunkViews" :key="hi">
      <template v-for="(row, ri) in h.rows" :key="ri">
        <div
          v-if="ri === h.barAt && !expanded.has(hi)"
          class="dl-collapsed"
          @click="expand(hi)"
        >
          ⋯ 显示折叠的 {{ h.collapsed }} 行 ⋯
        </div>
        <div
          class="dl"
          :class="{
            'dl-hunk': row.kind === 'hunk',
            'dl-add': row.kind === 'add',
            'dl-del': row.kind === 'del',
            'dl-hidden': row.hidden && !expanded.has(hi),
          }"
        >
          <span class="dl-gutter">{{ row.oldNo ?? '' }}</span>
          <span class="dl-gutter">{{ row.newNo ?? '' }}</span>
          <span class="dl-sign">{{ row.kind === 'add' ? '+' : row.kind === 'del' ? '−' : '' }}</span>
          <span class="dl-text"
            ><span v-for="(tok, ti) in row.toks" :key="ti" :class="tok.c">{{ tok.t }}</span></span
          >
        </div>
      </template>
    </template>
  </div>
</template>
