<script lang="ts">
/**
 * 模块级审批卡栈:多张审批卡并存时,y/a/n/p 单键只作用于栈顶
 * (「最近一张未处理」的卡)。挂载 push、卸载移除;快捷键 handler
 * 统一委派给栈顶卡的 act(见 prototype mock/shared.js bindApprovalKeys)。
 * 本阶段卡不会被标记「已处理」(动作轮次 3 走 client),栈顶即最近挂载。
 */
type ApprovalActKey = 'approve' | 'session' | 'reject' | 'feedback';

interface ApprovalCardEntry {
  id: string;
  act: (k: ApprovalActKey) => void;
}

const approvalCardStack: ApprovalCardEntry[] = [];

function topApprovalCard(): ApprovalCardEntry | undefined {
  return approvalCardStack.at(-1);
}
</script>

<script setup lang="ts">
/**
 * ApprovalCard —— 审批内联卡(不阻塞 Composer,样式见 styles/approval.css)
 *
 * - props = ApprovalRequestSummary 字段逐个平铺(契约);cwd 是契约外补充
 *   prop(shell body 的工作目录行,契约无此字段,已报备,缺省不渲染)
 * - head:ah-icon(shell→terminal / diff→file-code / plan→list,其余 kind 近似映射)
 *   + ah-kind(运行命令?/应用修改?/审查计划?,未覆盖 kind 回退 title)+ ah-path
 *   + ah-required「Approval Required」
 * - body:shell→.body-shell($ 提示符 + cwd)/ diff→.body-diff(复用 DiffLines)
 *   / plan→.body-plan 有序列表 / 其余有 title 时退化为 .body-note
 * - actions:批准 Y(primary)/ 本会话 A / 拒绝 N / 反馈 P(ghost 右置);
 *   approve/session/reject 动作轮次 3 走 inject client(见 ApprovalCardEmits 注释),
 *   本阶段按钮是纯展示 + 按压动效(.pressed 120ms)
 * - y/a/n/p 单键:useHotkeys 注册,只作用于模块级栈顶卡;p → 展开反馈并
 *   emit('toggle-feedback');feedback 按钮同
 * - emit('minimize'):本阶段无内部触发源(最小化发生在动作处理后,等轮次 3
 *   动作接线时由卡片发出),签名按契约保留
 */
import { computed, inject, nextTick, onMounted, onUnmounted, ref } from 'vue';
import type { ApprovalCardEmits, ApprovalRequestSummary } from '../../../types/codex';
import { useHotkeys } from '../../../composables/codex/useHotkeys';
import { KIMI_CLIENT_KEY } from '../../../composables/codex/useKimiClient';
import CodexIcon from '../layout/CodexIcon.vue';
import DiffLines from '../diff/DiffLines.vue';

const props = withDefaults(defineProps<ApprovalRequestSummary & { cwd?: string }>(), {
  path: '',
  command: '',
  diff: () => [],
  plan: '',
  subagent: '',
  cwd: '',
});
const emit = defineEmits<ApprovalCardEmits>();

/**
 * 真实审批动作:codex-app 里 client 已由 App provide,直接 client.respondApproval;
 * 验收沙箱无 provide(inject 为 null),退化为纯按压动效。
 */
const client = inject(KIMI_CLIENT_KEY, null);

// ---------------------------------------------------------------------------
// head
// ---------------------------------------------------------------------------
const KIND_ICON: Record<string, string> = {
  shell: 'terminal',
  invocation: 'terminal',
  diff: 'file-code',
  file: 'file-code',
  fileop: 'file',
  plan_review: 'list',
  todo: 'list',
  url: 'search',
  search: 'search',
};
const headIcon = computed(() => KIND_ICON[props.kind] ?? 'alert');

const KIND_LABEL: Record<string, string> = {
  shell: '运行命令?',
  invocation: '运行命令?',
  diff: '应用修改?',
  file: '应用修改?',
  fileop: '应用修改?',
  plan_review: '审查计划?',
  todo: '审查计划?',
};
const kindLabel = computed(() => KIND_LABEL[props.kind] ?? (props.title || '需要审批?'));

const isShell = computed(() => props.kind === 'shell' || props.kind === 'invocation');
const headPath = computed(() =>
  isShell.value
    ? props.command || props.path || props.subagent
    : props.path || props.command || props.subagent,
);

// ---------------------------------------------------------------------------
// body
// ---------------------------------------------------------------------------
const bodyType = computed<'shell' | 'diff' | 'plan' | 'note' | null>(() => {
  if (isShell.value && props.command) return 'shell';
  if (props.diff.length > 0) return 'diff';
  if (props.plan) return 'plan';
  if (props.title) return 'note';
  return null;
});

/** plan 文本 → 有序列表项(剥掉原文自带的序号/项目符) */
const planItems = computed(() =>
  props.plan
    .split(/\n+/)
    .map((s) => s.replace(/^\s*(?:\d+[.、)]|[-*•])\s*/, '').trim())
    .filter(Boolean),
);

