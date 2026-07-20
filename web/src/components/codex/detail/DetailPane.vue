<script setup lang="ts">
/**
 * DetailPane —— Inspect 右栏(⌘I,线程 / 思考 / 工具 / 任务)
 *
 * 行为(组件内,kimi3 域):
 * - open 状态:以 useUIState().detailPaneOpen 为准(props.open 保留契约,
 *   当前不驱动显隐;Esc 分层关闭由 useUIState.escClose 统一处理)
 * - tab 切换是组件内行为:本地 ref,跟随 props.tab 同步;切换时 emit('set-tab')
 * - × 关闭:emit('close') + ui.closeDetail()
 * - thinking tab:搜索(150ms 防抖 → 分片 <mark> 高亮,Enter/Shift+Enter 在
 *   命中间跳转,Esc 清空并失焦)+ 大纲锚点(可选 prop thinkingSegments,
 *   父级按 turn 传入;不传/空数组时退化为旧版单块全文)
 *
 * 契约缺口(已报备):ThreadMeta 无「分支」字段,原型 dp-kv 的分支行
 * 改渲染权限模式(manual/auto/yolo → 逐条确认/自动通过/完全自主)。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { DetailPaneProps, DetailPaneEmits, DetailPaneTab } from '../../../types/codex';
import type { PermissionMode } from '../../../types';
import CodexIcon from '../layout/CodexIcon.vue';
import { useUIState } from '../../../composables/codex/useUIState';

/**
 * 思考大纲段(父级按 turn 传入,label 如「turn 3 · 思考前 60 字…」)。
 * 本地交叉类型,不改 types/codex.ts 契约;父级接线稳定后可上提。
 * 与父级的约定:thinkingFullText 由各段文本以 '\n\n' 拼接,顺序与 segments 一致,
 * 组件按下标把切出的 chunk 与 segments 对齐(详见 thinkBlocks)。
 */
interface ThinkingSegment {
  id: string;
  label: string;
}

const props = defineProps<DetailPaneProps & { thinkingSegments?: ThinkingSegment[] }>();
const emit = defineEmits<DetailPaneEmits>();

const ui = useUIState();
const shown = computed(() => ui.detailPaneOpen.value);

const TABS: { id: DetailPaneTab; label: string }[] = [
  { id: 'thread', label: '线程' },
  { id: 'thinking', label: '思考' },
  { id: 'tools', label: '工具' },
  { id: 'tasks', label: '任务' },
];

const tab = ref<DetailPaneTab>(props.tab);
watch(
  () => props.tab,
  (t) => {
    tab.value = t;
  },
);
function setTab(t: DetailPaneTab) {
  tab.value = t;
  emit('set-tab', t);
}

function onClose() {
  emit('close');
  ui.closeDetail();
}

const PERM_LABEL: Record<PermissionMode, string> = {
  manual: '逐条确认',
  auto: '自动通过',
  yolo: '完全自主',
};

const ctxLabel = computed(
  () =>
    `上下文用量 · ${props.threadInfo.context.used} / ${props.threadInfo.context.total}(${props.threadInfo.context.pct}%)`,
);

const doneCount = computed(() => props.tasks.filter((t) => t.status === 'done').length);

function taskClass(status: 'pending' | 'in_progress' | 'done') {
  return status === 'in_progress' ? 'progress' : status;
}
function taskIcon(status: 'pending' | 'in_progress' | 'done') {
  return status === 'done' ? 'check-circle' : status === 'in_progress' ? 'circle-dot' : 'circle';
}
function toolStatusIcon(status: 'ok' | 'running' | 'error') {
  return status === 'ok' ? 'check' : status === 'error' ? 'x' : null;
}

// ---------------------------------------------------------------- thinking 分段 + 大纲

interface ThinkBlock {
  /** 段锚 id(渲染为 data-seg-id);退化的全文块为 ''(不渲染锚与标题行) */
  id: string;
  /** 段标题;退化块为 '' */
  label: string;
  text: string;
}

/**
 * 正文分块:有 segments 时按 '\n\n' 切全文并按下标与 segments 对齐;
 * chunk 比 segments 多时多余 chunk 并入最后一段(全文不丢),少时对应段正文为空。
 * 无 segments 时退化为单个全文块(渲染与旧版单 <pre> 一致)。
 */
const thinkBlocks = computed<ThinkBlock[]>(() => {
  const segs = props.thinkingSegments;
  if (!segs || segs.length === 0) {
    return [{ id: '', label: '', text: props.thinkingFullText }];
  }
  const chunks = props.thinkingFullText.split('\n\n');
  return segs.map((s, i) => ({
    id: s.id,
    label: s.label,
    text:
      i === segs.length - 1 && chunks.length > segs.length
        ? chunks.slice(i).join('\n\n')
        : (chunks[i] ?? ''),
  }));
});

const hasOutline = computed(() => (props.thinkingSegments?.length ?? 0) > 0);
/** 大纲最多直出 8 条,超出折叠为「…共 N 段」 */
const OUTLINE_MAX = 8;
const outlineItems = computed(() => thinkBlocks.value.slice(0, OUTLINE_MAX));

