<script setup lang="ts">
/**
 * AgentPanel —— 子智能体管理面板(右侧滑出:已开启 · N / 完成 · N)
 *
 * props/emit 契约见 types/codex.ts AgentPanelProps / AgentPanelEmits。
 * 契约外补充(已报备):
 * - props open:面板开合由父级控制(.agent-panel.open 才滑入,对齐 DetailPane 模式)
 * - emit('close'):ap-head 的 × 与 Esc 触发;Esc 为组件自管(document 监听,卸载移除)
 *
 * 行为翻译自 prototype/mock/shared.js bindAgentPanel/apRow:
 * - 行 = 字母图标(v1=进行中组 / v2·v3=完成组交替)+ 状态点 + 名 + summary(尾拼进度)+ 进度条
 * - 完成组默认 10 条,「再显示 10 个」递增;行点击 emit('inspect', id) 钻取 transcript
 * - working 行行尾有 stop 按钮(hover 显形,@click.stop)→ emit('cancel', id) 取消子任务
 *
 * 契约缺口(已报备):Subagent 无耗时/完成时间字段,原型行的 .ap-time 暂不渲染。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { AgentPanelProps, AgentPanelEmits, Subagent } from '../../../types/codex';
import CodexIcon from '../layout/CodexIcon.vue';

const props = withDefaults(defineProps<AgentPanelProps & { open?: boolean }>(), { open: false });
const emit = defineEmits<AgentPanelEmits & { (e: 'close'): void }>();

/** 完成组分页:默认 10 条 */
const shown = ref(10);
const completedShown = computed(() => props.completed.slice(0, shown.value));
const hasMore = computed(() => props.completed.length > shown.value);

function letterOf(a: Subagent): string {
  return (a.name.trim()[0] ?? '?').toUpperCase();
}
/** 图标变体:进行中组一律 v1;完成组按原型节奏 v2 为主、每第三个 v3 */
function iconVariant(a: Subagent, index: number): string {
  if (a.status !== 'completed' && a.status !== 'failed') return 'v1';
  return index % 3 === 2 ? 'v3' : 'v2';
}
/** 行内状态点:working→running;suspended→waiting(待输入);其余无 */
function dotOf(a: Subagent): string {
  if (a.status === 'working') return 'dot-running';
  if (a.status === 'suspended') return 'dot-waiting';
  return '';
}
function pctOf(a: Subagent): number {
  const p = a.progress;
  if (!p || !p.total) return 0;
  return Math.min(100, Math.round((p.current / p.total) * 100));
}
/** summary 尾拼进度,对齐原型 apRow 的「… 7/12」 */
function sumOf(a: Subagent): string {
  const s = a.summary ?? '';
  if (!a.progress) return s;
  const tail = `${a.progress.current}/${a.progress.total}`;
  return s ? `${s} ${tail}` : tail;
}

/* Esc 关闭(组件自管;面板未开时不吞事件) */
function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close');
}
onMounted(() => document.addEventListener('keydown', onDocKeydown));
onUnmounted(() => document.removeEventListener('keydown', onDocKeydown));
</script>

<template>
  <aside class="agent-panel" :class="{ open: props.open }">
    <div class="aph-head">
      <CodexIcon name="bot" />
      <span class="aph-title">子智能体</span>
      <button class="icon-btn ap-close" title="关闭 Esc" @click="emit('close')">
        <CodexIcon name="x" size="sm" />
      </button>
    </div>

    <div class="aph-body">
      <div class="aph-label">已开启 · {{ props.active.length }}</div>
      <div v-if="!props.active.length" class="aph-empty">暂无进行中的子智能体</div>
      <div
        v-for="a in props.active"
        :key="a.id"
        class="aph-row"
        @click="emit('inspect', a.id)"
      >
        <span class="aph-icon" :class="iconVariant(a, 0)">{{ letterOf(a) }}</span>
        <span class="aph-main">
          <span class="aph-name">
            <span v-if="dotOf(a)" class="dot" :class="dotOf(a)"></span>{{ a.name }}
          </span>
          <span class="aph-sum">{{ sumOf(a) }}</span>
          <span v-if="a.progress" class="aph-bar">
            <span class="aph-bar-fill" :style="{ width: pctOf(a) + '%' }"></span>
          </span>
        </span>
        <button
          v-if="a.status === 'working'"
          class="aph-cancel"
          title="取消该子任务"
          @click.stop="emit('cancel', a.id)"
        >
          <CodexIcon name="stop" size="sm" />
        </button>
      </div>

      <div class="aph-label">完成 · {{ props.completed.length }}</div>
      <div v-if="!props.completed.length" class="aph-empty">暂无已完成的子智能体</div>
      <div
        v-for="(a, i) in completedShown"
        :key="a.id"
        class="aph-row"
        @click="emit('inspect', a.id)"
      >
        <span class="aph-icon" :class="iconVariant(a, i)">{{ letterOf(a) }}</span>
        <span class="aph-main">
          <span class="aph-name">{{ a.name }}</span>
          <span class="aph-sum">{{ sumOf(a) }}</span>
        </span>
      </div>
      <button v-if="hasMore" class="aph-more" @click="shown += 10">再显示 10 个</button>
    </div>
  </aside>
</template>

<style scoped>
/* 第二组 label 与上组拉开间距(原型用内联 style="margin-top:14px",这里收进 scoped) */
.ap-body .ap-label:not(:first-child) {
  margin-top: 14px;
}
</style>
