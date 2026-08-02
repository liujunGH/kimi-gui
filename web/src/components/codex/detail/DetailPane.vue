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
import type { DetailPaneProps, DetailPaneTab, ChangedFile } from '../../../types/codex';
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

interface InspectTask {
  id: string;
  name: string;
  kind: string;
  state: 'run' | 'done' | 'fail';
  timing: string;
  meta?: string;
  suspendedReason?: string;
}
interface InspectGoal {
  objective: string;
  status: 'active' | 'paused' | 'blocked' | 'complete';
  turnsUsed: number;
  tokensUsed: number;
  wallClockMs: number;
  remainingTokens?: number | null;
  remainingTurns?: number | null;
}
interface InspectAutomation {
  id: string;
  schedule?: string;
  recurring?: boolean;
  missedCount?: number;
  stale?: boolean;
  time?: string;
}
interface InspectRuntime {
  activity: string;
  branch?: string;
  ahead?: number;
  behind?: number;
  changes: ChangedFile[];
  additions: number;
  deletions: number;
  tasks: InspectTask[];
  goal?: InspectGoal | null;
  automations: InspectAutomation[];
  sessionCost: number;
  warnings: number;
}

const props = defineProps<DetailPaneProps & {
  thinkingSegments?: ThinkingSegment[];
  inspect?: InspectRuntime;
}>();
const emit = defineEmits<{
  (e: 'set-tab', t: DetailPaneTab): void;
  (e: 'close'): void;
  (e: 'open-review', path?: string): void;
  (e: 'open-task', id: string): void;
  (e: 'launch-prompt', text: string): void;
}>();

const ui = useUIState();
const shown = computed(() => ui.detailPaneOpen.value);

const TABS: { id: DetailPaneTab; label: string }[] = [
  { id: 'thread', label: '概览' },
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
  yolo: 'YOLO',
  auto: '自动',
};

const ctxLabel = computed(
  () =>
    `上下文用量 · ${props.threadInfo.context.used} / ${props.threadInfo.context.total}(${props.threadInfo.context.pct}%)`,
);

