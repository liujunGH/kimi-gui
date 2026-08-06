<script setup lang="ts">
/**
 * ConversationPane —— 对话流容器
 *
 * - 按 turns 有序渲染 MessageUser / MessageAssistant
 * - 窗口化渲染(轮次 4d):默认只挂最后 PAGE 条 turn,滚动到顶自动加载更早
 *   (长会话几百轮时避免全量 Markdown + ThinkingBlock + ToolCallCard 挂载卡顿)
 * - 末尾:无法锚定到历史 tool-use 的 pendingApprovals → ApprovalCard;turnProgress → TurnProgress
 * - 滚锚(Q4 归 kimi3):用户贴底时新内容自动跟随;上翻后不抢滚动;
 *   前插加载时保持视口位置(scrollTop 按新增高度补偿)
 */
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ConversationPaneProps, ConversationPaneEmits } from '../../../types/codex';
import type { ChatTurn } from '../../../types';
import CodexIcon from '../layout/CodexIcon.vue';
import MessageUser from './MessageUser.vue';
import TurnProgress from './TurnProgress.vue';
import ConversationToc, { type ConversationTocItem } from '../../chat/ConversationToc.vue';

const MessageAssistant = defineAsyncComponent(() => import('./MessageAssistant.vue'));

const props = withDefaults(
  defineProps<ConversationPaneProps & {
    /** daemon 是否有更多更早消息(控制"加载更早"按钮显隐) */
    hasMoreMessages?: boolean;
    /** daemon 正在加载更早(按钮禁用 + spinner) */
    loadingMore?: boolean;
  }>(),
  { hasMoreMessages: false, loadingMore: false },
);
const emit = defineEmits<ConversationPaneEmits & {
  (e: 'inspect', tab: 'thinking' | 'tools'): void;
  (e: 'load-older'): void;
  /** MessageUser 的「编辑重发」透传(本地交叉类型,不改契约文件) */
  (e: 'edit-message', turn: ChatTurn): void;
  /** 消息右键「引用到输入框」 */
  (e: 'quote-message', text: string): void;
  /** 消息右键「分叉当前会话」 */
  (e: 'fork-session'): void;
  /** 压缩分隔线点击 → 父级在右栏展示该 turn 的摘要文本 */
  (e: 'view-compaction', turn: ChatTurn): void;
}>();

const PAGE = 50;
const scrollEl = ref<HTMLElement | null>(null);
const contentEl = ref<HTMLElement | null>(null);
const sentinelEl = ref<HTMLElement | null>(null);
const nearBottom = ref(true);
const visibleCount = ref(PAGE);
// 首次挂载/切换会话时先锁住实时末端。否则顶部 IntersectionObserver
// 可能在首个 nextTick 前抢先加载历史消息，浏览器的原生滚动锚定会把视口留在中段。
const initialTailPending = ref(true);

const total = computed(() => props.turns.length);
const shownTurns = computed(() => props.turns.slice(Math.max(0, total.value - visibleCount.value)));
const hiddenCount = computed(() => total.value - shownTurns.value.length);
/** 是否显示"加载更早"按钮:本地有更多 hidden,或 daemon 有更多 */
const canLoadMore = computed(() => hiddenCount.value > 0 || props.hasMoreMessages);
const lastTurnId = computed(() => props.turns[props.turns.length - 1]?.id);

