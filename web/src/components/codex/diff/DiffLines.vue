<script setup lang="ts">
/**
 * DiffLines —— diff 行渲染器(.diff-lines > .dl 体系,样式见 styles/diff.css)
 *
 * 视图(顶部 .dl-viewbar 切换,组件内状态,只换渲染不改数据):
 * - unified(默认):双 gutter:del 行只左号(旧)、add 行只右号(新)、context 双号、hunk 行无号
 * - split:左旧右新双栏,各带行号;context 双侧相同,del 行右空、add 行左空
 *
 * 词级高亮(两种视图都生效):相邻 del→add 连续块按序配对(min(两侧行数) 对),
 * 每对先裁公共前缀/后缀(停在词中间时回退到词边界,不切半个标识符),
 * 中段按词(字母数字串)做 LCS 对齐,真正变化的词包 .dl-word-add/.dl-word-del
 * (深于行底色,底色优先于 tk-* token 字色,token span 嵌在词 span 内)。
 *
 * - 着色:原型期用简单正则近似 GitHub token 配色(tk-kw/str/cmt/num);
 *   ⚠️ 真实高亮轮次 3+ 接 shiki(决策见 prototype/diff.html 思考块),此处只是近似
 * - 折叠 hunk:单个 hunk 行数 > 8 时中间收起(头 5 + 尾 2 可见),
 *   渲染 .dl-collapsed「⋯ 显示折叠的 N 行 ⋯」,点击展开;两种视图共享同一 expanded 状态
 *
 * highlight:契约外补充 prop(默认 true),DiffView 用它接 DiffViewProps.syntaxHighlight。
 * compact:契约外补充 prop(默认 false),true 时不渲染视图切换条(审批卡 mini diff 场景;
 *   ApprovalCard 未传 compact 时由 .body-diff .dl-viewbar CSS 规则兜底隐藏)。
 */
import { computed, reactive, ref, watch } from 'vue';
import type { DiffHunk } from '../../../types/codex';
import CodexIcon from '../layout/CodexIcon.vue';

const props = withDefaults(
  defineProps<{ hunks: DiffHunk[]; highlight?: boolean; compact?: boolean }>(),
  { highlight: true, compact: false },
);

type ViewMode = 'unified' | 'split';
const view = ref<ViewMode>('unified');

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
// 词级 diff:公共前/后缀裁剪(词边界回退)+ 中段按词 LCS 对齐
// ---------------------------------------------------------------------------

/** 渲染段:普通段只有 tk-* token;词级差异段带 word 标记,外套 .dl-word-* 深底 */
interface Seg {
  toks: DiffTok[];
  word?: 'add' | 'del';
}

const WORD_CHAR = /[A-Za-z0-9_]/;
/** 切词:字母数字串为一个词,其余连续字符(空白/标点)各成一段,可无损拼接 */
const WORD_RE = /[A-Za-z0-9_]+|[^A-Za-z0-9_]+/g;
/** 单侧词数上限,超出退化为整段标变(防病态 LCS 开销) */
const WORD_LCS_LIMIT = 120;

/** 公共前缀长度 p 与公共后缀长度 s;前/后缀停在词中间时回退到词边界 */
function commonAffixes(a: string, b: string): [number, number] {
  const minLen = Math.min(a.length, b.length);
  let p = 0;
  while (p < minLen && a[p] === b[p]) p++;
  let s = 0;
  while (s < minLen - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  // 公共部分等于另一串时别回退成空(p 全串 = 纯插入/删除,整段标变才对)
  while (p > 0 && p < minLen && WORD_CHAR.test(a[p - 1]!)) p--;
  while (s > 0 && s < minLen - p && WORD_CHAR.test(a[a.length - s]!)) s--;
  return [p, s];
}

/** 词数组 LCS 对齐,返回两侧每个词是否「有变化」(不在最长公共子序列中) */
function alignWords(a: string[], b: string[]): [boolean[], boolean[]] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] =
        a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const ca = new Array<boolean>(n).fill(true);
  const cb = new Array<boolean>(m).fill(true);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ca[i] = cb[j] = false;
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  return [ca, cb];
}

interface WordPart {
  text: string;
  changed: boolean;
}

/** 相邻同标志的词合并成一个段 */
function mergeWords(words: string[], changed: boolean[]): WordPart[] {
  const out: WordPart[] = [];
  for (let i = 0; i < words.length; i++) {
    const last = out[out.length - 1];
    if (last && last.changed === changed[i]) last.text += words[i];
    else out.push({ text: words[i]!, changed: changed[i]! });
  }
  return out;
}

/**
 * 计算一对 del/add 行的词级差异段;行相同或无差异时返回 null。
 * 返回结构:[公共前缀, …中段(变化段带 word 标记)…, 公共后缀],各段已做 tk-* tokenize。
 */
