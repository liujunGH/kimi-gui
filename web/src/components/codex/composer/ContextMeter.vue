<script setup lang="ts">
/**
 * ContextMeter —— 上下文用量环 + 详情卡
 *
 * 翻译自 prototype/mock/shared.js 的 bindContextMeter;样式类对齐 composer.css
 *(.ctx-ring / .ctx-pop / .ck-*),详情卡相对 .composer 绝对定位。
 * 环色:pct ≥ 85 → pct-danger(红),≥ 60 → pct-warn(黄),否则蓝(默认 .ring-fg)。
 *
 * 行为(组件内):
 * - 点击环开关详情卡;点外部 / Esc 关闭(document 监听在 onUnmounted 移除)
 * - 打开详情卡时 emit('open-detail'),供父级按需刷新额度数据
 *
 * 卡片字段全部从 props 读:会话 / 模型(kimi-code/{model})/ 思考 / 权限
 *(yolo →「完全自主」,标签层不进协议)/ 上下文(used/total · pct + 进度条)/
 * 状态 / 5 小时与每周额度。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { PermissionMode } from '../../../types';
import type { ContextInfo, EffortLevel, QuotaInfo } from '../../../types/codex';

const props = defineProps<{
  context: ContextInfo;
  quota: QuotaInfo;
  sessionTitle?: string;
  running?: boolean;
  permission?: PermissionMode;
  model?: string;
  effort?: EffortLevel | null;
  /** 会话累计成本(USD,来自 daemon usage);quota 为空时显示 */
  cost?: number;
}>();
const emit = defineEmits<{ (e: 'open-detail'): void }>();

/** 权限协议值 → UI 标签 */
const PERM_LABEL: Record<PermissionMode, string> = {
  manual: '逐条确认',
  auto: '自动通过',
  yolo: '完全自主',
};

const open = ref(false);

/** r=7 的圆周长 */
const CIRC = 2 * Math.PI * 7;
const pct = computed(() => Math.min(100, Math.max(0, props.context.pct)));
const dasharray = computed(() => `${((CIRC * pct.value) / 100).toFixed(1)} ${CIRC.toFixed(1)}`);
const ringCls = computed(() =>
  pct.value >= 85 ? 'pct-danger' : pct.value >= 60 ? 'pct-warn' : '',
);

const titleText = computed(() => props.sessionTitle?.trim() || '当前会话');
const modelText = computed(() => (props.model ? `kimi-code/${props.model}` : '—'));
const effortText = computed(() => props.effort ?? '—');
const permText = computed(() => (props.permission ? PERM_LABEL[props.permission] : '—'));
const statusText = computed(() => (props.running ? '运行中' : '空闲'));
const hasQuota = computed(() => props.quota.q5h > 0 || props.quota.qWeek > 0);
const costText = computed(() => (props.cost && props.cost > 0 ? `$${props.cost.toFixed(2)}` : ''));

function toggle() {
  open.value = !open.value;
  if (open.value) emit('open-detail');
}

function onDocClick(e: MouseEvent) {
  if (!(e.target as HTMLElement | null)?.closest('.ctx-meter')) open.value = false;
}
function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) {
    e.stopPropagation(); // 防穿透:全局 escClose 在 window 相,别连带关底层浮层
    open.value = false;
  }
}
onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onDocKeydown);
});
onUnmounted(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onDocKeydown);
});
</script>

<template>
  <button class="ctx-ring ctx-meter" :class="ringCls" title="上下文与额度" @click="toggle">
    <svg viewBox="0 0 18 18" fill="none">
      <circle class="ring-bg" cx="9" cy="9" r="7" stroke-width="2" />
      <circle
        class="ring-fg"
        cx="9"
        cy="9"
        r="7"
        stroke-width="2"
        stroke-linecap="round"
        :stroke-dasharray="dasharray"
      />
    </svg>
  </button>

  <div class="ctx-pop ctx-meter" :class="{ open }">
    <div class="ck-row">
      <span class="k">会话</span>
      <span class="v v-ellipsis">{{ titleText }}</span>
    </div>
    <div class="ck-row">
      <span class="k">模型</span>
      <span class="v">{{ modelText }}</span>
    </div>
    <div class="ck-row">
      <span class="k">思考</span>
      <span class="v">{{ effortText }}</span>
    </div>
    <div class="ck-row">
      <span class="k">权限</span>
      <span class="v">{{ permText }}</span>
    </div>
    <div class="ck-row">
      <span class="k">上下文</span>
      <span class="v">{{ props.context.used }} / {{ props.context.total }} · {{ props.context.pct }}%</span>
    </div>
    <div class="ck-bar"><div class="ck-fill" :style="{ width: pct + '%' }"></div></div>
    <div class="ck-row">
      <span class="k">状态</span>
      <span class="v">{{ statusText }}</span>
    </div>
    <div class="ck-sep"></div>
    <template v-if="hasQuota">
      <div class="ck-row">
        <span class="k">5 小时额度</span>
        <span class="v">{{ props.quota.q5h }}%({{ props.quota.q5hReset }} 后重置)</span>
      </div>
      <div class="ck-row">
        <span class="k">每周额度</span>
        <span class="v">{{ props.quota.qWeek }}%({{ props.quota.qWeekReset }} 后重置)</span>
      </div>
    </template>
    <template v-else>
      <div v-if="costText" class="ck-row">
        <span class="k">累计成本</span>
        <span class="v">{{ costText }}</span>
      </div>
      <div class="ck-row">
        <span class="k">5h/周额度</span>
        <span class="v" style="color: var(--text-3)">待 daemon 支持</span>
      </div>
    </template>
  </div>
</template>