// ConversationToc:每轮 user query 一条竖条(hover 展开 label)
function tocTitle(turn: ChatTurn): string {
  const text = turn.text?.trim();
  if (text) return text.length > 60 ? text.slice(0, 60) + '…' : text;
  if ((turn.tools?.length ?? 0) > 0) return `${turn.tools!.length} tools`;
  return 'kimi';
}
const tocItems = computed<ConversationTocItem[]>(() => {
  // Only mounted turns are navigable. Keeping the TOC inside the same window
  // prevents thousands of hidden anchors from defeating conversation paging.
  const start = Math.max(0, total.value - visibleCount.value);
  let userNo = 0;
  for (let i = 0; i < start; i++) {
    if (props.turns[i]?.role === 'user') userNo++;
  }
  return shownTurns.value
    .filter((t) => t.role === 'user')
    .map((t) => ({ id: t.id, role: 'user', no: ++userNo, title: tocTitle(t) }));
});
const activeTurnId = ref<string | null>(null);
function updateActiveToc() {
  const el = scrollEl.value;
  if (!el) return;
  const mid = el.scrollTop + el.clientHeight / 2;
  // 找到最接近视口中部的 user turn 元素
  const items = el.querySelectorAll<HTMLElement>('[data-turn-id]');
  let best: string | null = null;
  let bestDist = Infinity;
  for (const item of items) {
    const top = item.offsetTop - el.offsetTop;
    const dist = Math.abs(top + item.offsetHeight / 2 - mid);
    if (dist < bestDist) {
      bestDist = dist;
      best = item.dataset.turnId ?? null;
    }
  }
  activeTurnId.value = best;
}
function onTocSelect(turnId: string) {
  const el = scrollEl.value;
  if (!el) return;
  const target = el.querySelector<HTMLElement>(`[data-turn-id="${turnId}"]`);
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 产品入口会传 sessionId；因此真正的会话切换不再依赖首条 turn 猜测。
// fallback 仅供 demo/旧调用方使用：旧首 turn 仍在代表 daemon 前插了历史。
watch(
  () => props.turns[0]?.id,
  (_first, prevFirst) => {
    if (props.sessionId) return;
    if (prevFirst && props.turns.some((t) => t.id === prevFirst)) return;
    visibleCount.value = PAGE;
    nearBottom.value = true;
    void settleInitialTail();
  },
);

// 滚动事件可能高频触发:updateActiveToc 有 querySelectorAll 全量遍历,rAF 节流
let scrollRaf = 0;
function onScroll() {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0;
    const el = scrollEl.value;
    if (!el) return;
    // 初始化期间的滚动全部来自程序写入；不让中间帧误判为用户上翻。
    nearBottom.value = initialTailPending.value
      || el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    updateActiveToc();
  });
}

function scrollToBottom() {
  const el = scrollEl.value;
  if (!el) return;
  // Hide the control immediately, while preserving native smooth scrolling.
  // Subsequent streaming updates keep following because the user explicitly
  // chose to return to the live edge.
  nearBottom.value = true;
  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
}

async function loadMore() {
  const el = scrollEl.value;
  if (!el) return;
  // 先扩本地窗口(切片更多已有 turns)
  if (hiddenCount.value > 0) {
    const prevHeight = el.scrollHeight;
    const prevTop = el.scrollTop;
    visibleCount.value += PAGE;
    await nextTick();
    el.scrollTop = prevTop + (el.scrollHeight - prevHeight);
  }
  // 如果本地窗口已全展开(没有更多本地 turns),请求 daemon 加载更早消息
  if (hiddenCount.value <= 0) {
    emit('load-older');
  }
}

async function maybeFollow() {
  await nextTick();
  const el = scrollEl.value;
  if (el && nearBottom.value) el.scrollTop = el.scrollHeight;
}

let initialTailRaf = 0;
let initialTailGeneration = 0;
async function settleInitialTail() {
  const generation = ++initialTailGeneration;
  initialTailPending.value = true;
  nearBottom.value = true;
  await nextTick();
  cancelAnimationFrame(initialTailRaf);

  // 两个布局帧都写到底部：第一帧处理 Vue DOM，第二帧覆盖异步组件首次落位
  // 和浏览器原生 scroll anchoring。最多锁 8 帧，避免正在流式输出时阻止用户上翻；
  // 之后 ResizeObserver 接管图片/Markdown 增高。
  let stableFrames = 0;
  let frames = 0;
  let previousHeight = -1;
  const pin = () => {
    if (generation !== initialTailGeneration) return;
    const el = scrollEl.value;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    nearBottom.value = true;
    const height = el.scrollHeight;
    frames++;
    stableFrames = height === previousHeight ? stableFrames + 1 : 0;
    previousHeight = height;
    if (stableFrames >= 2 || frames >= 8) {
      initialTailPending.value = false;
      updateActiveToc();
      return;
    }
    initialTailRaf = requestAnimationFrame(pin);
  };
  initialTailRaf = requestAnimationFrame(pin);
}