function wordDiffSegs(
  oldText: string,
  newText: string,
): { delSegs: Seg[]; addSegs: Seg[] } | null {
  if (oldText === newText) return null;
  const [p, s] = commonAffixes(oldText, newText);
  const oldMid = oldText.slice(p, oldText.length - s);
  const newMid = newText.slice(p, newText.length - s);
  if (!oldMid && !newMid) return null;

  const oldWords = oldMid.match(WORD_RE) ?? [];
  const newWords = newMid.match(WORD_RE) ?? [];
  let oldParts: WordPart[];
  let newParts: WordPart[];
  if (oldWords.length > WORD_LCS_LIMIT || newWords.length > WORD_LCS_LIMIT) {
    oldParts = oldMid ? [{ text: oldMid, changed: true }] : [];
    newParts = newMid ? [{ text: newMid, changed: true }] : [];
  } else {
    const [ca, cb] = alignWords(oldWords, newWords);
    oldParts = mergeWords(oldWords, ca);
    newParts = mergeWords(newWords, cb);
  }

  const build = (text: string, parts: WordPart[], side: 'add' | 'del'): Seg[] => {
    const segs: Seg[] = [];
    if (p > 0) segs.push({ toks: tokenize(text.slice(0, p)) });
    for (const part of parts) {
      segs.push(part.changed ? { toks: tokenize(part.text), word: side } : { toks: tokenize(part.text) });
    }
    if (s > 0) segs.push({ toks: tokenize(text.slice(text.length - s)) });
    return segs;
  };
  return { delSegs: build(oldText, oldParts, 'del'), addSegs: build(newText, newParts, 'add') };
}

// ---------------------------------------------------------------------------
// 行模型:行号计数 + 词级差异标注 + 大 hunk 折叠标记;同时构建 split 双栏行
// ---------------------------------------------------------------------------
const COLLAPSE_THRESHOLD = 8;
const COLLAPSE_HEAD = 5;
const COLLAPSE_TAIL = 2;

interface Row {
  kind: 'context' | 'add' | 'del' | 'hunk';
  /** 原文(del/add 行词级配对用) */
  text: string;
  segs: Seg[];
  oldNo?: number;
  newNo?: number;
  hidden: boolean;
}

interface SplitCell {
  kind: 'context' | 'add' | 'del' | 'empty';
  no?: number;
  segs: Seg[];
}

type SplitRow =
  | { type: 'hunk'; text: string; hidden: boolean }
  | { type: 'line'; left: SplitCell; right: SplitCell; hidden: boolean };

interface HunkView {
  rows: Row[];
  splitRows: SplitRow[];
  /** 折叠条插入位置(unified = rows 下标,split = splitRows 下标);-1 = 不折叠 */
  barAt: number;
  splitBarAt: number;
  collapsed: number;
}

function emptyCell(): SplitCell {
  return { kind: 'empty', segs: [] };
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
        text: l.text,
        // hunk 头(@@ …)不着色,保持 .dl-hunk 的纯色样式
        segs: l.kind === 'hunk' ? [{ toks: [{ t: l.text }] }] : [{ toks: tokenize(l.text) }],
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

    // 词级高亮:del 连续块后紧跟 add 连续块时按序配对(配 min(两侧行数) 对)
    for (let i = 0; i < rows.length; ) {
      if (rows[i]!.kind !== 'del') {
        i++;
        continue;
      }
      let delEnd = i;
      while (rows[delEnd]?.kind === 'del') delEnd++;
      let addEnd = delEnd;
      while (rows[addEnd]?.kind === 'add') addEnd++;
      const pairCount = Math.min(delEnd - i, addEnd - delEnd);
      for (let k = 0; k < pairCount; k++) {
        const d = rows[i + k]!;
        const a = rows[delEnd + k]!;
        const wd = wordDiffSegs(d.text, a.text);
        if (wd) {
          d.segs = wd.delSegs;
          a.segs = wd.addSegs;
        }
      }
      i = addEnd;
    }

    // split 双栏行:hunk 整行;context 双侧相同;del/add 块按序并排,缺侧留空
    const splitRows: SplitRow[] = [];
    const sideCell = (r: Row): SplitCell => ({
      kind: r.kind as 'add' | 'del',
      no: r.kind === 'del' ? r.oldNo : r.newNo,
      segs: r.segs,
    });
    for (let i = 0; i < rows.length; ) {
      const row = rows[i]!;
      if (row.kind === 'hunk') {
        splitRows.push({ type: 'hunk', text: row.text, hidden: row.hidden });
        i++;
        continue;
      }
      if (row.kind === 'context') {
        splitRows.push({
          type: 'line',
          left: { kind: 'context', no: row.oldNo, segs: row.segs },
          right: { kind: 'context', no: row.newNo, segs: row.segs },
          hidden: row.hidden,
        });
        i++;
        continue;
      }
      let delEnd = i;
      while (rows[delEnd]?.kind === 'del') delEnd++;
      let addEnd = delEnd;
      while (rows[addEnd]?.kind === 'add') addEnd++;
      const dels = rows.slice(i, delEnd);
      const adds = rows.slice(delEnd, addEnd);
      const total = Math.max(dels.length, adds.length);
      for (let k = 0; k < total; k++) {
        const d = dels[k];
        const a = adds[k];
        splitRows.push({
          type: 'line',
          left: d ? sideCell(d) : emptyCell(),
          right: a ? sideCell(a) : emptyCell(),
          // 配对行只有两侧来源都被折叠时才折叠(边界跨折叠区时宁可多显示)
          hidden: (d?.hidden ?? true) && (a?.hidden ?? true),
        });
      }
      i = addEnd;
    }

    const splitBarAt = collapsible ? splitRows.findIndex((r) => r.hidden) : -1;
    return {
      rows,
      splitRows,
      barAt: collapsible ? COLLAPSE_HEAD : -1,
      splitBarAt,
      collapsed: collapsible ? hiddenEnd - COLLAPSE_HEAD : 0,
    };
  }),
);