const thinkBodyRef = ref<HTMLElement | null>(null);

function scrollToSeg(id: string) {
  thinkBodyRef.value
    ?.querySelector(`[data-seg-id="${CSS.escape(id)}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------------------------------------------------------- thinking 搜索

const searchInput = ref(''); // 输入框即时值(v-model)
const query = ref(''); // 防抖后生效值(驱动高亮切分)
const activeHit = ref(0); // 当前命中的全局序号(跨段连续编号)
const SEARCH_DEBOUNCE = 150;

let searchTimer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(searchTimer));

function onSearchInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    query.value = searchInput.value;
  }, SEARCH_DEBOUNCE);
}

interface ThinkPart {
  text: string;
  hit: boolean;
  /** 命中片的全局序号;非命中片为 -1 */
  hitIdx: number;
}
interface RenderBlock extends ThinkBlock {
  /** null = 非搜索态,模板直接渲染 text;否则为「文本片 + mark 片」数组 */
  parts: ThinkPart[] | null;
}

/**
 * 高亮切分:indexOf 顺序扫(不用正则,免转义),大小写不敏感。
 * 只产出字符串片数组,模板 v-for 渲染 <mark>,不拼 HTML 字符串;
 * computed 缓存,仅 query / thinkBlocks 变化时重算。
 */
const searchRender = computed<{ blocks: RenderBlock[]; total: number }>(() => {
  const q = query.value;
  if (!q) return { blocks: thinkBlocks.value.map((b) => ({ ...b, parts: null })), total: 0 };
  const needle = q.toLowerCase();
  let total = 0;
  const blocks = thinkBlocks.value.map((b): RenderBlock => {
    const parts: ThinkPart[] = [];
    const lower = b.text.toLowerCase();
    let pos = 0;
    for (;;) {
      const idx = lower.indexOf(needle, pos);
      if (idx === -1) {
        if (pos < b.text.length) parts.push({ text: b.text.slice(pos), hit: false, hitIdx: -1 });
        break;
      }
      if (idx > pos) parts.push({ text: b.text.slice(pos, idx), hit: false, hitIdx: -1 });
      parts.push({ text: b.text.slice(idx, idx + q.length), hit: true, hitIdx: total });
      total += 1;
      pos = idx + q.length;
    }
    return { ...b, parts };
  });
  return { blocks, total };
});
const renderBlocks = computed(() => searchRender.value.blocks);
const totalHits = computed(() => searchRender.value.total);

function scrollToHit(idx: number) {
  void nextTick(() => {
    thinkBodyRef.value
      ?.querySelector(`mark[data-hit="${idx}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

watch(query, () => {
  activeHit.value = 0;
  if (query.value && totalHits.value > 0) scrollToHit(0);
});
// 流式追加 thinking 时命中总数会变,防止 activeHit 越界
watch(totalHits, (t) => {
  if (activeHit.value >= t) activeHit.value = 0;
});

function stepHit(delta: number) {
  const total = totalHits.value;
  if (total === 0) return;
  activeHit.value = (activeHit.value + delta + total) % total;
  scrollToHit(activeHit.value);
}

function onSearchKeydown(e: KeyboardEvent) {
  if (e.isComposing) return; // IME 候选确认键不拦截
  if (e.key === 'Enter') {
    e.preventDefault();
    stepHit(e.shiftKey ? -1 : 1);
  } else if (e.key === 'Escape') {
    // 组件内消费:清空 + 失焦;stopPropagation 防止冒泡到全局 Esc 分层关闭(误关整个面板)
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(searchTimer);
    searchInput.value = '';
    query.value = '';
    (e.target as HTMLInputElement).blur();
  }
}
</script>

<template>
  <aside class="detail-pane" :class="{ open: shown }">
    <div class="dp-head">
      <button
        v-for="t in TABS"
        :key="t.id"
        class="dp-tab"
        :class="{ active: tab === t.id }"
        @click="setTab(t.id)"
      >
        {{ t.label }}
      </button>
      <button class="icon-btn dp-close" title="关闭 Esc" @click="onClose">
        <CodexIcon name="x" size="sm" />
      </button>
    </div>

    <div class="dp-body">
      <div class="dp-pane" :class="{ active: tab === 'thread' }">
        <div class="dp-section">
          <div class="dp-label">线程信息</div>
          <div class="dp-kv">
            <span class="k">模型</span><span class="v">{{ props.threadInfo.model }}</span>
          </div>
          <div class="dp-kv">
            <span class="k">目录</span><span class="v">{{ props.threadInfo.workspace }}</span>
          </div>
          <div class="dp-kv">
            <span class="k">权限</span><span class="v">{{ PERM_LABEL[props.threadInfo.permission] }}</span>
          </div>
          <div class="dp-kv">
            <span class="k">创建</span><span class="v">{{ props.threadInfo.createdAt }}</span>
          </div>
        </div>
        <div class="dp-section">
          <div class="dp-label">{{ ctxLabel }}</div>
          <div class="ctx-bar">
            <div class="ctx-fill" :style="{ width: props.threadInfo.context.pct + '%' }"></div>
          </div>
        </div>
      </div>

      <div class="dp-pane" :class="{ active: tab === 'thinking' }">
        <div class="dp-section">
          <div class="dp-label">思考全文</div>

          <!-- 搜索:输入即高亮(150ms 防抖),Enter/Shift+Enter 跳转,Esc 清空并失焦 -->
          <div class="tk-search">
            <CodexIcon name="search" size="sm" />
            <input
              v-model="searchInput"
              class="tk-search-input"
              type="text"
              spellcheck="false"
              placeholder="搜索思考内容(Enter 下一个,Shift+Enter 上一个)"
              @input="onSearchInput"
              @keydown="onSearchKeydown"
            />
            <span v-if="query" class="tk-search-count">
              {{ totalHits === 0 ? 0 : activeHit + 1 }}/{{ totalHits }}
            </span>
          </div>

          <!-- 大纲:有 segments 时显示,最多 8 条,超出「…共 N 段」;搜索态下仍可点 -->
          <nav v-if="hasOutline" class="tk-outline">
            <button
              v-for="item in outlineItems"
              :key="item.id"
              class="tk-outline-item"
              :title="item.label"
              @click="scrollToSeg(item.id)"
            >
              {{ item.label }}
            </button>
            <span v-if="thinkBlocks.length > OUTLINE_MAX" class="tk-outline-more">
              …共 {{ thinkBlocks.length }} 段
            </span>
          </nav>

          <!-- 正文:有 segments 分段渲染(data-seg-id 锚 + 段标题行),无则单块全文(同旧版) -->
          <div ref="thinkBodyRef" class="dp-thinking-content">
            <div
              v-for="b in renderBlocks"
              :key="b.id || '__full'"
              class="tk-block"
              :data-seg-id="b.id || undefined"
            >
              <div v-if="b.label" class="tk-seg-title">{{ b.label }}</div>
              <template v-if="b.parts"><template v-for="(p, pi) in b.parts" :key="pi"><mark v-if="p.hit" class="tk-hit" :class="{ current: p.hitIdx === activeHit }" :data-hit="p.hitIdx">{{ p.text }}</mark><template v-else>{{ p.text }}</template></template></template>
              <template v-else>{{ b.text }}</template>
            </div>
          </div>
        </div>
      </div>

      <div class="dp-pane" :class="{ active: tab === 'tools' }">
        <div class="dp-section">
          <div class="dp-label">工具调用 · {{ props.toolCalls.length }}</div>
          <div v-for="c in props.toolCalls" :key="c.id" class="dp-tool-item">
            <span class="tool-icon"><CodexIcon name="terminal" /></span>
            <span class="t-name">{{ c.name }}</span>
            <span class="t-detail">{{ c.arg }}</span>
            <span class="t-status">
              <CodexIcon v-if="toolStatusIcon(c.status)" :name="toolStatusIcon(c.status)!" />
              <span v-else class="dot dot-running"></span>
            </span>
          </div>
        </div>
      </div>

      <div class="dp-pane" :class="{ active: tab === 'tasks' }">
        <div class="dp-section">
          <div class="dp-label">任务 · {{ doneCount }}/{{ props.tasks.length }}</div>
          <div v-for="(t, i) in props.tasks" :key="i" class="dp-task" :class="taskClass(t.status)">
            <span class="todo-state"><CodexIcon :name="taskIcon(t.status)" /></span>
            <span>{{ t.title }}</span>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
/* thinking tab 搜索 + 大纲(只放组件 scoped,detail.css 不动) */
.tk-search {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  padding: 5px 8px;
  border: 1px solid var(--border-soft);
  border-radius: var(--r-md);
  background: var(--bg);
  color: var(--text-3);
}
.tk-search:focus-within {
  border-color: var(--accent-bd);
}
.tk-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--text-sm);
  color: var(--text);
}
.tk-search-input::placeholder {
  color: var(--text-3);
}
.tk-search-count {
  flex: none;
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.tk-outline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}
.tk-outline-item {
  max-width: 100%;
  padding: 2px 10px;
  border: 1px solid var(--border-soft);
  border-radius: var(--r-full);
  background: transparent;
  font-size: 11px;
  color: var(--text-2);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: background var(--dur-1), color var(--dur-1);
}
.tk-outline-item:hover {
  background: var(--hover);
  color: var(--text);
}
.tk-outline-more {
  font-size: 11px;
  color: var(--text-3);
}

.tk-block + .tk-block {
  margin-top: 14px;
}
.tk-seg-title {
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
}

.tk-hit {
  background: var(--warning-soft);
  color: inherit;
  border-radius: 2px;
  box-shadow: 0 0 0 1px var(--warning-bd);
}
.tk-hit.current {
  background: var(--warning);
  color: var(--on-accent);
}
</style>
