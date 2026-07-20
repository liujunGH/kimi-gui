<script setup lang="ts">
/**
 * ConversationPane —— 对话流容器
 *
 * - 按 turns 有序渲染 MessageUser / MessageAssistant
 * - 窗口化渲染(轮次 4d):默认只挂最后 PAGE 条 turn,滚动到顶自动加载更早
 *   (长会话几百轮时避免全量 Markdown + ThinkingBlock + ToolCallCard 挂载卡顿)
 * - 末尾:pendingApproval → ApprovalCard;turnProgress → TurnProgress
 * - 滚锚(Q4 归 kimi3):用户贴底时新内容自动跟随;上翻后不抢滚动;
 *   前插加载时保持视口位置(scrollTop 按新增高度补偿)
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ConversationPaneProps, ConversationPaneEmits } from '../../../types/codex';
import type { ChatTurn } from '../../../types';
import CodexIcon from '../layout/CodexIcon.vue';
import MessageUser from './MessageUser.vue';
import MessageAssistant from './MessageAssistant.vue';
import TurnProgress from './TurnProgress.vue';
import ConversationToc, { type ConversationTocItem } from '../../chat/ConversationToc.vue';

const props = defineProps<ConversationPaneProps>();
const emit = defineEmits<ConversationPaneEmits & {
  (e: 'inspect', tab: 'thinking' | 'tools'): void;
  (e: 'load-older'): void;
}>();

const PAGE = 50;
const scrollEl = ref<HTMLElement | null>(null);
const sentinelEl = ref<HTMLElement | null>(null);
const nearBottom = ref(true);
const visibleCount = ref(PAGE);

const total = computed(() => props.turns.length);
const shownTurns = computed(() => props.turns.slice(Math.max(0, total.value - visibleCount.value)));
const hiddenCount = computed(() => total.value - shownTurns.value.length);
const lastTurnId = computed(() => props.turns[props.turns.length - 1]?.id);

// ConversationToc:每轮 user query 一条竖条(hover 展开 label)
function tocTitle(turn: ChatTurn): string {
  const text = turn.text?.trim();
  if (text) return text.length > 60 ? text.slice(0, 60) + '…' : text;
  if ((turn.tools?.length ?? 0) > 0) return `${turn.tools!.length} tools`;
  return 'kimi';
}
const tocItems = computed<ConversationTocItem[]>(() =>
  props.turns
    .filter((t) => t.role === 'user')
    .map((t, i) => ({ id: t.id, role: t.role as 'user', no: i + 1, title: tocTitle(t) })),
);
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

// 会话切换(turns 引用变化且不是单纯增长)时重置窗口
watch(
  () => props.turns[0]?.id,
  () => {
    visibleCount.value = PAGE;
  },
);

function onScroll() {
  const el = scrollEl.value;
  if (!el) return;
  nearBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  updateActiveToc();
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

watch(
  () => [props.turns.length, props.turns[props.turns.length - 1]?.blocks?.length],
  maybeFollow,
);

// 顶部哨兵:进入视口自动加载更早
let observer: IntersectionObserver | null = null;
onMounted(() => {
  maybeFollow();
  if (sentinelEl.value && typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { root: scrollEl.value, rootMargin: '120px' },
    );
    observer.observe(sentinelEl.value);
  }
});
onUnmounted(() => observer?.disconnect());

// 保持 emit 声明被使用(契约):取消当前轮由 Composer stop 触发,这里转发给外部备用
void emit;
</script>

<template>
  <div ref="scrollEl" class="app-conversation" @scroll="onScroll">
    <div class="conversation">
      <!-- 更早加载哨兵/按钮 -->
      <div v-if="hiddenCount > 0" ref="sentinelEl" class="load-earlier">
        <button class="load-earlier-btn" @click="loadMore">
          <CodexIcon name="chevron-down" style="transform: rotate(180deg)" />
          加载更早的 {{ Math.min(hiddenCount, PAGE) }} 条(共 {{ total }} 轮)
        </button>
      </div>

      <template v-for="t in shownTurns" :key="t.id">
        <div v-if="t.role === 'user'" :data-turn-id="t.id">
          <MessageUser :turn="t" />
        </div>
        <MessageAssistant
          v-else-if="t.role === 'assistant'"
          :turn="t"
          :todos="props.todosByTurn[t.id] ?? []"
          :running="props.running && t.id === lastTurnId"
          :open-file="props.openFile"
          @inspect="(tab) => emit('inspect', tab)"
        />
      </template>

      <div v-if="props.pendingApproval" class="msg-assistant">
        <slot name="approval" :approval="props.pendingApproval" />
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
</template>

<style scoped>
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
</style>