/** 已展开的 hunk 下标(组件内状态,unified/split 共享) */
const expanded = reactive(new Set<number>());
function expand(hi: number) {
  expanded.add(hi);
}
watch(
  () => props.hunks,
  () => expanded.clear(),
);

// ---------------------------------------------------------------------------
// class 助手
// ---------------------------------------------------------------------------
function segCls(seg: Seg): string[] | undefined {
  return seg.word ? ['dl-word', `dl-word-${seg.word}`] : undefined;
}

function cellCls(cell: SplitCell): string | undefined {
  if (cell.kind === 'add') return 'dl-cell-add';
  if (cell.kind === 'del') return 'dl-cell-del';
  if (cell.kind === 'empty') return 'dl-cell-empty';
  return undefined;
}

function gutterCls(cell: SplitCell): string | undefined {
  if (cell.kind === 'add') return 'dl-gutter-add';
  if (cell.kind === 'del') return 'dl-gutter-del';
  if (cell.kind === 'empty') return 'dl-gutter-empty';
  return undefined;
}
</script>

<template>
  <div class="diff-lines" :class="{ 'diff-split': view === 'split' }">
    <div v-if="!compact" class="dl-viewbar">
      <button
        class="dl-view-btn"
        :class="{ active: view === 'unified' }"
        title="统一视图"
        @click="view = 'unified'"
      >
        <CodexIcon name="list" size="sm" />统一
      </button>
      <button
        class="dl-view-btn"
        :class="{ active: view === 'split' }"
        title="分栏视图"
        @click="view = 'split'"
      >
        <CodexIcon name="panel-side" size="sm" />分栏
      </button>
    </div>

    <!-- unified 单栏 -->
    <template v-if="view === 'unified'">
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
              ><span v-for="(seg, si) in row.segs" :key="si" :class="segCls(seg)"
                ><span v-for="(tok, ti) in seg.toks" :key="ti" :class="tok.c">{{ tok.t }}</span></span
              ></span
            >
          </div>
        </template>
      </template>
    </template>

    <!-- split 双栏(左旧右新) -->
    <template v-else>
      <template v-for="(h, hi) in hunkViews" :key="hi">
        <template v-for="(sr, sri) in h.splitRows" :key="sri">
          <div
            v-if="sri === h.splitBarAt && !expanded.has(hi)"
            class="dl-collapsed"
            @click="expand(hi)"
          >
            ⋯ 显示折叠的 {{ h.collapsed }} 行 ⋯
          </div>
          <div
            v-if="sr.type === 'hunk'"
            class="dl-split"
            :class="{ 'dl-hidden': sr.hidden && !expanded.has(hi) }"
          >
            <span class="dl-split-hunk">{{ sr.text }}</span>
          </div>
          <div
            v-else
            class="dl-split"
            :class="{ 'dl-hidden': sr.hidden && !expanded.has(hi) }"
          >
            <span class="dl-gutter" :class="gutterCls(sr.left)">{{ sr.left.no ?? '' }}</span>
            <span class="dl-cell" :class="cellCls(sr.left)"
              ><span class="dl-text"
                ><span v-for="(seg, si) in sr.left.segs" :key="si" :class="segCls(seg)"
                  ><span v-for="(tok, ti) in seg.toks" :key="ti" :class="tok.c">{{ tok.t }}</span></span
                ></span
              ></span
            >
            <span class="dl-gutter" :class="gutterCls(sr.right)">{{ sr.right.no ?? '' }}</span>
            <span class="dl-cell" :class="cellCls(sr.right)"
              ><span class="dl-text"
                ><span v-for="(seg, si) in sr.right.segs" :key="si" :class="segCls(seg)"
                  ><span v-for="(tok, ti) in seg.toks" :key="ti" :class="tok.c">{{ tok.t }}</span></span
                ></span
              ></span
            >
          </div>
        </template>
      </template>
    </template>
  </div>
</template>
