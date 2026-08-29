<script setup lang="ts">
import { computed, inject, onUnmounted, ref, watch } from 'vue';
import { getKimiWebApi } from '../../../api';
import { isDaemonApiError } from '../../../api/errors';
import type { AppSession, AppTask } from '../../../api/types';
import { KIMI_CLIENT_KEY } from '../../../composables/codex/useKimiClient';
import { formatLocalDateTime } from '../../../lib/formatMessageTime';
import { buildGlobalTaskSnapshot } from '../../../lib/globalTaskSnapshot';
import { compareKimiVersions } from '../../../lib/kimiVersion';
import { useToast } from '../layout/Toast.vue';
import CodexIcon from '../layout/CodexIcon.vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'open-session', id: string): void }>();
const { toast } = useToast();
const sessions = ref(new Map<string, AppSession>());
const tasks = ref(new Map<string, AppTask>());
const loading = ref(false);
const filter = ref<'all' | 'running' | 'subagent' | 'bash'>('all');
let timer: number | undefined;

/** 深组件直接 inject client(架构规则:3 层以上不走 emit 链)。「转后台」依赖
 *  Kimi Code 0.39+ 的 POST /tasks/{id}:detach;inject 失败(沙箱)或版本不可
 *  解析时退化为按钮照常显示(对齐 AgentPanel 的 detachSupported 写法)。 */
const client = inject(KIMI_CLIENT_KEY, null);
const detachSupported = computed(() => {
  const version = client?.serverVersion.value;
  if (!version) return true;
  const relation = compareKimiVersions(version, '0.39.0');
  return relation === null || relation >= 0;
});

// 40904 — cancel raced the task reaching a terminal state: idempotent
// "already in the desired end state" conflict, stay silent (the row's real
// status converges via the task event stream / poll).
const TASK_ALREADY_FINISHED_CODE = 40904;
// 40406 — REST /tasks does not know the id we sent (row never registered with
// the background-task store); explain instead of surfacing a raw error.
const TASK_NOT_IN_STORE_CODE = 40406;

function isTaskAlreadyFinishedError(err: unknown): boolean {
  return isDaemonApiError(err) && err.code === TASK_ALREADY_FINISHED_CODE;
}

function isTaskNotInStoreError(err: unknown): boolean {
  return isDaemonApiError(err) && err.code === TASK_NOT_IN_STORE_CODE;
}

const rows = computed(() => [...tasks.value.values()]
  .filter((task) => filter.value === 'all' || (filter.value === 'running' ? task.status === 'running' : task.kind === filter.value))
  .toSorted((a, b) => Number(b.status === 'running') - Number(a.status === 'running') || Date.parse(b.startedAt || b.createdAt) - Date.parse(a.startedAt || a.createdAt)));
const runningCount = computed(() => [...tasks.value.values()].filter((task) => task.status === 'running').length);

async function refresh(): Promise<void> {
  if (!props.open || loading.value) return;
  loading.value = true;
  try {
    const page = await getKimiWebApi().listSessions({ busy: true, pageSize: 100 });
    const lists = await Promise.all(page.items.map(async (session) => ({ session, items: await getKimiWebApi().listTasks(session.id) })));
    const snapshot = buildGlobalTaskSnapshot(lists);
    sessions.value = snapshot.sessions;
    tasks.value = snapshot.tasks;
  } catch (error) {
    toast(error instanceof Error ? error.message : '全局任务刷新失败');
  } finally { loading.value = false; }
}

async function cancel(task: AppTask): Promise<void> {
  try {
    await getKimiWebApi().cancelTask(task.sessionId, task.backgroundTaskId ?? task.id);
    toast('已请求停止后台任务');
    await refresh();
  } catch (error) {
    if (isTaskAlreadyFinishedError(error)) return; // 已终态 = 期望结果,静默
    if (isTaskNotInStoreError(error)) {
      toast('该任务未在后台任务库注册');
      return;
    }
    toast(error instanceof Error ? error.message : '停止任务失败');
  }
}

/** Kimi Code 0.39+:前台 bash/工具任务移入后台继续运行。面板行来自 REST
 *  /tasks,行 id 即任务库 id,直接用于 :detach。成功无 toast:行状态由
 *  daemon 重发的 task.started 与 5s 轮询收敛,这里只做轻量本地翻转让入口
 *  立即消失。 */
async function detach(task: AppTask): Promise<void> {
  try {
    const result = await getKimiWebApi().detachTask(task.sessionId, task.id);
    if (!result.detached) return;
    const key = `${task.sessionId}:${task.id}`;
    const row = tasks.value.get(key);
    if (row) tasks.value.set(key, { ...row, runInBackground: true, status: result.status });
  } catch (error) {
    if (isTaskNotInStoreError(error)) {
      toast('该任务未在后台任务库注册');
      return;
    }
    toast(error instanceof Error ? error.message : '转后台失败');
  }
}

function openSession(id: string): void {
  emit('open-session', id);
  emit('close');
}

function label(task: AppTask): string {
  if (task.description) return task.description;
  if (task.command) return task.command;
  return task.kind === 'subagent' ? '子智能体任务' : task.kind === 'bash' ? '后台命令' : '后台工具';
}

