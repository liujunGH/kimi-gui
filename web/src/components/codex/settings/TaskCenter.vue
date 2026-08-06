<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { AppSession } from '../../../api/types';
import { getKimiWebApi } from '../../../api';
import { useKimiClient } from '../../../composables/codex/useKimiClient';
import { useToast } from '../layout/Toast.vue';
import { formatLocalDateTime } from '../../../lib/formatMessageTime';
import { kimiNativeAvailable, kimiRuntime } from '../../../composables/useKimiRuntime';
import { setEphemeralCredential } from '../../../api/daemon/serverAuth';
import { filterAndSortTaskSessions, sessionContextPercent, type TaskCenterSort, type TaskCenterStatus } from '../../../lib/taskCenter';
import CodexIcon from '../layout/CodexIcon.vue';
import PromptDialog from '../layout/PromptDialog.vue';

const emit = defineEmits<{ (e: 'open-session', id: string): void }>();
const client = useKimiClient();
const { toast } = useToast();
const nativeAvailable = kimiNativeAvailable();
const sessions = ref<AppSession[]>([]);
const selected = ref<string[]>([]);
const query = ref('');
const status = ref<TaskCenterStatus>('all');
const model = ref('');
const sort = ref<TaskCenterSort>('updated');
const loading = ref(false);
const actionBusy = ref(false);
const deleteIds = ref<string[]>([]);
const shown = ref(30);
const restoreRestartOpen = ref(false);
const pendingOpenSessionId = ref('');

const rows = computed(() => filterAndSortTaskSessions(sessions.value, query.value, status.value, model.value, sort.value));
const visibleRows = computed(() => rows.value.slice(0, shown.value));
const models = computed(() => [...new Set(sessions.value.map((s) => s.model).filter(Boolean))].sort());
const selectedRows = computed(() => sessions.value.filter((s) => selected.value.includes(s.id)));
const allVisibleSelected = computed(() => rows.value.length > 0 && rows.value.every((s) => selected.value.includes(s.id)));

async function load(): Promise<void> {
  loading.value = true;
  try {
    const merged = new Map<string, AppSession>();
    let beforeId: string | undefined;
    for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
      const page = await getKimiWebApi().listSessions({ includeArchive: true, beforeId, pageSize: 100 });
      for (const session of page.items) merged.set(session.id, session);
      if (!page.hasMore || page.items.length === 0) break;
      beforeId = page.items.at(-1)?.id;
    }
    sessions.value = [...merged.values()];
    selected.value = selected.value.filter((id) => merged.has(id));
  } catch (error) {
    toast(error instanceof Error ? error.message : '任务中心加载失败');
  } finally {
    loading.value = false;
  }
}

function toggleSelection(id: string): void {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((value) => value !== id)
    : [...selected.value, id];
}

function toggleVisible(): void {
  const visibleIds = rows.value.map((s) => s.id);
  selected.value = allVisibleSelected.value
    ? selected.value.filter((id) => !visibleIds.includes(id))
    : [...new Set([...selected.value, ...visibleIds])];
}

async function openSession(session: AppSession): Promise<void> {
  if (session.archived) {
    const restored = await client.restoreSession(session.id);
    if (!restored) return;
    if (nativeAvailable) {
      pendingOpenSessionId.value = session.id;
      restoreRestartOpen.value = true;
      return;
    }
    toast('任务已恢复；请重启 Kimi Engine 后再继续对话');
  }
  emit('open-session', session.id);
}

function requestRestoreRestart(): void {
  if (nativeAvailable) restoreRestartOpen.value = true;
  else toast('任务已恢复；请重启 Kimi Engine 后再继续对话');
}

async function restartAfterRestore(): Promise<void> {
  restoreRestartOpen.value = false;
  actionBusy.value = true;
  try {
    if (pendingOpenSessionId.value) emit('open-session', pendingOpenSessionId.value);
    const info = await kimiRuntime.restartDaemon();
    setEphemeralCredential(info.token);
    localStorage.setItem('kimi-gui.daemon-base', info.base);
    toast('任务已恢复，Kimi Engine 已重启');
    window.setTimeout(() => window.location.reload(), 500);
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Kimi Engine 重启失败');
  } finally {
    pendingOpenSessionId.value = '';
    actionBusy.value = false;
  }
}

function deferRestoreRestart(): void {
  restoreRestartOpen.value = false;
  const sessionId = pendingOpenSessionId.value;
  pendingOpenSessionId.value = '';
  toast('任务已恢复；继续对话前请在 Kimi Engine 设置中重启');
  if (sessionId) emit('open-session', sessionId);
}

