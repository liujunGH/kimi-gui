/**
 * useUIState —— 跨组件 UI 状态(右栏 / 侧边任务 / Review pane / 全局思考开关)
 *
 * 职责边界(HANDOFF 轮次 0.1 + 0.3):
 * - 这里只暴露**状态 ref + 意图方法**(open/close/toggle/set-tab)
 * - **不写组件行为逻辑**(键盘导航、动画、滚锚)—— 那归 kimi3
 * - 状态是模块级单例(模块作用域 ref,所有组件拿到同一个)
 *
 * Q5(ARCHITECTURE 第 7.5):DetailPane/ReviewPane 跟 SideTask **共存**,
 * 不互斥。覆盖物分层级(DetailPane/ReviewPane z-index 高于 SideTask),
 * Esc 分层关闭(先关最上层覆盖物,再关分栏)。
 *
 * ⚠️ 冻结点:本文件签名一旦 kimi3 开始用,改动需双方同意(HANDOFF 5.1)。
 */
import { ref } from 'vue';
import type { DetailPaneTab } from '../../types/codex';

const detailPaneOpen = ref(false);
const detailPaneTab = ref<DetailPaneTab>('thread');
const reviewPaneOpen = ref(false);
const sideTaskOpen = ref(false);
/** SideTask slot 内容类型:'thread'(侧边线程) | 'agent-transcript'(子 agent 钻取)。 */
const sideTaskKind = ref<'thread' | 'agent-transcript'>('thread');
const sideTaskSubagentId = ref<string | null>(null);
/**
 * 全局思考默认展开开关:
 * - true(默认):新出现的思考块默认展开
 * - false:新出现的思考块默认折叠
 * 不影响已手动 toggle 过的思考块(ThinkingBlock 内部 open ref 独立)。
 */
const globalThinking = ref(true);

/** 覆盖物 z 顺序:Review pane 最高 > Detail pane > SideTask(分栏,非覆盖)。 */
const overlayStack = ref<('review' | 'detail')[]>([]);

function pushOverlay(kind: 'review' | 'detail') {
  if (!overlayStack.value.includes(kind)) overlayStack.value.push(kind);
}
function popOverlay() {
  overlayStack.value.pop();
}

// 模块级 close 函数(避免对象方法里的 `this`,支持解构调用:`const { escClose } = useUIState()`)
function closeDetailImpl() {
  detailPaneOpen.value = false;
  popOverlay();
}
function closeReviewImpl() {
  reviewPaneOpen.value = false;
  popOverlay();
}
function closeSideTaskImpl() {
  sideTaskOpen.value = false;
}
function escCloseImpl(): boolean {
  if (overlayStack.value.length > 0) {
    const top = overlayStack.value[overlayStack.value.length - 1];
    if (top === 'review') closeReviewImpl();
    else if (top === 'detail') closeDetailImpl();
    return true;
  }
  if (sideTaskOpen.value) {
    closeSideTaskImpl();
    return true;
  }
  return false;
}

export function useUIState() {
  return {
    // ref(只读暴露给组件,组件不直接改)
    detailPaneOpen,
    detailPaneTab,
    reviewPaneOpen,
    sideTaskOpen,
    sideTaskKind,
    sideTaskSubagentId,
    globalThinking,

    // 意图方法(组件调用,都是模块级函数引用,支持解构)
    openDetail(tab?: DetailPaneTab) {
      if (tab) detailPaneTab.value = tab;
      detailPaneOpen.value = true;
      pushOverlay('detail');
    },
    closeDetail: closeDetailImpl,
    setDetailTab(tab: DetailPaneTab) {
      detailPaneTab.value = tab;
    },
    openReview() {
      reviewPaneOpen.value = true;
      pushOverlay('review');
    },
    closeReview: closeReviewImpl,
    openSideTask(kind: 'thread' | 'agent-transcript' = 'thread', subagentId?: string) {
      sideTaskKind.value = kind;
      sideTaskSubagentId.value = subagentId ?? null;
      sideTaskOpen.value = true;
    },
    closeSideTask: closeSideTaskImpl,
    /** 全局思考默认展开 toggle:只影响新出现的思考块,不影响已手动 toggle 的。 */
    toggleGlobalThinking() {
      globalThinking.value = !globalThinking.value;
    },

    /**
     * Esc 分层关闭(Q5 结论):先关最上层覆盖物;没有覆盖物时关 SideTask。
     * 全局快捷键(useHotkeys)的 Esc handler 调这个。
     */
    escClose: escCloseImpl,
  };
}