watch(() => props.open, (open) => {
  if (timer !== undefined) window.clearInterval(timer);
  timer = undefined;
  if (open) {
    void refresh();
    timer = window.setInterval(() => void refresh(), 5_000);
  } else {
    sessions.value = new Map();
    tasks.value = new Map();
  }
}, { immediate: true });
onUnmounted(() => { if (timer !== undefined) window.clearInterval(timer); });
</script>

<template>
  <div v-if="open" class="global-task-overlay" @click.self="emit('close')">
    <aside class="global-task-panel" role="dialog" aria-modal="true" aria-label="全局后台任务">
      <header><div><CodexIcon name="list" /><span><strong>全局后台任务</strong><small>{{ runningCount }} 项运行中 · 仅打开面板时轮询</small></span></div><button class="icon-btn" title="关闭" @click="emit('close')"><CodexIcon name="x" /></button></header>
      <div class="gt-filters">
        <button :class="{ active: filter === 'all' }" @click="filter = 'all'">全部 {{ tasks.size }}</button>
        <button :class="{ active: filter === 'running' }" @click="filter = 'running'">运行中 {{ runningCount }}</button>
        <button :class="{ active: filter === 'subagent' }" @click="filter = 'subagent'">子智能体</button>
        <button :class="{ active: filter === 'bash' }" @click="filter = 'bash'">Bash</button>
        <button class="gt-refresh" :disabled="loading" @click="refresh"><CodexIcon name="spinner" :class="{ spinning: loading }" /></button>
      </div>
      <div class="gt-list">
        <article v-for="task in rows" :key="`${task.sessionId}:${task.id}`" class="gt-row">
          <span class="gt-kind"><CodexIcon :name="task.kind === 'subagent' ? 'bot' : 'terminal'" /></span>
          <button class="gt-main" @click="openSession(task.sessionId)">
            <strong>{{ label(task) }}</strong>
            <span>{{ sessions.get(task.sessionId)?.title || task.sessionId }}</span>
            <small><span class="gt-dot" :class="task.status" />{{ task.status === 'running' ? '运行中' : task.status === 'completed' ? '已完成' : task.status === 'failed' ? '失败' : '已取消' }}<template v-if="task.model"> · {{ task.model }}</template><template v-if="task.startedAt || task.createdAt"> · {{ formatLocalDateTime(task.startedAt || task.createdAt) }}</template></small>
          </button>
          <div v-if="task.status === 'running'" class="gt-actions">
            <button
              v-if="detachSupported && task.runInBackground !== true"
              class="icon-btn"
              title="移到后台继续运行"
              @click="detach(task)"
            ><CodexIcon name="move-down" /></button>
            <button class="btn danger" @click="cancel(task)">停止</button>
          </div>
          <button v-else class="icon-btn" title="打开所属任务" @click="openSession(task.sessionId)"><CodexIcon name="external" /></button>
        </article>
        <div v-if="!loading && !rows.length" class="gt-empty">当前没有匹配的后台任务</div>
      </div>
      <footer>面板关闭后停止轮询，避免在日常聊天中产生额外请求。</footer>
    </aside>
  </div>
</template>

<style scoped>
.global-task-overlay{position:fixed;inset:0;z-index:var(--z-modal);background:color-mix(in srgb,var(--text) 14%,transparent)}.global-task-panel{position:absolute;top:0;right:0;width:min(460px,calc(100vw - 24px));height:100%;display:flex;flex-direction:column;background:var(--bg);border-left:1px solid var(--border);box-shadow:var(--shadow-lg);color:var(--text)}header{height:64px;display:flex;justify-content:space-between;align-items:center;padding:0 16px;border-bottom:1px solid var(--border)}header>div{display:flex;align-items:center;gap:10px}header span{display:flex;flex-direction:column}header small{color:var(--text-3);font-size:11px}.gt-filters{display:flex;gap:4px;padding:10px;border-bottom:1px solid var(--border);background:var(--bg-soft)}.gt-filters button{border:0;border-radius:var(--r-md);padding:7px 9px;background:transparent;color:var(--text-3);cursor:pointer;font-size:11px}.gt-filters button.active{background:var(--bg);color:var(--text);box-shadow:var(--shadow-sm)}.gt-filters .gt-refresh{margin-left:auto}.spinning{animation:gt-spin 1s linear infinite}@keyframes gt-spin{to{transform:rotate(360deg)}}.gt-list{flex:1;min-height:0;overflow:auto}.gt-row{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;padding:13px 14px;border-bottom:1px solid var(--border-soft)}.gt-kind{display:grid;place-items:center;width:34px;height:34px;border-radius:var(--r-lg);background:var(--bg-soft);color:var(--text-2)}.gt-main{min-width:0;display:flex;flex-direction:column;gap:3px;align-items:flex-start;text-align:left;border:0;background:none;color:inherit;cursor:pointer}.gt-main strong,.gt-main span{max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gt-main strong{font-size:12px}.gt-main>span,.gt-main small{color:var(--text-3);font-size:10px}.gt-dot{display:inline-block;width:7px;height:7px;margin-right:5px;border-radius:var(--r-full);background:var(--text-3)}.gt-dot.running{background:var(--success)}.gt-dot.failed{background:var(--danger)}.gt-empty{padding:60px 20px;text-align:center;color:var(--text-3)}.gt-actions{display:flex;gap:6px;align-items:center}footer{padding:10px 14px;border-top:1px solid var(--border);color:var(--text-3);font-size:10px}
</style>
