<script setup lang="ts">
/**
 * DetailPane —— Inspect 右栏(⌘I,线程 / 思考 / 工具 / 任务)
 *
 * 行为(组件内,kimi3 域):
 * - open 状态:以 useUIState().detailPaneOpen 为准(props.open 保留契约,
 *   当前不驱动显隐;Esc 分层关闭由 useUIState.escClose 统一处理)
 * - tab 切换是组件内行为:本地 ref,跟随 props.tab 同步;切换时 emit('set-tab')
 * - × 关闭:emit('close') + ui.closeDetail()
 *
 * 契约缺口(已报备):ThreadMeta 无「分支」字段,原型 dp-kv 的分支行
 * 改渲染权限模式(manual/auto/yolo → 逐条确认/自动通过/完全自主)。
 */
import { computed, ref, watch } from 'vue';
import type { DetailPaneProps, DetailPaneEmits, DetailPaneTab } from '../../../types/codex';
import type { PermissionMode } from '../../../types';
import CodexIcon from '../layout/CodexIcon.vue';
import { useUIState } from '../../../composables/codex/useUIState';

const props = defineProps<DetailPaneProps>();
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
          <div class="dp-thinking-content">{{ props.thinkingFullText }}</div>
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
