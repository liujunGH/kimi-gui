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
 * 0.33 契约可返回创建/开始/完成时间和运行时模型；缺字段时仍保持渐进展示。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { AgentPanelProps, AgentPanelEmits, Subagent } from '../../../types/codex';
import CodexIcon from '../layout/CodexIcon.vue';

const props = withDefaults(defineProps<AgentPanelProps & { open?: boolean }>(), { open: false });
const emit = defineEmits<AgentPanelEmits & { (e: 'close'): void }>();

/** 完成组分页:默认 10 条 */
const shown = ref(10);
const query = ref('');
const statusFilter = ref<'all' | 'active' | 'completed'>('all');
const routeFilter = ref<'all' | 'primary' | 'secondary' | 'background'>('all');
const normalizedQuery = computed(() => query.value.trim().toLowerCase());
function matches(a: Subagent): boolean {
  const needle = normalizedQuery.value;
  const routeMatches = routeFilter.value === 'all'
    || (routeFilter.value === 'background' ? a.background === true : a.modelRoute === routeFilter.value);
  return routeMatches && (!needle || [a.name, a.summary, a.model, a.subagentType, a.parentToolCallId].some((value) => value?.toLowerCase().includes(needle)));
}
const activeRows = computed(() => statusFilter.value === 'completed' ? [] : props.active.filter(matches));
const completedRows = computed(() => statusFilter.value === 'active' ? [] : props.completed.filter(matches));
const completedShown = computed(() => completedRows.value.slice(0, shown.value));
const hasMore = computed(() => completedRows.value.length > shown.value);

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
  if (a.status === 'suspended' || a.status === 'queued') return 'dot-waiting';
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
function outputMeta(a: Subagent): string {
  const parts: string[] = [];
  if (a.subagentType) parts.push(a.subagentType);
  if (a.background) parts.push('后台');
  if (a.swarmIndex !== undefined) parts.push(`Swarm #${a.swarmIndex + 1}`);
  if (a.activityCount) parts.push(`${a.activityCount} 条活动`);
  if (a.outputChars) parts.push(`${a.outputChars.toLocaleString()} 字符`);
  return parts.join(' · ');
}

/* Esc 关闭(组件自管;面板未开时不吞事件;stopPropagation 防连带关底层浮层) */
function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) {
    e.stopPropagation();
    emit('close');
  }
}
onMounted(() => document.addEventListener('keydown', onDocKeydown));
onUnmounted(() => document.removeEventListener('keydown', onDocKeydown));
</script>