watch(
  () => props.sessionId,
  (next, prev) => {
    if (next === prev) return;
    visibleCount.value = PAGE;
    void settleInitialTail();
  },
  { flush: 'post' },
);

watch(
  () => [props.turns.length, props.turns[props.turns.length - 1]?.blocks?.length],
  maybeFollow,
);

// 顶部哨兵:进入视口自动加载更早
let observer: IntersectionObserver | null = null;
// 滚锚 ResizeObserver(轮次 5):内容高度变化(流式文本/图片/思考块展开)或
// 视口尺寸变化时,用户贴底则直接跟到底;比 watch(turns/blocks 数量)覆盖更全
let resizeObserver: ResizeObserver | null = null;
function followBottom() {
  const el = scrollEl.value;
  if (el && (initialTailPending.value || nearBottom.value)) el.scrollTop = el.scrollHeight;
}
onMounted(() => {
  void settleInitialTail();
  if (sentinelEl.value && typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(
      (entries) => {
        if (!initialTailPending.value && entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { root: scrollEl.value, rootMargin: '120px' },
    );
    observer.observe(sentinelEl.value);
  }
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(followBottom);
    if (contentEl.value) resizeObserver.observe(contentEl.value);
    if (scrollEl.value) resizeObserver.observe(scrollEl.value);
  }
});
onUnmounted(() => {
  observer?.disconnect();
  resizeObserver?.disconnect();
  cancelAnimationFrame(scrollRaf);
  cancelAnimationFrame(initialTailRaf);
  initialTailGeneration++;
});

// 哨兵在 v-if="canLoadMore" 内,初始短会话时不存在;渲染出来后要补观察,
// 否则「滚动到顶自动加载更早」只剩手点按钮
watch(sentinelEl, (el) => {
  if (el && observer) observer.observe(el);
});

// 保持 emit 声明被使用(契约):取消当前轮由 Composer stop 触发,这里转发给外部备用
void emit;
</script>

<template>
  <div class="conversation-pane">
    <div ref="scrollEl" class="app-conversation" @scroll="onScroll">
      <div ref="contentEl" class="conversation">
        <!-- 更早加载哨兵/按钮 -->
        <div v-if="canLoadMore" ref="sentinelEl" class="load-earlier">
          <button class="load-earlier-btn" :disabled="props.loadingMore" @click="loadMore">
            <CodexIcon v-if="props.loadingMore" name="spinner" class="le-spin" />
            <CodexIcon v-else name="chevron-down" style="transform: rotate(180deg)" />
            <template v-if="props.loadingMore">加载中…</template>
            <template v-else-if="hiddenCount > 0">加载更早的 {{ Math.min(hiddenCount, PAGE) }} 条(共 {{ total }} 轮)</template>
            <template v-else>加载更早的消息</template>
          </button>
        </div>

        <template v-for="t in shownTurns" :key="t.id">
          <div v-if="t.role === 'user'" :data-turn-id="t.id">
            <MessageUser
              :turn="t"
              @edit="(turn) => emit('edit-message', turn)"
              @quote="(turn) => emit('quote-message', turn.text)"
              @fork="emit('fork-session')"
            />
          </div>
          <!-- 压缩分隔线(transcript 持久 divider,点击在右栏查看摘要) -->
          <button
            v-else-if="t.role === 'compaction'"
            type="button"
            class="compaction-divider"
            title="查看压缩摘要"
            @click="emit('view-compaction', t)"
          >
            <span class="cd-line"></span>
            <span class="cd-text">上下文已压缩 · 查看摘要</span>
            <span class="cd-line"></span>
          </button>
          <!-- cron 定时触发 notice(简单行,官方 CronNotice 的极简版) -->
          <div v-else-if="t.role === 'cron'" class="cron-notice">
            <CodexIcon name="clock" size="sm" />
            <span>{{ t.text || '定时任务触发' }}</span>
          </div>
          <MessageAssistant
            v-else-if="t.role === 'assistant'"
            :turn="t"
            :todos="props.todosByTurn[t.id] ?? []"
            :running="props.running && t.id === lastTurnId"
            :open-file="props.openFile"
            @inspect="(tab) => emit('inspect', tab)"
            @quote="(text) => emit('quote-message', text)"
            @fork="emit('fork-session')"
          />
        </template>

        <div
          v-for="approval in props.pendingApprovals ?? []"
          :key="approval.approvalId"
          class="msg-assistant"
        >
          <slot name="approval" :approval="approval" />
        </div>

        <TurnProgress v-if="props.turnProgress" v-bind="props.turnProgress" />
      </div>

      <!-- 对话目录竖条(右侧,hover 展开 label) -->
      <ConversationToc
        v-if="tocItems.length > 1"
        :items="tocItems"
        :active-turn-id="activeTurnId"
        @select="onTocSelect"
      />
    </div>

    <Transition name="jump-bottom">
      <button
        v-if="!nearBottom"
        type="button"
        class="jump-to-bottom"
        title="回到底部"
        aria-label="回到底部"
        @click="scrollToBottom"
      >
        <CodexIcon name="chevron-down" />
      </button>
    </Transition>
  </div>
</template>

<style scoped>
.conversation-pane {
  position: relative;
  flex: 1;
  min-height: 0;
}
.conversation-pane > .app-conversation {
  height: 100%;
}
.jump-to-bottom {
  position: absolute;
  z-index: var(--z-sticky);
  left: 50%;
  bottom: 16px;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  transform: translateX(-50%);
  border: 1px solid var(--border);
  border-radius: var(--r-full);
  background: var(--bg);
  color: var(--text-2);
  box-shadow: var(--shadow-md);
  transition:
    background var(--dur-1),
    color var(--dur-1),
    border-color var(--dur-1),
    opacity var(--dur-1),
    transform var(--dur-1);
}
.jump-to-bottom:hover {
  background: var(--hover);
  color: var(--text);
  border-color: var(--text-3);
}
.jump-to-bottom .ic {
  width: 16px;
  height: 16px;
}
.jump-bottom-enter-from,
.jump-bottom-leave-to {
  opacity: 0;
  transform: translate(-50%, 6px);
}
.load-earlier {
  display: flex;
  justify-content: center;
  padding: 4px 0 12px;
}
.load-earlier-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 12px;
  border-radius: var(--r-full);
  border: 1px solid var(--border-soft);
  background: var(--bg);
  font-size: var(--text-sm);
  color: var(--text-2);
  transition: background var(--dur-1), color var(--dur-1);
}
.load-earlier-btn:hover {
  background: var(--hover);
  color: var(--text);
}
.load-earlier-btn .ic {
  width: 13px;
  height: 13px;
}
.load-earlier-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.le-spin {
  animation: le-rotate 1.1s linear infinite;
}
@keyframes le-rotate {
  to { transform: rotate(360deg); }
}
.compaction-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  cursor: pointer;
}
.compaction-divider:hover .cd-text {
  color: var(--text-2);
}
.cd-line {
  flex: 1;
  height: 1px;
  background: var(--border-soft);
}
.cd-text {
  flex: none;
  font-size: var(--text-sm);
  color: var(--text-3);
  transition: color var(--dur-1);
}
.cron-notice {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: var(--text-sm);
  color: var(--text-3);
}
</style>