async function archiveOne(session: AppSession): Promise<void> {
  actionBusy.value = true;
  try {
    await client.archiveSession(session.id);
    toast('任务已归档');
    await load();
  } finally {
    actionBusy.value = false;
  }
}

async function restoreOne(session: AppSession): Promise<void> {
  actionBusy.value = true;
  try {
    if (await client.restoreSession(session.id)) {
      toast('任务已恢复');
      requestRestoreRestart();
    }
    await load();
  } finally {
    actionBusy.value = false;
  }
}

async function batchArchiveOrRestore(action: 'archive' | 'restore'): Promise<void> {
  const targets = selectedRows.value.filter((s) => action === 'archive' ? !s.archived : s.archived);
  if (!targets.length) return;
  actionBusy.value = true;
  try {
    for (const session of targets) {
      if (action === 'archive') await client.archiveSession(session.id);
      else await client.restoreSession(session.id);
    }
    toast(`已${action === 'archive' ? '归档' : '恢复'} ${targets.length} 个任务`);
    if (action === 'restore') requestRestoreRestart();
    selected.value = [];
    await load();
  } finally {
    actionBusy.value = false;
  }
}

async function permanentlyDelete(): Promise<void> {
  const targets = deleteIds.value;
  deleteIds.value = [];
  if (!nativeAvailable || !targets.length) return;
  actionBusy.value = true;
  try {
    for (const id of targets) await kimiRuntime.deleteArchivedSession(id);
    selected.value = selected.value.filter((id) => !targets.includes(id));
    toast(`已永久删除 ${targets.length} 个归档任务`);
    await load();
  } catch (error) {
    toast(error instanceof Error ? error.message : '永久删除失败');
  } finally {
    actionBusy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="task-center">
    <div class="task-summary">
      <div><strong>{{ sessions.length }}</strong><span>全部任务</span></div>
      <div><strong>{{ sessions.filter((s) => s.busy).length }}</strong><span>运行中</span></div>
      <div><strong>{{ sessions.filter((s) => s.pendingInteraction && s.pendingInteraction !== 'none').length }}</strong><span>待处理</span></div>
      <div><strong>{{ sessions.filter((s) => s.archived).length }}</strong><span>已归档</span></div>
    </div>
    <div class="task-filters">
      <label class="task-search"><CodexIcon name="search" /><input v-model="query" class="control" placeholder="搜索标题、提示、路径或会话 ID" /></label>
      <select v-model="status" class="control" aria-label="任务状态">
        <option value="all">全部状态</option><option value="running">运行中</option><option value="attention">待处理</option><option value="idle">已停止</option><option value="archived">已归档</option>
      </select>
      <select v-model="model" class="control" aria-label="模型"><option value="">全部模型</option><option v-for="item in models" :key="item" :value="item">{{ item }}</option></select>
      <select v-model="sort" class="control" aria-label="排序"><option value="updated">最近更新</option><option value="context">上下文占用</option><option value="title">标题</option></select>
      <button class="btn" :disabled="loading" @click="load"><CodexIcon name="refresh-cw" />{{ loading ? '刷新中…' : '刷新' }}</button>
    </div>
    <div class="task-batch">
      <label><input type="checkbox" :checked="allVisibleSelected" @change="toggleVisible" /> 选择当前结果</label>
      <span class="muted">已选 {{ selected.length }} 项</span>
      <button class="btn" :disabled="actionBusy || !selectedRows.some((s) => !s.archived)" @click="batchArchiveOrRestore('archive')">归档</button>
      <button class="btn" :disabled="actionBusy || !selectedRows.some((s) => s.archived)" @click="batchArchiveOrRestore('restore')">恢复</button>
      <button class="btn danger" :disabled="actionBusy || !nativeAvailable || !selectedRows.some((s) => s.archived)" @click="deleteIds = selectedRows.filter((s) => s.archived).map((s) => s.id)">永久删除归档</button>
    </div>
    <div class="task-list">
      <article v-for="session in visibleRows" :key="session.id" class="task-row">
        <input type="checkbox" :checked="selected.includes(session.id)" :aria-label="`选择 ${session.title || session.id}`" @change="toggleSelection(session.id)" />
        <button class="task-main" @click="openSession(session)">
          <span class="task-title"><span class="status-dot" :class="{ running: session.busy, archived: session.archived, attention: session.pendingInteraction && session.pendingInteraction !== 'none' }" />{{ session.title || '未命名任务' }}</span>
          <span class="task-meta">{{ session.model || '默认模型' }} · {{ session.cwd || '未记录路径' }}</span>
          <span v-if="session.lastPrompt" class="task-preview">{{ session.lastPrompt }}</span>
          <span class="task-statline"><template v-if="session.usage.contextLimit > 0">上下文 {{ sessionContextPercent(session) }}% · </template>{{ session.updatedAt ? formatLocalDateTime(session.updatedAt) : '时间未知' }}</span>
        </button>
        <div class="task-actions">
          <button class="icon-btn" title="打开" @click="openSession(session)"><CodexIcon name="external" /></button>
          <button v-if="session.archived" class="icon-btn" title="恢复" :disabled="actionBusy" @click="restoreOne(session)"><CodexIcon name="reply" /></button>
          <button v-else class="icon-btn" title="归档" :disabled="actionBusy || session.busy" @click="archiveOne(session)"><CodexIcon name="archive" /></button>
          <button class="icon-btn" title="导出" @click="client.exportSession(session.id)"><CodexIcon name="download" /></button>
          <button v-if="session.archived" class="icon-btn danger" title="永久删除" :disabled="!nativeAvailable" @click="deleteIds = [session.id]"><CodexIcon name="trash" /></button>
        </div>
      </article>
      <div v-if="!loading && !rows.length" class="task-empty">没有匹配的任务</div>
      <button v-if="visibleRows.length < rows.length" class="task-more" @click="shown += 30">再显示 {{ Math.min(30, rows.length - visibleRows.length) }} 条</button>
    </div>
    <div class="settings-callout subtle">永久删除只对已归档任务开放；活动任务需先归档，运行中的任务需先结束。</div>
    <PromptDialog v-if="deleteIds.length" title="永久删除归档任务？" :description="`将永久删除 ${deleteIds.length} 个归档任务的本地记录，此操作无法恢复。`" confirm-label="永久删除" :danger="true" :input="false" @confirm="permanentlyDelete" @cancel="deleteIds = []" />
    <PromptDialog
      v-if="restoreRestartOpen"
      title="重启 Kimi Engine 以继续？"
      description="当前 Kimi Engine 恢复归档任务后，需要重新启动才能可靠地继续对话。重启会短暂断开连接，并中断其他尚未结束的任务。"
      confirm-label="重启并继续"
      :input="false"
      @confirm="restartAfterRestore"
      @cancel="deferRestoreRestart"
    />
  </div>
</template>

<style scoped>
.task-center{display:grid;gap:14px}.task-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.task-summary>div{display:flex;flex-direction:column;padding:14px;border:1px solid var(--border);border-radius:var(--r-lg);background:var(--bg-soft)}.task-summary strong{font-size:22px}.task-summary span,.muted{color:var(--text-3);font-size:12px}.task-filters{display:grid;grid-template-columns:minmax(220px,1fr) repeat(3,minmax(110px,auto)) auto;gap:8px}.task-search{position:relative}.task-search svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);width:15px}.task-search input{width:100%;padding-left:32px}.task-batch{display:flex;gap:8px;align-items:center;padding:8px 0}.task-batch .muted{margin-right:auto}.task-list{border:1px solid var(--border);border-radius:var(--r-xl);overflow:hidden}.task-row{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:12px;align-items:center;padding:13px 14px;border-bottom:1px solid var(--border)}.task-main{min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:3px;border:0;background:none;color:inherit;text-align:left;cursor:pointer}.task-title{display:flex;align-items:center;gap:8px;font-weight:600;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.status-dot{width:8px;height:8px;border-radius:var(--r-full);background:var(--text-3);flex:none}.status-dot.running{background:var(--success);box-shadow:0 0 0 4px var(--success-soft)}.status-dot.attention{background:var(--warning)}.status-dot.archived{background:var(--text-3)}.task-meta,.task-preview,.task-statline{max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-3);font-size:12px}.task-statline{font-size:10px}.task-actions{display:flex;flex:none;gap:3px;align-items:center;white-space:nowrap}.task-empty{padding:48px;text-align:center;color:var(--text-3)}.task-more{width:100%;padding:11px;border:0;border-top:1px solid var(--border);background:var(--bg-soft);color:var(--text-2);cursor:pointer}
@media(max-width:1050px){.task-filters{grid-template-columns:1fr 1fr}.task-summary{grid-template-columns:1fr 1fr}}
</style>