<template>
  <aside v-if="props.open" class="agent-panel open">
    <div class="aph-head">
      <CodexIcon name="bot" />
      <span class="aph-title">子智能体</span>
      <button class="icon-btn ap-close" title="关闭 Esc" @click="emit('close')">
        <CodexIcon name="x" size="sm" />
      </button>
    </div>

    <div class="aph-body">
      <div class="agent-root">
        <span class="agent-root-icon"><CodexIcon name="bot" /></span>
        <span><strong>{{ props.sessionTitle || '当前主任务' }}</strong><small>{{ props.workspaceName || '当前工作区' }} · 主智能体</small></span>
        <i>{{ props.active.length }} 运行 / {{ props.completed.length }} 完成</i>
      </div>
      <label class="aph-search"><CodexIcon name="search" /><input v-model="query" placeholder="搜索子智能体…" /></label>
      <div class="aph-tabs" role="tablist">
        <button :class="{ active: statusFilter === 'all' }" @click="statusFilter = 'all'">全部 {{ props.active.length + props.completed.length }}</button>
        <button :class="{ active: statusFilter === 'active' }" @click="statusFilter = 'active'">进行中 {{ props.active.length }}</button>
        <button :class="{ active: statusFilter === 'completed' }" @click="statusFilter = 'completed'">已完成 {{ props.completed.length }}</button>
      </div>
      <select v-model="routeFilter" class="aph-route" aria-label="模型路由筛选">
        <option value="all">全部模型路由</option><option value="primary">主模型</option><option value="secondary">次级模型</option><option value="background">仅后台运行</option>
      </select>
      <div v-if="statusFilter !== 'completed'" class="aph-label">已开启 · {{ activeRows.length }}</div>
      <div v-if="statusFilter !== 'completed' && !activeRows.length" class="aph-empty">暂无匹配的进行中子智能体</div>
      <div
        v-for="a in activeRows"
        :key="a.id"
        class="aph-row"
        role="group"
      >
        <button type="button" class="aph-inspect" @click="emit('inspect', a.id)">
          <span class="aph-icon" :class="iconVariant(a, 0)">{{ letterOf(a) }}</span>
          <span class="aph-main">
            <span class="aph-name">
              <span v-if="dotOf(a)" class="dot" :class="dotOf(a)"></span>{{ a.name }}
            </span>
            <span v-if="a.model" class="aph-model" :title="a.modelHint">
              {{ a.modelRoute === 'secondary' ? '次级模型' : '主模型' }} · {{ a.model }}<template v-if="a.modelSource === 'runtime'"> · 运行时</template>
            </span>
            <span class="aph-sum">{{ sumOf(a) }}</span>
            <span v-if="outputMeta(a)" class="aph-meta">{{ outputMeta(a) }}</span>
            <span v-if="a.parentToolCallId" class="aph-parent" :title="a.parentToolCallId">↳ 父调用 {{ a.parentToolCallId.slice(0, 12) }}</span>
            <span v-if="a.progress" class="aph-bar">
              <span class="aph-bar-fill" :style="{ width: pctOf(a) + '%' }"></span>
            </span>
          </span>
        </button>
        <button
          v-if="a.status === 'working'"
          class="aph-cancel"
          title="取消该子任务"
          @click.stop="emit('cancel', a.id)"
        >
          <CodexIcon name="stop" size="sm" />
        </button>
      </div>

      <div v-if="statusFilter !== 'active'" class="aph-label">完成 · {{ completedRows.length }}</div>
      <div v-if="statusFilter !== 'active' && !completedRows.length" class="aph-empty">暂无匹配的已完成子智能体</div>
      <div
        v-for="(a, i) in completedShown"
        :key="a.id"
        class="aph-row"
        role="group"
      >
        <button type="button" class="aph-inspect" @click="emit('inspect', a.id)">
          <span class="aph-icon" :class="iconVariant(a, i)">{{ letterOf(a) }}</span>
          <span class="aph-main">
            <span class="aph-name">{{ a.name }}</span>
            <span v-if="a.model" class="aph-model" :title="a.modelHint">
              {{ a.modelRoute === 'secondary' ? '次级模型' : '主模型' }} · {{ a.model }}<template v-if="a.modelSource === 'runtime'"> · 运行时</template>
            </span>
            <span class="aph-sum">{{ sumOf(a) }}</span>
            <span v-if="outputMeta(a)" class="aph-meta">{{ outputMeta(a) }}</span>
            <span v-if="a.parentToolCallId" class="aph-parent" :title="a.parentToolCallId">↳ 父调用 {{ a.parentToolCallId.slice(0, 12) }}</span>
            <span v-if="a.elapsed" class="aph-time">{{ a.elapsed }}</span>
          </span>
        </button>
      </div>
      <button v-if="hasMore" class="aph-more" @click="shown += 10">再显示 10 个</button>
    </div>
  </aside>
</template>

<style scoped>
/* 第二组 label 与上组拉开间距(原型用内联 style="margin-top:14px",这里收进 scoped) */
.aph-body .aph-label:not(:first-child) {
  margin-top: 14px;
}
.aph-inspect {
  display: flex;
  flex: 1;
  min-width: 0;
  gap: 10px;
  text-align: left;
}
.aph-inspect:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.aph-search { display: flex; align-items: center; gap: 7px; padding: 7px 9px; margin-bottom: 8px; border: 1px solid var(--border-soft); border-radius: var(--r-md); background: var(--bg-soft); color: var(--text-3); }
.aph-search input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--text); font: inherit; }
.aph-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; padding: 3px; margin-bottom: 12px; border-radius: var(--r-md); background: var(--bg-soft); }
.aph-tabs button { padding: 6px 4px; border: 0; border-radius: calc(var(--r-md) - 2px); background: transparent; color: var(--text-3); font-size: 11px; cursor: pointer; }
.aph-tabs button.active { background: var(--bg); color: var(--text); box-shadow: var(--shadow-sm); }
.aph-meta { display: block; margin-top: 3px; color: var(--text-3); font-size: 10px; }
.aph-parent { display: block; margin-top: 3px; color: var(--text-3); font: 10px ui-monospace, SFMono-Regular, monospace; }
.aph-time { display: block; margin-top: 3px; }
.agent-root{display:grid;grid-template-columns:32px 1fr auto;gap:9px;align-items:center;margin-bottom:10px;padding:10px;border:1px solid var(--border-soft);border-radius:var(--r-md);background:var(--bg-soft)}.agent-root-icon{display:grid;place-items:center;width:32px;height:32px;border-radius:9px;background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent)}.agent-root span:nth-child(2){display:flex;min-width:0;flex-direction:column}.agent-root strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}.agent-root small,.agent-root i{color:var(--text-3);font-size:10px;font-style:normal}.aph-route{width:100%;margin-bottom:10px;padding:7px 8px;border:1px solid var(--border-soft);border-radius:var(--r-md);background:var(--bg);color:var(--text);font:inherit;font-size:11px}
</style>