const doneCount = computed(() => props.tasks.filter((t) => t.status === 'done').length);
const activeRuntimeTasks = computed(() => props.inspect?.tasks.filter((t) => t.state === 'run') ?? []);
const completedRuntimeTasks = computed(() => props.inspect?.tasks.filter((t) => t.state !== 'run') ?? []);

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  const seconds = Math.round(ms / 1_000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

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
  <aside v-if="shown" class="detail-pane open">
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
          <div class="dp-label">会话</div>
          <div class="dp-runtime-row">
            <span class="dot" :class="props.inspect?.activity === 'running' ? 'dot-running' : 'dot-idle'"></span>
            <strong>{{ props.inspect?.activity === 'running' ? '正在运行' : props.inspect?.activity === 'waiting' ? '等待操作' : '空闲' }}</strong>
            <span v-if="props.inspect?.warnings" class="pill warning">{{ props.inspect.warnings }} 个警告</span>
          </div>
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
            <span class="k">最近活动</span><span class="v">{{ props.threadInfo.createdAt }}</span>
          </div>
          <div class="dp-kv">
            <span class="k">成本</span><span class="v">{{ props.inspect?.sessionCost ? `$${props.inspect.sessionCost.toFixed(4)}` : '—' }}</span>
          </div>
        </div>
        <div class="dp-section">
          <div class="dp-label">{{ ctxLabel }}</div>
          <div class="ctx-bar">
            <div class="ctx-fill" :style="{ width: props.threadInfo.context.pct + '%' }"></div>
          </div>
        </div>
        <div class="dp-section">
          <div class="dp-label">Git 工作树</div>
          <div class="dp-kv"><span class="k">分支</span><span class="v">{{ props.inspect?.branch || '非 Git 工作区' }}</span></div>
          <div v-if="props.inspect?.branch" class="dp-kv"><span class="k">同步</span><span class="v">↑{{ props.inspect.ahead ?? 0 }} ↓{{ props.inspect.behind ?? 0 }}</span></div>
          <button v-if="props.inspect?.changes.length" class="dp-summary-action" @click="emit('open-review')">
            <span><strong>{{ props.inspect.changes.length }} 个文件</strong><small><b>+{{ props.inspect.additions }}</b> <em>-{{ props.inspect.deletions }}</em></small></span>
            <CodexIcon name="chevron-right" />
          </button>
          <div v-else class="dp-empty">工作树干净</div>
          <button v-for="file in props.inspect?.changes.slice(0, 8)" :key="file.path" class="dp-file" @click="emit('open-review', file.path)">
            <span class="change-badge">{{ file.status }}</span><span>{{ file.path }}</span><small v-if="file.additions !== undefined || file.deletions !== undefined"><b>+{{ file.additions ?? 0 }}</b> <em>-{{ file.deletions ?? 0 }}</em></small>
          </button>
          <div v-if="(props.inspect?.changes.length ?? 0) > 8" class="dp-empty">还有 {{ props.inspect!.changes.length - 8 }} 个文件</div>
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
        <div v-if="props.inspect?.goal" class="dp-section">
          <div class="dp-label">目标</div>
          <div class="dp-goal">
            <div><strong>{{ props.inspect.goal.objective }}</strong><span class="pill" :class="{ success: props.inspect.goal.status === 'complete', warning: props.inspect.goal.status === 'blocked' }">{{ props.inspect.goal.status }}</span></div>
            <small>{{ props.inspect.goal.turnsUsed }} turns · {{ props.inspect.goal.tokensUsed.toLocaleString() }} tokens · {{ formatDuration(props.inspect.goal.wallClockMs) }}</small>
            <small v-if="props.inspect.goal.remainingTurns !== null && props.inspect.goal.remainingTurns !== undefined">剩余 {{ props.inspect.goal.remainingTurns }} turns</small>
          </div>
        </div>
        <div class="dp-section">
          <div class="dp-label">计划清单 · {{ doneCount }}/{{ props.tasks.length }}</div>
          <div v-for="(t, i) in props.tasks" :key="i" class="dp-task" :class="taskClass(t.status)">
            <span class="todo-state"><CodexIcon :name="taskIcon(t.status)" /></span>
            <span>{{ t.title }}</span>
          </div>
          <div v-if="!props.tasks.length" class="dp-empty">Agent 尚未建立计划</div>
        </div>
        <div class="dp-section">
          <div class="dp-label">Agents 与后台任务 · {{ activeRuntimeTasks.length }} 运行中</div>
          <button v-for="task in activeRuntimeTasks" :key="task.id" class="dp-runtime-task running" @click="emit('open-task', task.id)">
            <span class="dot dot-running"></span><span><strong>{{ task.name }}</strong><small>{{ task.kind }} · {{ task.timing }}<template v-if="task.suspendedReason"> · {{ task.suspendedReason }}</template></small></span><CodexIcon name="chevron-right" />
          </button>
          <button v-for="task in completedRuntimeTasks.slice(0, 8)" :key="task.id" class="dp-runtime-task" @click="emit('open-task', task.id)">
            <CodexIcon :name="task.state === 'done' ? 'check-circle' : 'alert-triangle'" /><span><strong>{{ task.name }}</strong><small>{{ task.kind }} · {{ task.timing }}</small></span><CodexIcon name="chevron-right" />
          </button>
          <div v-if="!props.inspect?.tasks.length" class="dp-empty">没有 Agent 或后台任务</div>
        </div>
        <div class="dp-section">
          <div class="dp-section-head"><div class="dp-label">自动化历史</div><button @click="emit('launch-prompt', '请创建一个定时任务：')"><CodexIcon name="plus" /> 创建</button></div>
          <div v-for="job in props.inspect?.automations" :key="job.id" class="dp-automation">
            <CodexIcon name="clock" /><span><strong>{{ job.schedule || job.id }}</strong><small>{{ job.recurring ? '循环' : '单次' }}<template v-if="job.time"> · {{ job.time }}</template><template v-if="job.missedCount"> · 补跑 {{ job.missedCount }} 次</template></small></span><span v-if="job.stale" class="pill warning">过期</span>
          </div>
          <div v-if="!props.inspect?.automations.length" class="dp-empty">本会话没有自动化触发记录</div>
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