// ---------------------------------------------------------------------------
// 动作(纯展示 + 按压动效;approve/session/reject 轮次 3 接 client)
// ---------------------------------------------------------------------------
const pressed = ref<ApprovalActKey | null>(null);
let pressTimer: ReturnType<typeof setTimeout> | undefined;

const feedbackOpen = ref(false);
const feedbackText = ref('');
const feedbackEl = ref<HTMLTextAreaElement | null>(null);

function toggleFeedback() {
  feedbackOpen.value = !feedbackOpen.value;
  emit('toggle-feedback');
  if (feedbackOpen.value) {
    void nextTick(() => feedbackEl.value?.focus());
  }
}

function act(key: ApprovalActKey) {
  pressed.value = key;
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => (pressed.value = null), 120);
  if (key === 'feedback') {
    toggleFeedback();
    return;
  }
  if (client && props.approvalId) {
    void client.respondApproval(props.approvalId, {
      decision: key === 'reject' ? 'rejected' : 'approved',
      scope: key === 'session' ? 'session' : undefined,
    });
  }
}

/** 反馈提交:拒绝 + 附言(⌘+Enter 或点提交) */
function submitFeedback() {
  const text = feedbackText.value.trim();
  if (!text) return;
  if (client && props.approvalId) {
    void client.respondApproval(props.approvalId, { decision: 'rejected', feedback: text });
  }
  feedbackOpen.value = false;
  feedbackText.value = '';
}

// ---------------------------------------------------------------------------
// 卡栈 + y/a/n/p 单键(只对栈顶卡生效;修饰键组合不触发,对齐 prototype)
// ---------------------------------------------------------------------------
const stackEntry: ApprovalCardEntry = { id: props.approvalId, act };
onMounted(() => {
  approvalCardStack.push(stackEntry);
});
onUnmounted(() => {
  const i = approvalCardStack.indexOf(stackEntry);
  if (i >= 0) approvalCardStack.splice(i, 1);
  clearTimeout(pressTimer);
});

function onApprovalKey(key: ApprovalActKey) {
  return (e: KeyboardEvent): boolean | void => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    topApprovalCard()?.act(key);
    return true;
  };
}

useHotkeys([
  { key: 'y', handler: onApprovalKey('approve') },
  { key: 'a', handler: onApprovalKey('session') },
  { key: 'n', handler: onApprovalKey('reject') },
  { key: 'p', handler: onApprovalKey('feedback') },
]);
</script>

<template>
  <div class="approval" :class="{ 'feedback-open': feedbackOpen }">
    <div class="approval-head">
      <span class="ah-icon"><CodexIcon :name="headIcon" /></span>
      <span class="ah-kind">{{ kindLabel }}</span>
      <span class="ah-path">{{ headPath }}</span>
      <span class="ah-required">Approval Required</span>
    </div>

    <div v-if="bodyType" class="approval-body">
      <div v-if="bodyType === 'shell'" class="body-shell">
        <div class="shell-cmd"><span class="shell-prompt">$ </span>{{ props.command }}</div>
        <div v-if="props.cwd" class="shell-cwd">cwd: {{ props.cwd }}</div>
      </div>
      <div v-else-if="bodyType === 'diff'" class="body-diff">
        <DiffLines :hunks="props.diff" />
      </div>
      <ol v-else-if="bodyType === 'plan'" class="body-plan">
        <li v-for="(item, i) in planItems" :key="i">
          <span class="plan-num">{{ i + 1 }}</span>
          {{ item }}
        </li>
      </ol>
      <div v-else class="body-note">{{ props.title }}</div>
    </div>

    <div class="approval-actions">
      <button
        class="act-btn primary"
        :class="{ pressed: pressed === 'approve' }"
        data-key="approve"
        @click="act('approve')"
      >
        批准 <span class="kbd">Y</span>
      </button>
      <button
        class="act-btn"
        :class="{ pressed: pressed === 'session' }"
        data-key="session"
        @click="act('session')"
      >
        本会话 <span class="kbd">A</span>
      </button>
      <button
        class="act-btn reject"
        :class="{ pressed: pressed === 'reject' }"
        data-key="reject"
        @click="act('reject')"
      >
        拒绝 <span class="kbd">N</span>
      </button>
      <button
        class="act-btn feedback"
        :class="{ pressed: pressed === 'feedback' }"
        data-key="feedback"
        @click="act('feedback')"
      >
        反馈 <span class="kbd">P</span>
      </button>
    </div>

    <div class="approval-feedback">
      <textarea
        ref="feedbackEl"
        v-model="feedbackText"
        placeholder="告诉 Kimi 应该怎么调整…(⌘+Enter 提交,即拒绝并附言)"
        @keydown.meta.enter.prevent="submitFeedback"
        @keydown.ctrl.enter.prevent="submitFeedback"
      ></textarea>
    </div>
  </div>
</template>

<style scoped>
/* 极小局部微调:prototype CSS 的 .body-plan 未重置 <ol> 的 UA 边距/列表符 */
.body-plan {
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
