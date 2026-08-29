<script setup lang="ts">
/**
 * CodexApp —— codex UI 的真产品入口
 *
 * 轮次 4a(kimi3 装配):在 C1 主链路(Sidebar/Conversation/Composer)之上,
 * 把轮次 2 的组件全部挂上真 client 数据:
 * - DetailPane(⌘I)/ SideTask(⌥⌘S)/ ThreadMenu / AgentPanel(子智能体)/ SettingsPage(覆盖层)
 * - 审批卡随 turn.approval 在对话流内联渲染(approve/reject 走 client.respondApproval)
 * - 新建任务 = 一键草稿态 + 聚焦;工作区选择 = 侧栏组名点选,「工作区」标题行 + 添加(原生文件夹选择)
 * - Composer 数据:skills(真)/ builtin(i18n)/ queue(真)/ context(真 usage)
 *
 * 数据边界:组件零 mock;context quota、文件树、diff/review 数据流等轮次 4(ZCode)。
 */
import { computed, defineAsyncComponent, onMounted, onUnmounted, provide, ref, watch } from 'vue';
import { useKimiWebClient } from '../composables/useKimiWebClient';
import { KIMI_CLIENT_KEY } from '../composables/codex/useKimiClient';
import { useUIState } from '../composables/codex/useUIState';
import { useHotkeys } from '../composables/codex/useHotkeys';
import { useTheme } from '../composables/codex/useTheme';
import { useTauriDaemon } from '../composables/codex/useTauriDaemon';
import { getCredential, onAuthRequired, setEphemeralCredential } from '../api/daemon/serverAuth';
import { getKimiWebApi } from '../api';
import { parseSlash, SLASH_COMMANDS, stripSkillPrefix } from '../lib/slashCommands';
import { resolveBuiltinCommand, type CommandMapping } from '../lib/commandRegistry';
import i18n from '../i18n';
import type { ChatTurn, TaskItem, TodoView, ToolCall } from '../types';
import type {
  ChangedFile,
  ContextInfo,
  DiffHunk,
  EffortLevel,
  PromptAttachment,
  ComposerMode,
  ModeFlags,
  QueuedPrompt,
  QuotaInfo,
  SessionFilter,
  Subagent,
} from '../types/codex';
import type { PermissionMode } from '../types';

import AppShell from '../components/codex/AppShell.vue';
import Sidebar from '../components/codex/sidebar/Sidebar.vue';
import ConversationPane from '../components/codex/chat/ConversationPane.vue';
import Composer from '../components/codex/composer/Composer.vue';
import QueuePanel from '../components/codex/composer/QueuePanel.vue';
import DetailPane from '../components/codex/detail/DetailPane.vue';
import SideTask from '../components/codex/layout/SideTask.vue';
import ThreadMenu from '../components/codex/layout/ThreadMenu.vue';
import WorkspacePicker from '../components/codex/layout/WorkspacePicker.vue';
import Toast, { useToast } from '../components/codex/layout/Toast.vue';
import PromptDialog from '../components/codex/layout/PromptDialog.vue';
import CacheExpiryDialog from '../components/codex/layout/CacheExpiryDialog.vue';
import AgentPanel from '../components/codex/agents/AgentPanel.vue';
import GlobalTaskPanel from '../components/codex/tasks/GlobalTaskPanel.vue';
import ReviewPane from '../components/codex/diff/ReviewPane.vue';
import OfficialModelPicker from '../components/settings/ModelPicker.vue';
import Onboarding from '../components/settings/Onboarding.vue';
import OfficialGoalStrip from '../components/chat/GoalStrip.vue';
import OfficialServerAuthDialog from '../components/ServerAuthDialog.vue';
import CommandPalette, { type PaletteAction, type PaletteSession } from '../components/codex/layout/CommandPalette.vue';
import CommandHelpDialog from '../components/codex/layout/CommandHelpDialog.vue';
import UndoDialog from '../components/codex/layout/UndoDialog.vue';
import UpdateDialog from '../components/codex/layout/UpdateDialog.vue';
import { useUpdater } from '../composables/codex/useUpdater';
import { formatLocalDateTime } from '../lib/formatMessageTime';
import type { UIQuestion } from '../types';
import { toDiffHunks } from '../components/codex/diff/diffMapper';
import CodexIcon from '../components/codex/layout/CodexIcon.vue';
import MessageUser from '../components/codex/chat/MessageUser.vue';
import ApprovalCard from '../components/codex/approval/ApprovalCard.vue';
import { fromApprovalBlock } from '../components/codex/approval/approvalMapper';
import AgentPicker from '../components/codex/composer/AgentPicker.vue';
import { copyTextToClipboard } from '../lib/clipboard';
import { kimiRuntime, type KimiAgentProfile } from '../composables/useKimiRuntime';
import type { AppAgentConfigInput, AppConfig, AppProviderFormInput } from '../api/types';
import { quotaInfoFromOAuthUsage } from '../lib/quotaUsage';
import { resolveSubagentModel, type SubagentModelResolution } from '../lib/subagentModel';
import { compareKimiVersions, MINIMUM_KIMI_CODE_VERSION } from '../lib/kimiVersion';
import { decideCacheExpiryHint, readCacheExpiryHintEnabled, writeCacheExpiryHintEnabled } from '../lib/cacheHint';

const SettingsPage = defineAsyncComponent(
  () => import('../components/codex/settings/SettingsPage.vue'),
);
const PluginTuiDialog = defineAsyncComponent(
  () => import('../components/codex/settings/PluginTuiDialog.vue'),
);
const MessageAssistant = defineAsyncComponent(
  () => import('../components/codex/chat/MessageAssistant.vue'),
);
const OfficialQuestionCard = defineAsyncComponent(
  () => import('../components/chat/QuestionCard.vue'),
);
const ProviderManager = defineAsyncComponent(
  () => import('../components/settings/ProviderManager.vue'),
);
const Terminal = defineAsyncComponent(
  () => import('../components/Terminal.vue'),
);

// 1. 顶层 client 装配 + provide(整个 codex UI 的数据源)
const client = useKimiWebClient();
provide(KIMI_CLIENT_KEY, client);
// 官方 Markdown.vue inject('resolveImage') 用于解析消息里的本地图片路径
provide('resolveImage', client.resolveImageUrl);

// shell 先挂载；Tauri 下凭证通过 IPC 取回后再拉首轮数据，避免未授权请求和冷启动白屏。
const tauriDaemon = useTauriDaemon();
const booting = ref(true);
const workspaceDropActive = ref(false);
let unlistenWorkspaceDrop: (() => void) | null = null;
async function bootClient(): Promise<void> {
  try {
    if (tauriDaemon.isTauri() && !getCredential()) {
      const info = await tauriDaemon.fetch();
      if (info?.token) setEphemeralCredential(info.token);
    }
    await client.load();
  } finally {
    booting.value = false;
  }
}
onMounted(() => void bootClient());
onMounted(() => {
  if (!tauriDaemon.isTauri()) return;
  void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
    unlistenWorkspaceDrop = await getCurrentWindow().onDragDropEvent(async (event) => {
      if (event.payload.type === 'enter' || event.payload.type === 'over') {
        workspaceDropActive.value = true;
        return;
      }
      if (event.payload.type === 'leave') {
        workspaceDropActive.value = false;
        return;
      }
      workspaceDropActive.value = false;
      const { invoke } = await import('@tauri-apps/api/core');
      let added = 0;
      let attached = 0;
      for (const path of event.payload.paths) {
        try {
          if (await invoke<boolean>('path_is_directory', { path })) {
            // 按真实结果计数:addWorkspaceByPath 失败(重复/daemon 拒绝)不报成功
            if (await client.addWorkspaceByPath(path)) added += 1;
          } else if (composerRef.value) {
            // Kimi Code 0.39+ zero-copy attach: dropped files become path
            // attachments (the daemon reads them in place — no upload).
            if (composerRef.value.addPathAttachment(path)) attached += 1;
          } else {
            // 设置页等场景 Composer 已卸载:不假装附加成功
            toast('请先返回对话界面再拖入文件');
          }
        } catch (error) {
          toast(`处理 ${path} 失败:${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (added) toast(`已从拖放添加 ${added} 个工作区`);
      else if (attached) toast(`已附加 ${attached} 个文件(本地路径直传,未上传)`);
    });
  }).catch(() => undefined);
});
onUnmounted(() => {
  unlistenWorkspaceDrop?.();
  unlistenWorkspaceDrop = null;
});

const contractUpgradeBusy = ref(false);
const contractUpgradeStatus = ref('');
async function upgradeContractRuntime(): Promise<void> {
  if (!tauriDaemon.isTauri()) {
    contractUpgradeStatus.value = `请在本机运行 kimi update，并使用 Kimi Code ${MINIMUM_KIMI_CODE_VERSION}+ 的 v2 daemon 重新连接。`;
    return;
  }
  contractUpgradeBusy.value = true;
  contractUpgradeStatus.value = '正在检查本机 Kimi CLI…';
  try {
    let engine = await kimiRuntime.engineStatus();
    const relation = engine.version
      ? compareKimiVersions(engine.version, MINIMUM_KIMI_CODE_VERSION)
      : null;
    if (relation === null || relation < 0) {
      contractUpgradeStatus.value = '正在更新 Kimi CLI…';
      await kimiRuntime.runMaintenance('update');
      engine = await kimiRuntime.engineStatus();
    }
    const updated = engine.version
      ? compareKimiVersions(engine.version, MINIMUM_KIMI_CODE_VERSION)
      : null;
    if (updated === null || updated < 0) {
      throw new Error(`CLI 更新后仍低于 ${MINIMUM_KIMI_CODE_VERSION}（当前 ${engine.version ?? '未知'}）`);
    }
    contractUpgradeStatus.value = '正在迁移 0.33 配置键…';
    await kimiRuntime.migrate033Config();
    contractUpgradeStatus.value = `正在使用 CLI ${engine.version} 重启 daemon…`;
    const info = await kimiRuntime.restartDaemon();
    setEphemeralCredential(info.token);
    localStorage.setItem('kimi-gui.daemon-base', info.base);
    contractUpgradeStatus.value = '新版 daemon 已启动，正在重新连接…';
    window.setTimeout(() => window.location.reload(), 400);
  } catch (error) {
    contractUpgradeStatus.value = error instanceof Error ? error.message : String(error);
  } finally {
    contractUpgradeBusy.value = false;
  }
}

// 2. UI 状态
const ui = useUIState();
const { toggle: toggleTheme } = useTheme();
const { toast } = useToast();

// 401 监听:daemon 拒绝 token 时弹官方 ServerAuthDialog(浏览器 dev 流程)
const authRequired = ref(false);
let offAuthRequired: (() => void) | null = null;
onMounted(() => {
  offAuthRequired = onAuthRequired(() => {
    authRequired.value = true;
    client.clearDangerousBypassAuth();
  });
});

function onExternalUrlEvent(event: Event): void {
  const detail = (event as CustomEvent<{ url?: unknown; label?: unknown }>).detail;
  if (typeof detail?.url !== 'string') return;
  toast(`正在打开${typeof detail.label === 'string' ? detail.label : '授权页面'}`);
  void openExternalUrl(detail.url);
}
onMounted(() => window.addEventListener('kimi-gui:external-url', onExternalUrlEvent));
onUnmounted(() => window.removeEventListener('kimi-gui:external-url', onExternalUrlEvent));
onUnmounted(() => offAuthRequired?.());
const showServerAuth = computed(
  () => !client.dangerousBypassAuth.value && authRequired.value,
);

// 启动静默检查更新(失败静默;发现新版本弹 UpdateDialog)
const { checkForUpdate } = useUpdater();
onMounted(() => {
  setTimeout(() => void checkForUpdate(true), 5000);
});

// daemon 连接失败兜底提示。桌面凭证只保存在内存中，不能检查旧版的
// localStorage key：桌面入口会主动删除它，所以那个判断会在已经连接时也
// 固定误报。只有连接仍未恢复且 IPC 也没拿到凭证时才提示。
onMounted(() => {
  setTimeout(() => {
    try {
      if (
        '__TAURI_INTERNALS__' in window &&
        client.connection.value !== 'connected' &&
        !getCredential()
      ) {
        toast('本地 daemon 尚未就绪，请在「设置 → Kimi Engine」检查 CLI');
      }
    } catch {
      /* ignore */
    }
  }, 12000);
});

// 3. 侧栏 + Composer 状态
const filter = ref<SessionFilter>((localStorage.getItem('kimi-ui.session-filter') as SessionFilter) || 'all');
watch(filter, (f) => localStorage.setItem('kimi-ui.session-filter', f));
// 置顶持久化(localStorage;无 daemon 端点,纯客户端偏好)
const PIN_KEY = 'codex.pinned-sessions';
const pinnedIds = ref<string[]>((() => {
  try {
    const v = JSON.parse(localStorage.getItem(PIN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
})());
const workspaceTrust = ref<Record<string, boolean | null | undefined>>({});
const workspaceTrustBusy = ref<string[]>([]);
watch(pinnedIds, (v) => {
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}, { deep: true });
const composerMode = ref<ComposerMode>('queue');
const settingsOpen = ref(false);
const commandHelpOpen = ref(false);
const undoDialogOpen = ref(false);
const showOnboarding = ref(!client.onboarded.value);
const agentsLoading = ref(false);
const agentProfiles = ref<KimiAgentProfile[]>([]);
const draftAgentName = ref('default');
const agentBySession = ref<Record<string, string>>({});
let pendingAgentBinding: string | null = null;

async function loadAgents(): Promise<void> {
  if (!tauriDaemon.isTauri()) return;
  agentsLoading.value = true;
  try {
    const root = client.workspacesView.value.find((workspace) => workspace.id === client.activeWorkspaceId.value)?.root;
    agentProfiles.value = await kimiRuntime.listAgents(root);
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Agent 列表加载失败');
  } finally {
    agentsLoading.value = false;
  }
}

const composerAgentName = computed(() => {
  const sid = client.activeSessionId.value;
  return sid ? (agentBySession.value[sid] ?? 'default') : draftAgentName.value;
});
watch(() => client.activeWorkspaceId.value, () => void loadAgents());
watch(() => client.activeSessionId.value, (sid) => {
  if (sid && pendingAgentBinding) {
    agentBySession.value = { ...agentBySession.value, [sid]: pendingAgentBinding };
    pendingAgentBinding = null;
  }
});

function selectedAgentConfig(): AppAgentConfigInput | undefined {
  if (draftAgentName.value === 'default') return undefined;
  const profile = agentProfiles.value.find((agent) => agent.name === draftAgentName.value);
  if (!profile) return undefined;
  return {
    systemPrompt: profile.prompt,
    ...(profile.tools.length > 0 ? { tools: profile.tools } : {}),
  };
}

function openAgentSettings(): void {
  settingsSection.value = 'agents';
  settingsOpen.value = true;
}

function togglePin(id: string) {
  pinnedIds.value = pinnedIds.value.includes(id)
    ? pinnedIds.value.filter((x) => x !== id)
    : [...pinnedIds.value, id];
  toast(pinnedIds.value.includes(id) ? '已置顶' : '已取消置顶');
}

let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
let searchGeneration = 0;

/** Cmd+K / 侧栏搜索框点击：先用已加载会话，输入后再查询 daemon 全文索引。 */
function openSearch() {
  showSearch.value = true;
  searchSessionIndex.value = [];
  searchLoading.value = false;
  searchHint.value = '输入至少 2 个字可搜索全部历史';
  searchGeneration++;
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
}

function onPaletteQuery(value: string): void {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  const query = value.trim();
  const generation = ++searchGeneration;
  searchSessionIndex.value = [];
  searchLoading.value = false;
  if (query.length < 2) {
    searchHint.value = query ? '再输入 1 个字以搜索全部历史' : '输入至少 2 个字可搜索全部历史';
    return;
  }
  searchHint.value = '';
  searchDebounceTimer = setTimeout(() => {
    searchLoading.value = true;
    void getKimiWebApi().searchAll({ query, pageSize: 50 }).then((result) => {
      if (generation !== searchGeneration) return;
      const workspaces = client.workspacesView.value ?? [];
      const unique = new Map<string, PaletteSession>();
      for (const item of result.items) {
        if (unique.has(item.sessionId)) continue;
        const workspace = workspaces.find((candidate) => candidate.id === item.workspaceId);
        unique.set(item.sessionId, {
          id: item.sessionId,
          title: item.sessionTitle || item.sessionId,
          meta: workspace?.name,
          workspaceName: workspace?.name,
          lastPrompt: item.snippet,
        });
      }
      searchSessionIndex.value = [...unique.values()];
      searchHint.value = result.indexState.state === 'building'
        ? `索引构建中 · 已找到 ${unique.size} 条`
        : unique.size > 0
          ? `${unique.size} 条全局结果${result.incomplete ? ' · 结果可能不完整' : ''}`
          : '没有匹配的历史会话';
    }).catch((error) => {
      if (generation !== searchGeneration) return;
      console.warn('[kimi-gui] global session search failed', error);
      searchHint.value = '全局搜索暂不可用，已显示当前加载的会话';
    }).finally(() => {
      if (generation === searchGeneration) searchLoading.value = false;
    });
  }, 250);
}
onUnmounted(() => { if (searchDebounceTimer) clearTimeout(searchDebounceTimer); });

useHotkeys([
  {
    key: 'k',
    meta: true,
    handler: () => {
      openSearch();
      return true;
    },
  },
  {
    key: 'i',
    meta: true,
    handler: () => {
      ui.detailPaneOpen.value ? ui.closeDetail() : ui.openDetail('thread');
      return true;
    },
  },
  {
    key: 's',
    meta: true,
    alt: true,
    handler: () => {
      ui.sideTaskOpen.value ? ui.closeSideTask() : ui.openSideTask('thread');
      return true;
    },
  },
  {
    key: 'p',
    meta: true,
    alt: true,
    handler: () => {
      if (client.activeSessionId.value) togglePin(client.activeSessionId.value);
      return true;
    },
  },
  {
    key: 'b',
    meta: true,
    handler: () => {
      if (!changedFiles.value.length) return;
      ui.reviewPaneOpen.value ? ui.closeReview() : ui.openReview();
      return true;
    },
  },
  {
    key: 'r',
    meta: true,
    alt: true,
    handler: () => {
      // ⌥⌘R 重命名(ThreadMenu 里已标注该快捷键)
      onRenameSession();
      return true;
    },
  },
  {
    key: 'a',
    meta: true,
    shift: true,
    handler: () => {
      // ⇧⌘A 归档(ThreadMenu 里已标注该快捷键)
      if (client.activeSessionId.value) onArchiveSessionById(client.activeSessionId.value);
      return true;
    },
  },
  {
    key: 'Escape',
    handler: () => {
      // 先分层关闭浮层;无浮层可关时,运行中则中断当前轮(对齐官方 ConversationPane 的 Esc)
      if (ui.escClose()) return true;
      if (conversationRunning.value) {
        void client.abortCurrentPrompt();
        return true;
      }
      return false;
    },
  },
]);

// ---------------------------------------------------------------- 侧栏数据

const WORKSPACE_DECORATIONS_KEY = 'kimi-ui.workspace-decorations.v1';
type WorkspaceDecoration = { emoji?: string; pinned?: boolean };
const workspaceDecorations = ref<Record<string, WorkspaceDecoration>>((() => {
  try {
    return JSON.parse(localStorage.getItem(WORKSPACE_DECORATIONS_KEY) || '{}') as Record<string, WorkspaceDecoration>;
  } catch {
    return {};
  }
})());
function saveWorkspaceDecorations(): void {
  localStorage.setItem(WORKSPACE_DECORATIONS_KEY, JSON.stringify(workspaceDecorations.value));
}
const sidebarWorkspaces = computed(() => (client.workspacesView.value ?? [])
  .map((workspace) => ({ ...workspace, ...workspaceDecorations.value[workspace.id] }))
  .toSorted((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))));
const sidebarSessions = computed(() => client.sessionsForView.value ?? []);
const sidebarCurrentWsId = computed(() => client.activeWorkspaceId.value ?? '');
const sidebarCurrentWs = computed(() => {
  const id = client.activeWorkspaceId.value ?? '';
  return (client.workspacesView.value ?? []).find((w) => w.id === id)?.name ?? id;
});
const sidebarCurrentWsRoot = computed(() => {
  const id = client.activeWorkspaceId.value ?? '';
  return (client.workspacesView.value ?? []).find((workspace) => workspace.id === id)?.root ?? '';
});
const sidebarCurrentSession = computed(() => client.activeSessionId.value ?? '');
const activeSession = computed(
  () => (client.sessions.value ?? []).find((s) => s.id === client.activeSessionId.value) ?? null,
);

// ---------------------------------------------------------------- 对话流数据

const conversationTurns = computed<ChatTurn[]>(() => client.turns.value ?? []);
const conversationRunning = computed(() => client.working.value || client.turnActive.value);
const terminalOpen = ref(false);
async function copyLatestAssistantResponse(): Promise<void> {
  for (let i = conversationTurns.value.length - 1; i >= 0; i--) {
    const turn = conversationTurns.value[i];
    if (!turn || turn.role !== 'assistant') continue;
    const text = (turn.blocks ?? [])
      .filter((block) => block.kind === 'text')
      .map((block) => (block.kind === 'text' ? block.text : ''))
      .filter(Boolean)
      .join('\n\n') || turn.text;
    if (!text.trim()) continue;
    toast((await copyTextToClipboard(text)) ? '已复制最近一条回复' : '复制失败');
    return;
  }
  toast('当前会话还没有可复制的回复');
}

function markdownSafeFileName(value: string): string {
  return (value || 'kimi-conversation')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'kimi-conversation';
}

function markdownTurn(turn: ChatTurn): string {
  if (turn.role === 'compaction') {
    const meta = turn.compaction;
    const tokens = meta?.tokensBefore ? ` · ${meta.tokensBefore} → ${meta.tokensAfter ?? '?'} tokens` : '';
    return `---\n\n> 上下文压缩（${meta?.trigger === 'auto' ? '自动' : '手动'}${tokens}）\n\n${turn.text || '_无摘要_'}\n`;
  }
  const label = turn.role === 'user' ? '用户' : turn.role === 'cron' ? '自动任务' : 'Kimi';
  const stamp = turn.createdAt ? ` · ${new Date(turn.createdAt).toLocaleString()}` : '';
  const sections: string[] = [`## ${label}${stamp}\n`];
  if (turn.attachments?.length) {
    sections.push(turn.attachments.map((item) => {
      const name = item.name || item.fileId || item.kind;
      return item.url && !item.url.startsWith('data:') ? `- 附件：[${name}](${item.url})` : `- 附件：${name}`;
    }).join('\n'));
  }
  const blocks = turn.blocks?.length ? turn.blocks : turn.text ? [{ kind: 'text' as const, text: turn.text }] : [];
  for (const block of blocks) {
    if (block.kind === 'text' && block.text.trim()) sections.push(block.text);
    else if (block.kind === 'thinking' && block.thinking.trim()) {
      sections.push(`<details>\n<summary>思考过程</summary>\n\n${block.thinking}\n\n</details>`);
    } else if (block.kind === 'tool') {
      const tool = block.tool;
      const output = tool.output?.length ? `\n\n\`\`\`text\n${tool.output.join('\n')}\n\`\`\`` : '';
      sections.push(`### 工具：${tool.name}\n\n- 参数：${tool.arg || '—'}\n- 状态：${tool.status}${tool.timing ? ` · ${tool.timing}` : ''}${output}`);
    }
  }
  if (turn.cron) sections.push(`> 自动任务：${turn.cron.cron || turn.cron.jobId || '计划触发'}`);
  return `${sections.join('\n\n')}\n`;
}

function conversationMarkdown(): string | null {
  const session = activeSession.value;
  if (!session) {
    toast('请先打开一个会话');
    return null;
  }
  const workspace = client.workspacesView.value.find((item) => item.id === session.workspaceId);
  const metadata = [
    `# ${session.title || 'Kimi 对话'}`,
    '',
    `- 会话 ID：${session.id}`,
    `- 工作区：${workspace?.root || session.workspaceName || '—'}`,
    `- 模型：${client.status.value?.modelId || '—'}`,
    `- 导出时间：${new Date().toLocaleString()}`,
    '',
  ];
  return `${metadata.join('\n')}\n${conversationTurns.value.map(markdownTurn).join('\n')}`;
}

async function copyConversationMarkdown(): Promise<void> {
  const markdown = conversationMarkdown();
  if (!markdown) return;
  toast((await copyTextToClipboard(markdown)) ? '已复制全部对话为 Markdown' : '复制失败');
}

function exportConversationMarkdown(): void {
  const session = activeSession.value;
  const markdown = conversationMarkdown();
  if (!session || !markdown) return;
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${markdownSafeFileName(session.title)}.md`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  toast('Markdown 已导出');
}
const lastAssistantTurnId = computed(() => {
  for (let i = conversationTurns.value.length - 1; i >= 0; i--) {
    if (conversationTurns.value[i]?.role === 'assistant') return conversationTurns.value[i]!.id;
  }
  return '';
});
const todosByTurn = computed<Record<string, TodoView[]>>(() => {
  const todos = client.todos.value ?? [];
  return lastAssistantTurnId.value && todos.length ? { [lastAssistantTurnId.value]: todos } : {};
});
const approvalCount = computed(() => (client.pendingApprovals.value ?? []).length);
/**
 * Most approvals are attached to their tool-use turn by messagesToTurns.
 * Snapshot/event races can leave a valid approval without a loaded tool-use;
 * keep those visible at the transcript tail instead of showing only a count.
 */
const standaloneApprovals = computed(() => {
  const anchored = new Set(
    conversationTurns.value
      .map((turn) => turn.approvalId)
      .filter((id): id is string => Boolean(id)),
  );
  return (client.pendingApprovals.value ?? [])
    .filter((approval) => !anchored.has(approval.approvalId))
    .map((approval) => fromApprovalBlock(approval.block, approval.approvalId));
});
// agent 提问(对话流内联 QuestionCard)
const pendingQuestions = computed<UIQuestion[]>(() => client.questions.value ?? []);
const currentQuestion = computed(() => pendingQuestions.value[0] ?? null);
// 目标条(/goal 创建后显示)
const activeGoal = computed(() => client.goal.value ?? null);
// 压缩摘要(/compact 后显示分隔线)
const compactionInfo = computed(() => client.compaction.value ?? null);
// daemon 警告
const activeWarnings = computed(() => client.warnings.value ?? []);
// 侧栏未读数(用于 Dock badge)
const unreadCount = computed(() => {
  const m = client.unreadBySession.value;
  if (!m) return 0;
  return Object.values(m).filter((v) => v).length;
});
// 压缩分隔线(对话流中显示"上下文已压缩")
const hasCompaction = computed(() => compactionInfo.value !== null);
/** transcript 压缩分隔线点击 → 右栏展示该 turn 的摘要文本(turn.text 即 LLM 摘要) */
function onViewCompaction(turn: ChatTurn) {
  const meta = turn.compaction;
  const tokens = meta?.tokensBefore
    ? ` · ${meta.tokensBefore} → ${meta.tokensAfter ?? '?'} tokens`
    : '';
  const head = `// 上下文压缩摘要(${meta?.trigger === 'auto' ? '自动' : '手动'}${tokens})\n\n`;
  filePreviewContent.value = head + (turn.text || '(无摘要内容)');
  ui.openDetail('thinking');
}
// 未读数变化时更新 Dock badge
watch(unreadCount, (n) => {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    import('@tauri-apps/api/core').then(({ invoke }) => {
      void invoke('set_dock_badge', { count: n });
    }).catch(() => {});
  }
});

const thinkingFullText = computed(() => {
  // 文件预览内容优先(点文件路径时临时显示)
  if (filePreviewContent.value) return filePreviewContent.value;
  // 面板关闭时不做全会话重算(流式期间每个 token 都触发 computed 求值)
  if (!ui.detailPaneOpen.value) return '';
  return conversationTurns.value
    .flatMap((t) => (t.blocks ?? []).filter((b) => b.kind === 'thinking'))
    .map((b) => (b.kind === 'thinking' ? b.thinking : ''))
    .join('\n\n');
});

// 文件预览内容(简化版:复用 DetailPane thinking tab 的 pre 渲染)
const filePreviewContent = ref('');
/** DetailPane 思考大纲分段:与 thinkingFullText 同一 flatMap 顺序,按下标对齐 */
const thinkingSegments = computed(() => {
  if (!ui.detailPaneOpen.value) return [];
  return conversationTurns.value.flatMap((t, ti) =>
    (t.blocks ?? [])
      .filter((b) => b.kind === 'thinking')
      .map((b, bi) => ({
        id: `${t.id}#${bi}`,
        label: `turn ${ti + 1} · ${(b.kind === 'thinking' ? b.thinking : '').trim().slice(0, 60)}`,
      })),
  );
});
const toolCalls = computed(() => {
  if (!ui.detailPaneOpen.value) return []; // 同上:面板关闭零成本
  return conversationTurns.value
    .flatMap((t) => (t.blocks ?? []).filter((b) => b.kind === 'tool'))
    .map((b) => (b.kind === 'tool' ? b.tool : null))
    .filter((x): x is NonNullable<typeof x> => x !== null);
});

// ---------------------------------------------------------------- Composer 数据

const composerPermission = computed(() => client.permission.value ?? 'manual');
const composerModels = computed(() =>
  (client.models.value ?? []).map((m) => ({
    id: m.id,
    name: (m as { displayName?: string }).displayName ?? m.model ?? m.id,
    provider: m.provider,
  })),
);
const composerCurrentModel = computed(() => {
  // 优先读 session 真实选中的 model（status.modelId 是 raw id）
  const statusModelId = client.status.value?.modelId;
  if (statusModelId) return statusModelId;
  // 无 session 时用 starred 或第一个
  const models = client.models.value;
  if (!models || models.length === 0) return '';
  const starred = models.find((m) => client.starredModelIds.value?.includes(m.id));
  return (starred ?? models[0])?.id ?? '';
});
const composerModes = computed<ModeFlags>(() => ({
  plan: client.planMode.value || false,
  swarm: client.swarmMode.value || false,
  goal: client.goalMode.value || false,
}));
const builtinCommands = computed(() =>
  SLASH_COMMANDS.map((c) => ({ ...c, name: c.name.replace(/^\//, ''), desc: i18n.global.t(c.desc) })),
);
const composerSkills = computed(() =>
  (client.skills.value ?? []).map((s) => ({
    name: s.name,
    description: s.description ?? '',
    source: 'session',
  })),
);
/** 队列条目视图:在契约 QueuedPrompt 之上附带附件信息(QueuePanel 行内计数用)。
 *  client.queued 的视图对象不透出底层 id,这里以「内容+出现序」生成稳定 id,
 *  重排/删除时 Vue 按 key 移动节点而不是原地改写。 */
interface QueueItemView extends QueuedPrompt {
  attachmentCount: number;
  attachments?: { fileId: string; kind: 'image' | 'video' | 'file'; url: string; name?: string }[];
}
function queueEntryId(text: string, attachmentCount: number, occurrence: number): string {
  // djb2 短哈希 + 附件数 + 同内容出现序:同队重复文本也能保持 key 唯一
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return `q-${h.toString(36)}-${attachmentCount}-${occurrence}`;
}
const queueItems = computed<QueueItemView[]>(() => {
  const seen = new Map<string, number>();
  return (client.queued.value ?? []).map((q, i) => {
    const base = `${q.attachmentCount}\u0000${q.text}`;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return {
      id: queueEntryId(q.text, q.attachmentCount, occurrence),
      text: q.text,
      queuedAt: i,
      attachmentCount: q.attachmentCount,
      attachments: q.attachments,
    };
  });
});

function fmtK(n: number): string {
  if (!n) return '0';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
const ctxInfo = computed<ContextInfo>(() => {
  const used = client.status.value?.ctxUsed ?? 0;
  const limit = client.status.value?.ctxMax ?? 0;
  return {
    used: fmtK(used),
    total: fmtK(limit),
    pct: limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0,
  };
});

// ---------------------------------------------------------------- 计划额度
// 优先用 daemon 0.29+ 的 REST 端点 GET /oauth/usage(更稳定);
// fallback 到 Tauri PTY 抓取(0.28 及更早);浏览器为 0 占位。

const quotaInfo = ref<QuotaInfo>({ q5h: 0, q5hReset: '', qWeek: 0, qWeekReset: '' });
const { fetchPlanUsage } = tauriDaemon;

async function pollPlanUsage() {
  // 优先 REST(daemon 0.29+)
  try {
    const usage = await client.getOAuthUsage();
    const parsed = quotaInfoFromOAuthUsage(usage);
    if (parsed) {
      quotaInfo.value = parsed;
      return;
    }
  } catch {
    // daemon 不支持 REST → fallback PTY
  }
  // Fallback: Tauri PTY 抓取(0.28 及更早)
  const u = await fetchPlanUsage();
  if (u && !u.loading) {
    quotaInfo.value = {
      q5h: u.hourly_pct,
      q5hReset: u.hourly_reset,
      qWeek: u.weekly_pct,
      qWeekReset: u.weekly_reset,
    };
  }
}
// /usage 的 PTY fallback 很重：让首屏和 daemon 会话加载先完成，并尊重十分钟缓存。
const planUsageWarmTimer = setTimeout(() => void pollPlanUsage(), 30_000);
const planUsageTimer = setInterval(pollPlanUsage, 10 * 60_000);
onUnmounted(() => {
  clearTimeout(planUsageWarmTimer);
  clearInterval(planUsageTimer);
});

// thinking effort 映射:daemon 实际支持('off'|'low'|'high'|'max')
// → 契约 EffortLevel('Low'|'High'|'Max')
const composerEffort = computed<EffortLevel | null>(() => {
  const t = client.thinking.value;
  if (!t || t === 'off' || t === 'none' || t === 'minimal') return null;
  if (t === 'low' || t === 'medium') return 'Low';
  if (t === 'high') return 'High';
  return 'Max'; // max
});

// ---------------------------------------------------------------- 子智能体

const parentAgentToolsById = computed<Map<string, ToolCall>>(() => {
  const tools = new Map<string, ToolCall>();
  for (const turn of conversationTurns.value) {
    for (const block of turn.blocks ?? []) {
      if (block.kind === 'tool') tools.set(block.tool.id, block.tool);
    }
  }
  return tools;
});

function subagentModelResolution(task: TaskItem): SubagentModelResolution {
  const config = client.config.value as AppConfig | null;
  if (task.model && task.modelSource === 'runtime') {
    const secondaryId = config?.secondaryModel?.model;
    return {
      route: secondaryId && (
        task.model === secondaryId ||
        task.model.endsWith(`/${secondaryId}`) ||
        secondaryId.endsWith(`/${task.model}`)
      )
        ? 'secondary'
        : 'primary',
      modelId: task.model,
      basis: 'runtime',
      inferred: false,
    };
  }
  return resolveSubagentModel({
    parentTool: task.parentToolCallId ? parentAgentToolsById.value.get(task.parentToolCallId) : undefined,
    swarmIndex: task.swarmIndex,
    subagentType: task.subagentType,
    profiles: agentProfiles.value,
    primaryModelId: client.status.value?.modelId || undefined,
    secondaryModelId: config?.secondaryModel?.model,
  });
}

function subagentModelName(modelId: string | undefined): string {
  if (!modelId) return '未配置';
  const model = (client.models.value ?? []).find((item) => item.id === modelId || item.model === modelId);
  return model?.displayName || model?.model || modelId.replace(/^.*\//, '');
}

function subagentModelHint(resolution: SubagentModelResolution): string {
  if (!resolution.inferred) return 'Kimi daemon 在子智能体运行时上报的实际模型。';
  const basis = {
    runtime: '运行时上报',
    tool: '启动参数',
    profile: 'Agent 配置',
    default: '默认路由规则',
    fallback: '次级模型未配置后的回退规则',
  }[resolution.basis];
  return `daemon 暂未返回子智能体实际模型字段；此处根据${basis}与当前配置推导，历史任务若配置已变更可能有偏差。`;
}

function subagentSummary(task: TaskItem): string {
  if (task.suspendedReason) return task.suspendedReason;
  if (task.summary) return task.summary;
  const text = task.text?.trim().replace(/\s+/g, ' ');
  if (text) return text.length > 120 ? `${text.slice(0, 119)}…` : text;
  return task.meta ?? task.output?.[0] ?? '';
}

const subagents = computed<Subagent[]>(() =>
  (client.tasks.value ?? [])
    .filter((t) => t.kind === 'subagent')
    .map((t) => {
      const model = subagentModelResolution(t);
      return {
        id: t.id,
        name: t.name,
        status:
          t.subagentPhase === 'queued'
            ? 'queued'
            : t.subagentPhase === 'suspended'
              ? 'suspended'
              : t.subagentPhase === 'completed' || t.state === 'done'
                ? 'completed'
                : t.subagentPhase === 'failed' || t.state === 'fail'
                  ? 'failed'
                  : 'working',
        summary: subagentSummary(t),
        elapsed: t.timing,
        model: subagentModelName(model.modelId),
        modelRoute: model.route,
        modelHint: subagentModelHint(model),
        modelSource: model.inferred ? 'inferred' : 'runtime',
        createdAt: t.createdAt,
        startedAt: t.startedAt,
        completedAt: t.completedAt,
        subagentType: t.subagentType,
        background: t.runInBackground === true,
        activityCount: t.output?.length ?? 0,
        outputChars: (t.text?.length ?? 0) + (t.output ?? []).reduce((sum, line) => sum + line.length, 0),
        parentToolCallId: t.parentToolCallId,
        swarmIndex: t.swarmIndex,
      };
    }),
);
const activeSubagents = computed(() =>
  subagents.value.filter((s) => ['working', 'queued', 'suspended'].includes(s.status)),
);
const completedSubagents = computed(() =>
  subagents.value.filter((s) => s.status === 'completed' || s.status === 'failed'),
);

const sideSubTask = computed(() => {
  const id = ui.sideTaskSubagentId.value;
  return id ? (client.tasks.value ?? []).find((t) => t.id === id) ?? null : null;
});
const sideSubagentTab = ref<'reply' | 'activity' | 'summary' | 'relations'>('reply');
const sideSubagentExpanded = ref(false);
const SUBAGENT_PREVIEW_CHARS = 20_000;
watch(() => sideSubTask.value?.id, () => {
  sideSubagentTab.value = 'reply';
  sideSubagentExpanded.value = false;
});
const sideSubagentText = computed(() => sideSubTask.value?.text?.trimEnd() ?? '');
const sideSubagentActivity = computed(() => (sideSubTask.value?.output ?? []).join('\n'));
function previewSubagentText(value: string): string {
  return sideSubagentExpanded.value || value.length <= SUBAGENT_PREVIEW_CHARS
    ? value
    : `${value.slice(0, SUBAGENT_PREVIEW_CHARS)}\n\n… 已折叠 ${value.length - SUBAGENT_PREVIEW_CHARS} 个字符`;
}
const sideSubagentVisibleText = computed(() => previewSubagentText(sideSubagentText.value));
const sideSubagentVisibleActivity = computed(() => previewSubagentText(sideSubagentActivity.value));
const sideSubagentTimeline = computed(() => {
  const task = sideSubTask.value;
  if (!task) return [];
  return [
    task.createdAt ? `创建 ${formatLocalDateTime(task.createdAt)}` : '',
    task.startedAt ? `开始 ${formatLocalDateTime(task.startedAt)}` : '',
    task.completedAt ? `完成 ${formatLocalDateTime(task.completedAt)}` : '',
  ].filter(Boolean);
});
async function copySideSubagentOutput(): Promise<void> {
  const task = sideSubTask.value;
  if (!task) return;
  const value = [task.text?.trimEnd(), (task.output ?? []).join('\n'), task.summary]
    .filter(Boolean)
    .join('\n\n');
  toast(value && await copyTextToClipboard(value) ? '已复制子智能体输出' : '没有可复制的输出');
}
const sideSubTaskModel = computed(() => {
  const task = sideSubTask.value;
  if (!task) return null;
  const resolution = subagentModelResolution(task);
  return {
    name: subagentModelName(resolution.modelId),
    route: resolution.route,
    hint: subagentModelHint(resolution),
    source: resolution.inferred ? 'inferred' : 'runtime',
  };
});
// 侧边对话(/btw)真数据
const sideChatTurns = computed(() => client.sideChatTurns.value ?? []);
const sideChatRunning = computed(() => client.sideChatRunning.value ?? false);
function onSideChatSend(text: string) {
  if (text.trim()) void client.sendSideChatPrompt(text);
}

const sideTaskProps = computed(() => {
  const t = sideSubTask.value;
  if (ui.sideTaskKind.value === 'agent-transcript' && t) {
    return {
      title: t.name,
      status:
        t.subagentPhase === 'suspended'
          ? { text: '等待输入', kind: 'warning' as const }
          : t.subagentPhase === 'queued'
            ? { text: '排队中', kind: 'accent' as const }
            : t.state === 'done'
          ? { text: '已完成', kind: 'success' as const }
          : t.state === 'fail'
            ? { text: '已失败', kind: 'warning' as const }
            : { text: '运行中', kind: 'accent' as const },
      thread: {
        name: t.name,
        ws: '子智能体',
        dot:
          t.subagentPhase === 'suspended'
            ? ('waiting' as const)
            : t.state === 'done'
              ? ('done' as const)
              : ('running' as const),
      },
      composerVisible: false,
      draftKey: `agent:${t.id}`,
    };
  }
  return {
    title: '侧边任务',
    status: { text: conversationRunning.value ? '运行中' : '空闲', kind: 'accent' as const },
    thread: { name: sidebarCurrentWs.value || 'Kimi Studio', ws: sidebarCurrentWs.value, dot: 'running' as const },
    composerVisible: true,
    draftKey: `thread:${client.activeSessionId.value ?? 'draft'}`,
  };
});

function openTranscript(id: string) {
  ui.closeAgentPanel();
  ui.openSideTask('agent-transcript', id);
}

/** AgentPanel/SubagentCard 行内 stop → 取消子任务 */
function onCancelTask(id: string) {
  void client.cancelTask(id);
}

/** AgentPanel 行内「移到后台」(Kimi Code 0.39+)→ 前台子任务转入后台任务存储 */
function onDetachTask(id: string) {
  void client.detachTask(id);
}

/** 用户消息「编辑重发」:撤销该 turn 及之后所有 turn,文本回填输入框 */
function onEditMessage(turn: ChatTurn) {
  const idx = conversationTurns.value.findIndex((t) => t.id === turn.id);
  if (idx < 0) return;
  promptDialog.value = {
    title: '编辑并重发?',
    description: '将撤销这条消息及之后的全部回复,原内容回填到输入框。',
    confirmLabel: '撤销并回填',
    danger: true,
    input: false,
    onConfirm: () => {
      const n = conversationTurns.value.length - idx;
      void client.undo(n).then(() => composerRef.value?.setText(turn.text));
    },
  };
}

/** 消息右键「引用到输入框」:Markdown 引用每一行，并把光标留在末尾。 */
function onQuoteMessage(text: string): void {
  const quoted = text
    .trim()
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  if (!quoted) return;
  composerRef.value?.setText(`${quoted}\n\n`);
  composerRef.value?.focus();
}

// ---------------------------------------------------------------- 事件处理

const pendingCacheSend = ref<{ text: string; attachments?: PromptAttachment[]; idleMinutes: number; tokens: number; workspaceId: string; sessionId: string } | null>(null);
const cacheHintDismissals = new Set<string>();

function sendCurrentPrompt(text: string, attachments?: PromptAttachment[]): void {
  void client.sendPrompt(text, attachments as any);
}

/** 发送被拒(未连接/无工作区)时回填:文本回输入框,附件无法恢复则提示重加 */
function refillComposerAfterReject(text: string, attachments?: PromptAttachment[]): void {
  composerRef.value?.setText(text);
  if (attachments?.length) toast(`该消息含 ${attachments.length} 个附件,需重新添加`);
}

/** 已知技能名校验(与 Composer `/` 菜单的 Skills 同源:client.skills)。
 *  兼容裸名 `/foo` 与官方 `skill:` 前缀 `/skill:foo` 两种写法。 */
function isKnownSkillToken(cmdToken: string): boolean {
  const stripped = stripSkillPrefix(cmdToken.replace(/^\//, '')).toLowerCase();
  if (!stripped) return false;
  return (client.skills.value ?? []).some((s) => s.name.toLowerCase() === stripped);
}

function onSend(text: string, mode: ComposerMode, attachments?: PromptAttachment[]) {
  if (!text.trim() && !attachments?.length) return;
  // Commands that accept arguments remain in the composer until Enter. Route
  // them through the same registry as menu-selected bare commands; otherwise
  // `/compact ...`, `/goal ...`, `/title ...`, etc. become ordinary prompts.
  const parsedCommand = parseSlash(text.trim());
  if (parsedCommand) {
    if (resolveBuiltinCommand(parsedCommand.cmd)) {
      // Built-in commands carry their arguments in text and cannot take
      // attachments — with attachments present, keep the historical fallback
      // of sending the whole thing as a plain prompt.
      if (!attachments?.length) {
        handleCommand(text.trim());
        return;
      }
    } else if (isKnownSkillToken(parsedCommand.cmd)) {
      // Known skill (Kimi Code 0.34+, with or without attachments): activate
      // via handleCommand, carrying attachments into the skill turn instead
      // of silently dropping them into a plain prompt. Unknown /tokens fall
      // through as ordinary prompts, so arbitrary text with attachments can
      // no longer masquerade as a skill activation.
      handleCommand(text.trim(), attachments);
      return;
    }
  }
  if (client.connection.value !== 'connected') {
    toast('未连接到 daemon,无法发送');
    refillComposerAfterReject(text, attachments);
    return;
  }
  if (mode === 'steer' && conversationRunning.value) {
    void client.steerPrompt(text, attachments as any);
    // B4:steer 反馈(原型有气泡,真 app 至少给 toast;思考块 steerMark 待数据侧接线)
    toast('已插话到当前轮');
    return;
  }
  // 无 active session:走 startSessionAndSendPrompt 开新会话发首条(对齐官方 App.vue handleSubmit;
  // 直接 sendPrompt 会在 useWorkspaceState 里静默丢弃,新任务流程断链)
  if (!client.activeSessionId.value) {
    const wsId = client.activeWorkspaceId.value;
    if (wsId) {
      pendingAgentBinding = draftAgentName.value;
      void client.startSessionAndSendPrompt(wsId, text, attachments as any, selectedAgentConfig());
    }
    else {
      toast('请先在左侧选择工作区');
      refillComposerAfterReject(text, attachments);
    }
    return;
  }
  const session = activeSession.value;
  const dismissalKey = session ? `${session.id}:${session.updatedAt}` : '';
  const hint = decideCacheExpiryHint({
    enabled: readCacheExpiryHintEnabled() && !cacheHintDismissals.has(dismissalKey),
    modelId: composerCurrentModel.value,
    lastActiveAt: session?.updatedAt,
    totalTokens: client.status.value?.ctxUsed,
  });
  if (hint.shouldHint && session) {
    pendingCacheSend.value = {
      text,
      attachments,
      idleMinutes: Math.max(1, Math.round((hint.idleSeconds ?? 0) / 60)),
      tokens: client.status.value?.ctxUsed ?? 0,
      workspaceId: session.workspaceId ?? client.activeWorkspaceId.value ?? '',
      sessionId: session.id,
    };
    cacheHintDismissals.add(dismissalKey);
    return;
  }
  sendCurrentPrompt(text, attachments);
}

async function resolveCacheExpiry(action: 'compact' | 'new' | 'continue' | 'never'): Promise<void> {
  const pending = pendingCacheSend.value;
  pendingCacheSend.value = null;
  if (!pending) return;
  if (action === 'never') writeCacheExpiryHintEnabled(false);
  if (action === 'compact') {
    try {
      await getKimiWebApi().compactSession(pending.sessionId);
      sendCurrentPrompt(pending.text, pending.attachments);
    } catch (error) {
      pendingCacheSend.value = pending;
      toast(error instanceof Error ? `压缩失败：${error.message}` : '压缩失败，请重试或选择继续');
    }
    return;
  }
  if (action === 'new' && pending.workspaceId) {
    client.clearActiveSession();
    await client.startSessionAndSendPrompt(pending.workspaceId, pending.text, pending.attachments as any, selectedAgentConfig());
    return;
  }
  sendCurrentPrompt(pending.text, pending.attachments);
}
function onSelectSession(id: string) {
  void client.selectSession(id);
}
async function onSelectPaletteSession(id: string): Promise<void> {
  showSearch.value = false;
  try {
    await client.selectSessionFromSearch(id);
  } catch (error) {
    toast(error instanceof Error ? error.message : '无法打开搜索结果');
  }
}
/** 新建任务:一键进当前工作区的草稿态(首条消息自动开新会话),并聚焦输入框 */
function onNewTask() {
  settingsOpen.value = false; // 设置页开着时先回主界面
  client.clearActiveSession();
  draftAgentName.value = 'default';
  composerRef.value?.focus?.();
}
/** 点工作区组名 = 切换活跃工作区(对齐 kimi web:列表即选择器) */
function onSelectWorkspace(id: string) {
  client.openWorkspace(id);
}
function toggleWorkspacePin(id: string): void {
  const current = workspaceDecorations.value[id] ?? {};
  workspaceDecorations.value = {
    ...workspaceDecorations.value,
    [id]: { ...current, pinned: !current.pinned },
  };
  saveWorkspaceDecorations();
}
function editWorkspaceEmoji(id: string): void {
  const current = workspaceDecorations.value[id] ?? {};
  promptDialog.value = {
    title: '设置工作区图标',
    description: '输入一个 emoji；留空可移除。图标只保存在本机界面设置中。',
    initial: current.emoji ?? '',
    placeholder: '例如 🚀',
    confirmLabel: '保存',
    input: true,
    onConfirm: (value) => {
      const emoji = Array.from(value.trim()).slice(0, 4).join('');
      workspaceDecorations.value = {
        ...workspaceDecorations.value,
        [id]: { ...current, emoji: emoji || undefined },
      };
      saveWorkspaceDecorations();
    },
  };
}
async function onCopyWorkspacePath(root: string) {
  try {
    await navigator.clipboard.writeText(root);
    toast('已复制工作区路径');
  } catch {
    toast('复制失败');
  }
}
async function inspectWorkspaceTrust(id: string): Promise<void> {
  if (workspaceTrustBusy.value.includes(id)) return;
  const workspace = client.workspacesView.value.find((item) => item.id === id);
  if (!workspace || workspace.id === workspace.root) {
    workspaceTrust.value = { ...workspaceTrust.value, [id]: null };
    return;
  }
  workspaceTrustBusy.value = [...workspaceTrustBusy.value, id];
  try {
    const result = await getKimiWebApi().getWorkspaceTrust(id);
    workspaceTrust.value = { ...workspaceTrust.value, [id]: result.trusted };
  } catch (error) {
    workspaceTrust.value = { ...workspaceTrust.value, [id]: null };
    toast(error instanceof Error ? error.message : '无法读取工作区信任状态');
  } finally {
    workspaceTrustBusy.value = workspaceTrustBusy.value.filter((item) => item !== id);
  }
}
async function setWorkspaceTrust(id: string, trusted: boolean): Promise<void> {
  if (workspaceTrustBusy.value.includes(id)) return;
  workspaceTrustBusy.value = [...workspaceTrustBusy.value, id];
  try {
    const result = trusted
      ? await getKimiWebApi().trustWorkspace(id)
      : await getKimiWebApi().untrustWorkspace(id);
    workspaceTrust.value = { ...workspaceTrust.value, [id]: result.trusted };
    toast(result.trusted ? '已信任工作区，项目级 MCP 配置将生效' : '已取消信任工作区，项目级 MCP 配置已停用');
  } catch (error) {
    toast(error instanceof Error ? error.message : '无法更新工作区信任状态');
  } finally {
    workspaceTrustBusy.value = workspaceTrustBusy.value.filter((item) => item !== id);
  }
}
/** 「工作区」标题行 + → 原生文件夹选择 → 添加 */
async function onAddWorkspace() {
  try {
    const { open: openDialog } = await import('@tauri-apps/plugin-dialog');
    const picked = await openDialog({ directory: true, multiple: false, title: '选择工作区文件夹' });
    if (typeof picked === 'string' && picked) void client.addWorkspaceByPath(picked);
  } catch {
    toast('当前环境不支持文件夹选择');
  }
}
function onComposerMode(m: ComposerMode) {
  composerMode.value = m;
}

/** EffortLevel → 官方 ThinkingLevel 反向映射 */
const EFFORT_TO_THINKING: Record<EffortLevel, string> = {
  Low: 'low',
  High: 'high',
  Max: 'max',
};

function explainNonExecutableCommand(command: string, mapping: Exclude<CommandMapping, { kind: 'command' }>): void {
  if (mapping.kind === 'native-ui') toast(`${command} 已映射到 GUI：${i18n.global.t(mapping.locationKey)}`);
  else if (mapping.kind === 'tui-only') toast(`${command} 只适用于终端 TUI，在 GUI 中不执行`);
  else if (mapping.reason === 'daemon-api') toast(`${command} 的 daemon Web API 尚未开放`);
  else toast(`${command} 已完成分类，但 GUI 交互尚未实现`);
}

function openNativeUiCommand(canonicalName: string, command: string, mapping: Extract<CommandMapping, { kind: 'native-ui' }>): void {
  if (canonicalName === 'plugins' && tauriDaemon.isTauri()) {
    openPluginManager();
    return;
  }
  if (canonicalName === 'exit') {
    if (tauriDaemon.isTauri()) {
      // 对齐「关窗到托盘」的既有行为:/exit 隐藏主窗口而非退出进程。
      // 若当前构建的 capabilities 未授予 window:allow-hide,降级为提示。
      void import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) => getCurrentWindow().hide())
        .catch(() => toast('窗口隐藏未获授权;可直接关闭窗口,应用会保留在托盘'));
    } else {
      explainNonExecutableCommand(command, mapping);
    }
    return;
  }
  const sectionByCommand: Partial<Record<string, typeof settingsSection.value>> = {
    permission: 'permissions',
    model: 'models-providers',
    'secondary-model': 'models-providers',
    provider: 'models-providers',
    mcp: 'mcp',
    plugins: 'plugins-skills',
    experiments: 'engine',
    usage: 'engine',
    theme: 'appearance',
    logout: 'general',
    version: 'about',
  };
  const section = sectionByCommand[canonicalName];
  if (section) {
    settingsSection.value = section;
    settingsOpen.value = true;
    return;
  }
  if (canonicalName === 'sessions') {
    showSearch.value = true;
    return;
  }
  if (canonicalName === 'tasks') {
    ui.openDetail('tasks');
    return;
  }
  explainNonExecutableCommand(command, mapping);
}

async function openExternalUrl(url: string): Promise<void> {
  try {
    if (tauriDaemon.isTauri()) {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } catch (error) {
    toast(error instanceof Error ? error.message : '无法打开链接');
  }
}

function addProjectDirectory(path: string): void {
  const root = client.workspacesView.value.find((workspace) => workspace.id === client.activeWorkspaceId.value)?.root;
  if (!root) {
    toast('请先选择一个工作区');
    return;
  }
  if (!tauriDaemon.isTauri()) {
    settingsSection.value = 'directories';
    settingsOpen.value = true;
    toast('浏览器模式不能修改本机 .kimi-code/local.toml');
    return;
  }
  void (async () => {
    try {
      const current = await kimiRuntime.readWorkspaceContext(root);
      const next = [...new Set([...current.additionalDirs, path.trim()])];
      await kimiRuntime.saveWorkspaceContext(root, next);
      toast('附加目录已保存；新会话会自动纳入该目录');
    } catch (error) {
      toast(error instanceof Error ? error.message : '附加目录保存失败');
    }
  })();
}

function requestProjectInit(): void {
  if (!client.activeSessionId.value) {
    toast('请先打开一个会话');
    return;
  }
  promptDialog.value = {
    title: '生成项目 AGENTS.md？',
    description: 'Kimi 将分析当前代码库，生成或完善面向编码 Agent 的 AGENTS.md。这个操作会作为正常任务显示在聊天记录中。',
    confirmLabel: '开始分析',
    input: false,
    onConfirm: () => void client.sendPrompt('分析当前代码库并生成或完善根目录 AGENTS.md。请先检查已有项目约定，保留有效内容，并写入简洁、可执行的开发与验证说明。'),
  };
}

function runUndo(count: number, refill?: string): void {
  undoDialogOpen.value = false;
  void client.undo(count).then((undone) => {
    const text = refill || undone;
    if (text) {
      composerRef.value?.setText(text);
      composerRef.value?.focus?.();
    }
  });
}

function showGoalStatus(): void {
  const goal = client.goal.value;
  if (!goal) {
    toast('当前没有活动目标；使用 /goal <目标> 创建');
    return;
  }
  toast(`${goal.status} · ${goal.turnsUsed} 轮 · ${goal.objective}`);
}

function replaceGoal(objective: string): void {
  const sid = client.activeSessionId.value;
  if (!sid) {
    toast('请先打开一个会话');
    return;
  }
  promptDialog.value = {
    title: '替换当前目标？',
    description: `当前目标会被取消，并立即改为：${objective}`,
    confirmLabel: '替换目标',
    danger: true,
    input: false,
    onConfirm: () => void (async () => {
      try {
        await getKimiWebApi().updateSession(sid, { goalControl: 'cancel' });
        await getKimiWebApi().updateSession(sid, { goalObjective: objective });
        await client.sendPrompt(objective);
      } catch (error) {
        toast(error instanceof Error ? error.message : '目标替换失败');
      }
    })(),
  };
}

/** Registry-backed slash-command dispatcher for the actual desktop entry. */
function handleCommand(cmd: string, attachments?: PromptAttachment[]): void {
  // 与 parseSlash 一致按首个空白(空格/Tab/换行)切分,`/goal\n目标` 也能解析
  const ws = /\s/.exec(cmd);
  const token = ws === null ? cmd : cmd.slice(0, ws.index);
  const arg = ws === null ? '' : cmd.slice(ws.index + 1).trim();
  const resolved = resolveBuiltinCommand(token);
  if (resolved === null) {
    const stripped = stripSkillPrefix(token.slice(1));
    if (!stripped) return;
    // Mirror the App.vue fallback: with no session yet, create the draft
    // session and activate there — otherwise the skill silently no-ops.
    if (!client.activeSessionId.value && client.activeWorkspaceId.value) {
      void client.startSessionAndActivateSkill(client.activeWorkspaceId.value, stripped, arg || undefined, attachments);
    } else {
      void client.activateSkill(stripped, arg || undefined, undefined, attachments);
    }
    return;
  }

  const { canonicalName, mapping } = resolved;
  // idle-only 守卫对 native-ui 等非 command 映射同样生效(先于 kind 分支)
  if (mapping.availability === 'idle-only' && conversationRunning.value) {
    toast(`${token} 只能在会话空闲时执行`);
    return;
  }
  if (mapping.kind !== 'command') {
    if (mapping.kind === 'native-ui') openNativeUiCommand(canonicalName, token, mapping);
    else explainNonExecutableCommand(token, mapping);
    return;
  }

  switch (mapping.action) {
    case 'help':
      commandHelpOpen.value = true;
      break;
    case 'addDir':
      if (!arg || arg.toLowerCase() === 'list') {
        settingsSection.value = 'directories';
        settingsOpen.value = true;
      } else {
        promptDialog.value = {
          title: '添加附加工作目录？',
          description: `将 ${arg} 写入当前项目的 .kimi-code/local.toml；目录不会被移动或复制。`,
          confirmLabel: '添加并记住',
          input: false,
          onConfirm: () => addProjectDirectory(arg),
        };
      }
      break;
    case 'init':
      requestProjectInit();
      break;
    case 'feedback':
      promptDialog.value = {
        title: '向 Kimi Code 反馈问题',
        description: '可以直接打开官方 Issue；若问题与当前会话或 daemon 有关，建议先导出诊断包再附到反馈中。诊断包不会包含 GUI 中未提交的 API Key。',
        confirmLabel: '打开官方 Issue',
        alternateLabel: client.activeSessionId.value ? '先导出诊断包' : undefined,
        input: false,
        onConfirm: () => void openExternalUrl('https://github.com/MoonshotAI/kimi-code/issues/new'),
        onAlternate: client.activeSessionId.value ? () => void client.exportSession() : undefined,
      };
      break;
    case 'exportMarkdown':
      exportConversationMarkdown();
      break;
    case 'compact':
      void client.compact(arg || undefined);
      break;
    case 'swarm':
      if (arg === 'on') client.setSwarmMode(true);
      else if (arg === 'off') client.setSwarmMode(false);
      else if (arg) { client.setSwarmMode(true); void client.sendPrompt(arg); }
      else void client.toggleSwarmMode();
      break;
    case 'goal':
      if (!arg || arg === 'status') showGoalStatus();
      // 子命令按「精确或带参前缀」匹配(同 next 写法):`/goal pause now`
      // 不再误落入创建目标分支
      else if (arg === 'pause' || arg.startsWith('pause ')) client.controlGoal('pause');
      else if (arg === 'resume' || arg.startsWith('resume ')) client.controlGoal('resume');
      else if (arg === 'cancel' || arg.startsWith('cancel ')) client.controlGoal('cancel');
      else if (arg.startsWith('replace ')) replaceGoal(arg.slice('replace '.length).trim());
      else if (arg === 'next' || arg.startsWith('next ')) {
        toast('即将目标队列仍只存在于 TUI 会话 RPC，0.33 daemon REST 尚未开放；当前目标管理已可在顶部目标卡完成');
      } else void client.createGoal(arg.replace(/^--\s+/, ''));
      break;
    case 'btw':
      if (arg) void client.openSideChat(arg);
      else if (ui.sideTaskOpen.value) client.closeSideChat();
      else ui.openSideTask('thread');
      break;
    case 'new':
      client.clearActiveSession();
      break;
    case 'fork':
      void client.forkSession();
      break;
    case 'copy':
      void copyLatestAssistantResponse();
      break;
    case 'exportDebugZip':
      void client.exportSession();
      break;
    case 'undo':
      if (arg) {
        const count = Number.parseInt(arg, 10);
        if (!Number.isSafeInteger(count) || count < 1) toast('用法：/undo [轮数]');
        else runUndo(count);
      } else {
        undoDialogOpen.value = true;
      }
      break;
    case 'plan':
      client.togglePlanMode();
      break;
    case 'auto':
      client.setPermission('auto');
      break;
    case 'yolo':
      client.setPermission('yolo');
      break;
    case 'thinking': {
      // /thinking low|high|max(大小写归一);缺失/非法时提示用法不落地
      const level = arg.trim().toLowerCase();
      if (level !== 'low' && level !== 'high' && level !== 'max') {
        toast('用法：/thinking low|high|max');
        break;
      }
      client.setThinking(level);
      break;
    }
    case 'status':
      ui.openDetail('tasks');
      break;
    case 'login':
      toast('已通过 daemon token 自动登录');
      break;
    case 'settings':
      settingsSection.value = 'general';
      settingsOpen.value = true;
      break;
    case 'title':
      if (!client.activeSessionId.value) toast('请先打开一个会话');
      else if (!arg) toast('请输入新标题，例如：/title 修复登录问题');
      else void client.renameSession(client.activeSessionId.value, arg);
      break;
    case 'reload':
      // SDK has reloadSession(), but the daemon's public REST API does not.
      // Restarting the whole daemon is intentionally not treated as equivalent.
      toast('/reload 已识别，但 Kimi 0.33 的 daemon REST API 尚未开放会话重载接口；可新建会话应用最新配置');
      break;
  }
}

/** 应用内输入/确认弹层状态(WKWebView 无 window.prompt,统一走 PromptDialog) */
interface PromptDialogState {
  title: string;
  description?: string;
  placeholder?: string;
  initial?: string;
  confirmLabel?: string;
  alternateLabel?: string;
  danger?: boolean;
  input: boolean;
  onConfirm: (v: string) => void;
  onAlternate?: () => void;
}
const promptDialog = ref<PromptDialogState | null>(null);

/** 重命名当前 session */
function onRenameSession() {
  const id = client.activeSessionId.value;
  if (!id) return;
  promptDialog.value = {
    title: '重命名任务',
    initial: activeSession.value?.title ?? '',
    confirmLabel: '重命名',
    input: true,
    onConfirm: (v) => void client.renameSession(id, v),
  };
}
function onRenameWorkspace(id?: string) {
  const workspaceId = id || client.activeWorkspaceId.value;
  if (!workspaceId) return;
  const name = client.workspacesView.value.find((w) => w.id === workspaceId)?.name ?? '';
  promptDialog.value = {
    title: '重命名工作区',
    initial: name || sidebarCurrentWs.value,
    confirmLabel: '重命名',
    input: true,
    onConfirm: (v) => void client.renameWorkspace(workspaceId, v),
  };
}
function onDeleteWorkspace(id?: string) {
  const workspaceId = id ?? client.activeWorkspaceId.value ?? undefined;
  if (workspaceId === undefined) return;
  const workspace = client.workspacesView.value.find((w) => w.id === workspaceId);
  const name = workspace?.name.trim() || workspace?.root || workspaceId || '未命名工作区';
  promptDialog.value = {
    title: `移除工作区「${name}」?`,
    description: '只从侧栏和工作区注册表移除；不会删除目录或会话数据，可重新添加。',
    confirmLabel: '移除',
    danger: true,
    input: false,
    onConfirm: () => void client.deleteWorkspace(workspaceId),
  };
}

function onDeleteProvider(id: string) {
  promptDialog.value = {
    title: `删除 Provider「${id}」?`,
    description: '会移除它的配置和模型目录；已存在会话不会被删除。',
    confirmLabel: '删除',
    danger: true,
    input: false,
    onConfirm: () => void client.deleteProvider(id),
  };
}

/** 侧栏行内菜单:按 id 操作任意 session(不切换活跃会话) */
function onRenameSessionById(id: string) {
  const title = client.sessions.value.find((s) => s.id === id)?.title ?? '';
  promptDialog.value = {
    title: '重命名任务',
    initial: title,
    confirmLabel: '重命名',
    input: true,
    onConfirm: (v) => void client.renameSession(id, v),
  };
}
function onArchiveSessionById(id: string) {
  promptDialog.value = {
    title: '归档任务?',
    description: '归档后可在设置中恢复。',
    confirmLabel: '归档',
    danger: true,
    input: false,
    onConfirm: () => void archiveSessionWithOrphanFallback(id),
  };
}
async function archiveSessionWithOrphanFallback(id: string): Promise<void> {
  const outcome = await client.archiveSession(id);
  if (outcome !== 'orphaned') return;
  promptDialog.value = {
    title: '清理失效任务?',
    description:
      '这个任务的临时工作区已经被删除，Kimi 无法正常归档。你可以永久删除本地残留记录，或先移动到本机备份目录再清理。',
    confirmLabel: '直接清理',
    alternateLabel: '备份后清理',
    danger: true,
    input: false,
    onConfirm: () => void cleanupOrphanSessionById(id, false),
    onAlternate: () => void cleanupOrphanSessionById(id, true),
  };
}
async function cleanupOrphanSessionById(id: string, backup: boolean): Promise<void> {
  const result = await client.cleanupOrphanSession(id, backup);
  if (!result) return;
  toast(
    result.alreadyCleaned
      ? '失效任务已从列表移除'
      : backup
        ? '失效任务已清理，聊天记录已备份'
        : '失效任务已永久清理',
  );
}
function onExportSessionById(id: string) {
  void client.exportSession(id);
}
function onCopySessionId(id: string) {
  void navigator.clipboard.writeText(id);
  toast('已复制会话 ID');
}

/** 文件路径链接点击 → 读文件内容 → 在 DetailPane 显示 */
/** agent 提问:回答 */
function onAnswerQuestion(questionId: string, response: any) {
  void client.respondQuestion(questionId, response);
}
/** agent 提问:忽略 */
function onDismissQuestion(questionId: string) {
  void client.dismissQuestion(questionId);
}
/** 忽略警告(by index) */
function onDismissWarning(idx: number) {
  client.dismissWarning(idx);
}

async function onOpenFile(target: { path: string; line?: number }) {
  const show = (content: string) => {
    filePreviewContent.value = `// ${target.path}${target.line ? ':' + target.line : ''}\n\n${content}`;
    ui.openDetail('thinking');
  };
  // 优先 daemon 0.29+ 的 fs:content(任意绝对路径);
  // 不支持或读不到时 fallback readFileContent(workspace 相对路径)
  const data = await client.getFsContent(target.path).catch(() => null);
  if (data?.content) return show(data.content);
  const d = await client.readFileContent(target.path).catch(() => null);
  if (d?.content) return show(d.content);
  toast(`无法读取 ${target.path}`);
}

/** 切模型:client.setModel(updateSession 内已刷新状态,一次调用即可) */
async function onSetModel(id: string) {
  await client.setModel(id);
}

/** 切思考强度:EffortLevel → ThinkingLevel → client.setThinking */
function onSetEffort(lv: EffortLevel) {
  const thinking = EFFORT_TO_THINKING[lv];
  if (thinking) client.setThinking(thinking as any);
}

// 官方 ModelPicker 全屏弹层(更多模型)
// 官方 components/settings/ModelPicker.vue 可直接 import(同项目 fork)
const showModelPicker = ref(false);
const showProviderManager = ref(false);
const providerManagerLoading = ref(false);
const providerBusyIds = ref<string[]>([]);
const providerAdding = ref(false);
const showSearch = ref(false);
const searchSessionIndex = ref<PaletteSession[]>([]);
const searchLoading = ref(false);
const searchHint = ref('输入至少 2 个字可搜索全部历史');

// ⌘K 命令面板:命令(应用动作)+ 会话双区
const paletteActions = computed<PaletteAction[]>(() => {
  const list: PaletteAction[] = [
    { id: 'new', label: '新建会话(当前工作区)', icon: 'plus' },
    { id: 'settings', label: '打开设置', icon: 'settings' },
    { id: 'theme', label: '切换深浅色主题', icon: 'moon' },
    { id: 'inspect', label: 'Inspect 右栏', icon: 'panel-right', kbd: '⌘I' },
    { id: 'sidetask', label: '侧边任务', icon: 'panel-side', kbd: '⌥⌘S' },
  ];
  if (changedFiles.value.length) {
    list.push({ id: 'review', label: 'Review pane', icon: 'git-branch', kbd: '⌘B' });
  }
  if (subagents.value.length) {
    list.push({ id: 'agents', label: '子智能体面板', icon: 'bot' });
  }
  if (client.activeSessionId.value) {
    list.push(
      { id: 'rename', label: '重命名当前任务', icon: 'pencil', kbd: '⌥⌘R' },
      { id: 'archive', label: '归档当前任务', icon: 'archive', kbd: '⇧⌘A' },
      { id: 'export', label: '导出对话', icon: 'download' },
      { id: 'copy-id', label: '复制会话 ID', icon: 'copy' },
    );
  }
  list.push({ id: 'quit', label: '退出应用', icon: 'x' });
  return list;
});
const paletteSessions = computed(() => {
  const live = (client.sessionsForView.value ?? []).map((session) => ({
    id: session.id,
    title: session.title || session.id,
    meta: [session.workspaceName, session.time].filter(Boolean).join(' · '),
    workspaceName: session.workspaceName,
    lastPrompt: session.lastPrompt,
  }));
  if (searchSessionIndex.value.length === 0) return live;
  const liveIds = new Set(live.map((session) => session.id));
  return [
    ...live,
    ...searchSessionIndex.value.filter((session) => !liveIds.has(session.id)),
  ];
});
function onPaletteAction(id: string) {
  showSearch.value = false;
  switch (id) {
    case 'new':
      client.clearActiveSession();
      break;
    case 'settings':
      settingsSection.value = 'general';
      settingsOpen.value = true;
      break;
    case 'theme':
      toggleTheme();
      break;
    case 'inspect':
      ui.openDetail('thread');
      break;
    case 'sidetask':
      ui.openSideTask('thread');
      break;
    case 'review':
      ui.openReview();
      break;
    case 'agents':
      ui.openAgentPanel();
      break;
    case 'rename':
      onRenameSession();
      break;
    case 'archive':
      if (client.activeSessionId.value) onArchiveSessionById(client.activeSessionId.value);
      break;
    case 'export':
      void client.exportSession();
      break;
    case 'copy-id': {
      const sid = client.activeSessionId.value;
      if (sid) {
        void navigator.clipboard.writeText(sid);
        toast('已复制会话 ID');
      }
      break;
    }
    case 'quit':
      void import('@tauri-apps/api/core').then(({ invoke }) => invoke('quit_app'));
      break;
  }
}

async function onPickModelOverlay(id: string) {
  showModelPicker.value = false;
  await onSetModel(id);
}

function openModelPicker() {
  showModelPicker.value = true;
  // Keep the cached catalog visible while provider metadata refreshes lazily.
  void client.refreshAllProviders();
}

async function openProviderManager() {
  showProviderManager.value = true;
  providerManagerLoading.value = true;
  try { await client.loadProviders(); } finally { providerManagerLoading.value = false; }
}
async function addProvider(input: AppProviderFormInput) {
  providerAdding.value = true;
  try {
    if (await client.addProvider(input)) toast('Provider 已保存');
  } finally {
    providerAdding.value = false;
  }
}
async function updateProvider(id: string, input: AppProviderFormInput) {
  providerBusyIds.value = [...new Set([...providerBusyIds.value, id])];
  try {
    if (await client.updateProvider(id, input)) toast('Provider 已更新');
  } finally {
    providerBusyIds.value = providerBusyIds.value.filter((item) => item !== id);
  }
}
async function refreshProvider(id: string) {
  providerBusyIds.value = [...new Set([...providerBusyIds.value, id])];
  try {
    if (await client.refreshProvider(id)) {
      toast(`Provider「${id}」连接测试与模型刷新已完成`);
    }
  } finally {
    providerBusyIds.value = providerBusyIds.value.filter((item) => item !== id);
  }
}
async function onProviderImported(message: string) {
  await Promise.all([client.loadProviders(), client.loadModels()]);
  toast(message);
}

function qSteerAll() {
  if (!queueItems.value.length) return;
  // steerPrompt 会自行合并并清空整队；传空文本确保每条消息只出现一次。
  void client.steerPrompt('');
}
const composerRef = ref<InstanceType<typeof Composer> | null>(null);
function queueIndexById(id: string): number {
  return queueItems.value.findIndex((q) => q.id === id);
}
function qEdit(id: string) {
  const idx = queueIndexById(id);
  if (idx < 0) return;
  const q = queueItems.value[idx]!;
  composerRef.value?.setText(q.text);
  // 附件无法随文本回填到 Composer:有附件时提示需要重新添加
  if (q.attachmentCount > 0) toast(`该排队消息含 ${q.attachmentCount} 个附件,编辑后需重新添加`);
  client.unqueue(idx);
}
function qRemove(id: string) {
  const idx = queueIndexById(id);
  if (idx >= 0) client.unqueue(idx);
}

// ---------------------------------------------------------------- diff / ReviewPane(数据流,轮次 4b kimi3)

function normStatus(s: string): ChangedFile['status'] {
  const u = (s || 'M').toUpperCase();
  if (u === '??') return 'A';
  return (['M', 'A', 'D', 'R', 'U', 'C'] as const).includes(u as ChangedFile['status'])
    ? (u as ChangedFile['status'])
    : 'M';
}

/** 选中文件的行级统计(从它的 diff 算) */
const statsByFile = ref<Record<string, { a: number; d: number }>>({});
const changedFiles = computed<ChangedFile[]>(() =>
  (client.changes.value ?? []).map((c) => {
    const st = statsByFile.value[c.path];
    return {
      path: c.path,
      status: normStatus(c.status),
      ...(st ? { additions: st.a, deletions: st.d } : {}),
    };
  }),
);
const inspectData = computed(() => {
  let additions = 0;
  let deletions = 0;
  for (const file of changedFiles.value) {
    additions += file.additions ?? 0;
    deletions += file.deletions ?? 0;
  }
  const goal = activeGoal.value;
  const automations = conversationTurns.value
    .filter((turn) => turn.cron)
    .slice(-12)
    .reverse()
    .map((turn) => ({
      id: turn.cron?.jobId ?? turn.id,
      schedule: turn.cron?.cron,
      recurring: turn.cron?.recurring,
      missedCount: turn.cron?.missedCount ?? turn.cron?.coalescedCount,
      stale: turn.cron?.stale,
      time: turn.createdAt ? formatLocalDateTime(turn.createdAt) : undefined,
    }));
  return {
    activity: client.activity.value,
    branch: client.gitInfo.value?.branch,
    ahead: client.gitInfo.value?.ahead,
    behind: client.gitInfo.value?.behind,
    changes: changedFiles.value,
    additions,
    deletions,
    tasks: client.tasks.value ?? [],
    goal: goal ? {
      objective: goal.objective,
      status: goal.status,
      turnsUsed: goal.turnsUsed,
      tokensUsed: goal.tokensUsed,
      wallClockMs: goal.wallClockMs,
      remainingTokens: goal.budget.remainingTokens,
      remainingTurns: goal.budget.remainingTurns,
    } : null,
    automations,
    sessionCost: client.sessionCost.value ?? 0,
    warnings: activeWarnings.value.length,
  };
});

function openInspectReview(path?: string): void {
  if (path) void client.loadFileDiff(path);
  ui.openReview();
}

function launchInspectPrompt(text: string): void {
  ui.closeDetail();
  composerRef.value?.setText(text);
  composerRef.value?.focus();
}
const hunksByFile = computed<Record<string, DiffHunk[]>>(() => {
  const p = client.selectedDiffPath.value;
  if (!p) return {};
  return { [p]: toDiffHunks(client.fileDiff.value ?? []) };
});

/** 运行占位(TurnProgress):daemon 无步数源,显示「工作中」+ 真实文件增删统计 */
const runProgress = computed(() => {
  if (!conversationRunning.value) return undefined;
  let add = 0;
  let del = 0;
  for (const f of changedFiles.value) {
    add += f.additions ?? 0;
    del += f.deletions ?? 0;
  }
  return { additions: add, deletions: del };
});

/** SettingsPage 初始分区(/permissions 命令直达权限页;其余入口回 general) */
const settingsSection = ref<
  | 'general'
  | 'appearance'
  | 'permissions'
  | 'models-providers'
  | 'agents'
  | 'plugins-skills'
  | 'capabilities'
  | 'mcp'
  | 'directories'
  | 'tasks'
  | 'performance'
  | 'engine'
  | 'about'
>('general');
const pluginManagerOpen = ref(false);
const globalTaskOpen = ref(false);

async function openSessionFromGlobal(id: string): Promise<void> {
  try { await client.selectSessionFromSearch(id); }
  catch (error) { toast(error instanceof Error ? error.message : '无法打开后台任务所属会话'); }
}

function openPluginManager(): void {
  if (!sidebarCurrentWsRoot.value) {
    settingsSection.value = 'plugins-skills';
    settingsOpen.value = true;
    toast('请先选择一个工作区');
    return;
  }
  pluginManagerOpen.value = true;
}

function launchSettingsCommand(command: string): void {
  settingsOpen.value = false;
  composerRef.value?.setText(command);
  composerRef.value?.focus();
}

// 有改动时默认选第一个文件并拉它的 diff
watch(
  () => client.changes.value,
  (cs) => {
    if (cs?.length && !client.selectedDiffPath.value) void client.loadFileDiff(cs[0]!.path);
  },
  { immediate: true },
);
watch(
  () => client.fileDiff.value,
  (lines) => {
    const p = client.selectedDiffPath.value;
    if (!p || !lines) return;
    let a = 0;
    let d = 0;
    for (const l of lines) {
      if (l.type === 'add') a++;
      else if (l.type === 'del') d++;
    }
    statsByFile.value = { ...statsByFile.value, [p]: { a, d } };
  },
);

function onSelectDiffFile(path: string) {
  void client.loadFileDiff(path);
}

function onRequestReviewFix(path: string) {
  composerRef.value?.setText(
    `请根据当前 Review 修复 ${path} 中的问题。先检查这份 diff 的意图与潜在回归，再修改并运行相关测试。`,
  );
  ui.closeReview();
  composerRef.value?.focus();
}

async function searchFiles(q: string) {
  const r = await client.searchFiles(q);
  return (r ?? []).map((f) => ({ path: f.path, name: f.name, kind: 'file' as const }));
}
</script>

<template>
  <main v-if="client.unsupportedDaemonVersion.value" class="contract-gate">
    <header class="contract-gate-titlebar" data-tauri-drag-region="deep" @mousedown="tauriDaemon.startWindowDragging">
      <strong>Kimi Studio</strong>
    </header>
    <section class="contract-gate-card">
      <span class="contract-gate-version">需要 Kimi Code {{ MINIMUM_KIMI_CODE_VERSION }}+</span>
      <h1>当前 daemon 不再受支持</h1>
      <p>
        当前运行的是 {{ client.serverVersion.value || client.unsupportedDaemonVersion.value }} · backend {{ client.backend.value }}。
        此版本 GUI 只使用 0.33.0 以上的 agent-core-v2 契约，不会以旧契约继续运行。
      </p>
      <button class="btn primary" :disabled="contractUpgradeBusy" @click="upgradeContractRuntime">
        {{ contractUpgradeBusy ? '正在更新…' : '更新 CLI 并重启 daemon' }}
      </button>
      <pre v-if="contractUpgradeStatus" class="contract-gate-status">{{ contractUpgradeStatus }}</pre>
    </section>
  </main>
  <!-- 设置覆盖层:整页替换主区内容 -->
  <template v-else-if="settingsOpen">
    <AppShell>
      <template #sidebar="{ toggleCollapsed }">
        <Sidebar
          :workspaces="sidebarWorkspaces"
          :sessions="sidebarSessions"
          :current-workspace-id="sidebarCurrentWsId"
          :current-session-id="sidebarCurrentSession"
          :filter="filter"
          :collapsed="false"
          :pinned-ids="pinnedIds"
          :workspace-trust="workspaceTrust"
          :workspace-trust-busy="workspaceTrustBusy"
          @collapse="toggleCollapsed"
          @select-session="onSelectSession"
          @new-task="onNewTask"
          @set-filter="(f: SessionFilter) => (filter = f)"
          @toggle-pin="togglePin"
          @search="openSearch"
          @open-settings="settingsOpen = false"
          @select-workspace="onSelectWorkspace"
          @add-workspace="onAddWorkspace"
          @rename-workspace="onRenameWorkspace"
          @delete-workspace="onDeleteWorkspace"
          @copy-path="onCopyWorkspacePath"
          @toggle-workspace-pin="toggleWorkspacePin"
          @edit-workspace-emoji="editWorkspaceEmoji"
          @inspect-workspace-trust="inspectWorkspaceTrust"
          @set-workspace-trust="setWorkspaceTrust"
          @reorder-workspaces="client.reorderWorkspaces"
          @archive-session="onArchiveSessionById"
          @rename-session="onRenameSessionById"
          @export-session="onExportSessionById"
          @copy-session-id="onCopySessionId"
          @fork-session="(id) => void client.forkSession(id)"
        />
      </template>
      <header
        class="app-toolbar"
        data-tauri-drag-region="deep"
        @mousedown="tauriDaemon.startWindowDragging"
      >
        <button class="btn" data-tauri-drag-region="false" @click="settingsOpen = false">
          <CodexIcon name="chevron-right" style="transform: rotate(180deg)" />
          返回
        </button>
        <span class="toolbar-title">设置</span>
      </header>
      <SettingsPage
        :initial-section="settingsSection"
        @open-providers="openProviderManager"
        @open-plugin-manager="openPluginManager"
        @launch-command="launchSettingsCommand"
        @open-session="async (id: string) => { settingsOpen = false; await client.selectSessionFromSearch(id); }"
      />
    </AppShell>
  </template>

  <AppShell v-else>
    <template #sidebar="{ toggleCollapsed }">
      <Sidebar
        :workspaces="sidebarWorkspaces"
        :sessions="sidebarSessions"
        :current-workspace-id="sidebarCurrentWsId"
        :current-session-id="sidebarCurrentSession"
        :filter="filter"
        :collapsed="false"
        :pinned-ids="pinnedIds"
        :workspace-trust="workspaceTrust"
        :workspace-trust-busy="workspaceTrustBusy"
        @collapse="toggleCollapsed"
        @select-session="onSelectSession"
        @new-task="onNewTask"
        @search="openSearch"
        @set-filter="(f: SessionFilter) => (filter = f)"
        @toggle-pin="togglePin"
        @open-settings="settingsSection = 'general'; settingsOpen = true"
        @select-workspace="onSelectWorkspace"
        @add-workspace="onAddWorkspace"
        @set-workspace-sort="(m: any) => client.setWorkspaceSortMode(m)"
        @rename-workspace="onRenameWorkspace"
        @delete-workspace="onDeleteWorkspace"
        @copy-path="onCopyWorkspacePath"
        @toggle-workspace-pin="toggleWorkspacePin"
        @edit-workspace-emoji="editWorkspaceEmoji"
        @inspect-workspace-trust="inspectWorkspaceTrust"
        @set-workspace-trust="setWorkspaceTrust"
        @reorder-workspaces="client.reorderWorkspaces"
        @archive-session="onArchiveSessionById"
        @rename-session="onRenameSessionById"
        @export-session="onExportSessionById"
        @copy-session-id="onCopySessionId"
        @fork-session="(id) => void client.forkSession(id)"
      >
        <template #new-task>
          <button class="new-task" @click="onNewTask">
            <CodexIcon name="plus" />
            新建任务
          </button>
        </template>
      </Sidebar>
    </template>

    <!-- toolbar -->
    <header
      class="app-toolbar"
      data-tauri-drag-region="deep"
      @mousedown="tauriDaemon.startWindowDragging"
    >
      <!-- toolbar -->
      <span class="toolbar-title" data-tauri-drag-region>{{ activeSession?.title || sidebarCurrentWs || 'Kimi Studio' }}</span>
      <ThreadMenu
        @pin="client.activeSessionId.value && togglePin(client.activeSessionId.value)"
        @open-side-task="ui.openSideTask('thread')"
        @rename="onRenameSession"
        @archive="client.activeSessionId.value && onArchiveSessionById(client.activeSessionId.value)"
        @copy-all="void copyConversationMarkdown()"
        @copy-summary="void copyLatestAssistantResponse()"
        @fork="void client.forkSession()"
        @export="void client.exportSession()"
        @export-markdown="exportConversationMarkdown"
      />
      <div class="toolbar-context" data-tauri-drag-region="false">
        <WorkspacePicker
          v-if="client.workspacesView.value.length && !client.activeSessionId.value"
          trigger="pill"
          placement="bottom"
          :workspaces="client.workspacesView.value"
          :current-id="client.activeWorkspaceId.value ?? ''"
          @select="(id: string) => client.openWorkspace(id)"
          @add-workspace="(path: string) => void client.addWorkspaceByPath(path)"
        />
        <span
          v-else-if="client.activeSessionId.value && sidebarCurrentWs"
          class="perm-pill ws-static"
          title="工作区在会话创建后固定,不可切换"
        >
          <CodexIcon name="file" />
          <span class="ellipsis wp-pill-name">{{ sidebarCurrentWs }}</span>
        </span>
        <AgentPicker
          :agents="agentProfiles"
          :current="composerAgentName"
          :loading="agentsLoading"
          :locked="Boolean(client.activeSessionId.value)"
          placement="bottom"
          @select="(name: string) => draftAgentName = name"
          @manage="openAgentSettings"
        />
      </div>
      <span class="toolbar-spacer" data-tauri-drag-region />
      <span v-if="approvalCount" class="pill pill-warning">
        <span class="dot dot-waiting" />等待批准 · {{ approvalCount }} 项
      </span>
      <button
        v-if="subagents.length"
        class="icon-btn"
        title="子智能体"
        @click="ui.agentPanelOpen.value ? ui.closeAgentPanel() : ui.openAgentPanel()"
      >
        <CodexIcon name="bot" />
      </button>
      <button
        class="icon-btn"
        title="全局后台任务"
        :aria-pressed="globalTaskOpen"
        @click="globalTaskOpen = !globalTaskOpen"
      >
        <CodexIcon name="list" />
        <span v-if="(client.tasks.value ?? []).filter((task) => task.state === 'run').length" class="toolbar-task-badge">{{ (client.tasks.value ?? []).filter((task) => task.state === 'run').length }}</span>
      </button>
      <button
        type="button"
        class="toolbar-thinking-toggle"
        :class="{ on: ui.globalThinking.value }"
        title="全局思考开关"
        :aria-pressed="ui.globalThinking.value"
        @click="ui.toggleGlobalThinking()"
      >
        <span>思考</span>
        <span class="tt-switch" />
      </button>
      <span v-if="client.connection.value === 'connected'" class="pill pill-success">
        <span class="dot dot-done" />已连接
      </span>
      <span v-else-if="client.connection.value === 'connecting'" class="pill">
        <span class="dot dot-running" />连接中
      </span>
      <span v-else class="pill pill-warning"><span class="dot dot-waiting" />未连接</span>
      <button
        class="icon-btn"
        :class="{ active: terminalOpen }"
        :disabled="!sidebarCurrentSession"
        :title="!sidebarCurrentSession ? '打开会话后可使用终端' : (terminalOpen ? '收起终端' : '打开终端')"
        :aria-pressed="terminalOpen"
        @mousedown.stop
        @click="terminalOpen = !terminalOpen"
      >
        <CodexIcon name="terminal" />
      </button>
      <button
        v-if="changedFiles.length"
        class="btn"
        title="Review pane ⌘B"
        @click="ui.reviewPaneOpen.value ? ui.closeReview() : ui.openReview()"
      >
        <CodexIcon name="git-branch" />
        Review
        <span class="kbd">⌘B</span>
      </button>
    </header>

    <!-- 对话流(审批卡由 MessageAssistant 按 turn.approval 内联渲染) -->
    <ConversationPane
      v-if="conversationTurns.length || conversationRunning || standaloneApprovals.length"
      :key="client.activeSessionId.value ?? 'draft'"
      :session-id="client.activeSessionId.value ?? undefined"
      :turns="conversationTurns"
      :todos-by-turn="todosByTurn"
      :running="conversationRunning"
      :turn-progress="runProgress"
      :pending-approvals="standaloneApprovals"
      :open-file="onOpenFile"
      :has-more-messages="client.hasMoreMessages.value ?? false"
      :loading-more="client.loadingMoreMessages.value ?? false"
      @inspect="(tab) => ui.openDetail(tab)"
      @load-older="() => { const sid = client.activeSessionId.value; if (sid && client.hasMoreMessages.value) void client.loadOlderMessages(sid); }"
      @view-compaction="onViewCompaction"
      @edit-message="onEditMessage"
      @quote-message="onQuoteMessage"
      @fork-session="void client.forkSession()"
    >
      <template #approval="{ approval }">
        <ApprovalCard v-bind="approval" />
      </template>
    </ConversationPane>
    <!-- 空态:无会话/空会话占位 -->
    <div v-else class="empty-state">
      <CodexIcon name="sparkle" />
      <p class="es-title">
        {{ client.activeSessionId.value ? '开始你的第一句话' : '选择左侧会话,或在下方输入开始新对话' }}
      </p>
      <p class="es-sub">
        <template v-if="sidebarCurrentWs">当前工作区「{{ sidebarCurrentWs }}」 · 新任务可在顶部切换 · </template>
        <template v-else>先在顶部选择工作区 · </template>⌘K 命令面板 · / 斜杠命令 · @ 引用文件
      </p>
    </div>

    <!-- Inspect 右栏 -->
    <DetailPane
      :open="ui.detailPaneOpen.value"
      :tab="ui.detailPaneTab.value"
      :thread-info="{
        workspace: sidebarCurrentWs,
        createdAt: activeSession?.updatedAt ? formatLocalDateTime(activeSession.updatedAt) : '',
        model: client.status.value?.model ?? composerCurrentModel,
        permission: composerPermission,
        context: ctxInfo,
      }"
      :thinking-full-text="thinkingFullText"
      :thinking-segments="thinkingSegments"
      :tool-calls="toolCalls"
      :tasks="client.todos.value ?? []"
      :inspect="inspectData"
      @set-tab="(t) => ui.setDetailTab(t)"
      @close="ui.closeDetail()"
      @open-review="openInspectReview"
      @open-task="openTranscript"
      @launch-prompt="launchInspectPrompt"
    />

    <!-- 警告提示(daemon warnings,AppNotice 完整渲染:title + message + details) -->
    <div v-if="activeWarnings.length" class="codex-warnings">
      <div v-for="(w, idx) in activeWarnings" :key="idx" class="codex-warning">
        <span class="cw-icon"><CodexIcon name="alert-triangle" /></span>
        <span class="cw-text">
          <span class="cw-title">{{ typeof w === 'string' ? w : w.title }}</span>
          <span v-if="typeof w !== 'string' && w.message" class="cw-msg">{{ w.message }}</span>
          <span v-if="typeof w !== 'string' && w.details?.length" class="cw-details">
            <span v-for="(d, di) in w.details" :key="di" class="cw-detail">{{ d.label }}:{{ d.value }}</span>
          </span>
        </span>
        <button class="cw-close" @click="onDismissWarning(idx)"><CodexIcon name="x" /></button>
      </div>
    </div>

    <!-- 目标条(/goal) -->
    <div v-if="activeGoal" class="dock-goal-strip">
      <OfficialGoalStrip
        :goal="activeGoal"
        @control-goal="(a: 'pause' | 'resume' | 'cancel') => client.controlGoal(a)"
      />
    </div>

    <!-- 压缩进行中指示(client.compaction 仅运行时存在;完成后 transcript 留有分隔线) -->
    <div v-if="hasCompaction" class="codex-compaction">
      <span class="cc-line"></span>
      <span class="cc-text cc-live"><CodexIcon name="spinner" class="cc-spin" />正在压缩上下文…</span>
      <span class="cc-line"></span>
    </div>

    <!-- agent 提问(QuestionCard) -->
    <OfficialQuestionCard
      v-if="currentQuestion"
      :question="currentQuestion"
      :busy-kind="client.pendingQuestionActions[currentQuestion.questionId]"
      @answer="onAnswerQuestion"
      @dismiss="onDismissQuestion"
    />

    <div v-if="terminalOpen && sidebarCurrentSession" class="terminal-drawer">
      <Terminal :session-id="sidebarCurrentSession" @dismiss="terminalOpen = false" />
    </div>

    <!-- Composer dock -->
    <div class="app-dock">
      <div class="dock-inner">
        <QueuePanel
          v-if="queueItems.length"
          :queued-prompts="queueItems"
          @steer-all="qSteerAll"
          @edit="qEdit"
          @remove="qRemove"
          @reorder="(from: number, to: number) => void client.reorderQueue(from, to)"
        />
        <Composer
          ref="composerRef"
          :running="conversationRunning"
          :mode="composerMode"
          :permission="composerPermission"
          :modes="composerModes"
          :models="composerModels"
          :current-model="composerCurrentModel"
          :effort="composerEffort"
          :context="ctxInfo"
          :quota="quotaInfo"
          :builtin="builtinCommands"
          :skills="composerSkills"
          :files="[]"
          :search-files="searchFiles"
          :cost="client.sessionCost.value ?? 0"
          :upload-image="(file: Blob, name?: string) => client.uploadImage(file, name)"
          :session-title="activeSession?.title ?? sidebarCurrentWs"
          :session-id="client.activeSessionId.value ?? ''"
          @open-context-detail="pollPlanUsage"
          @send="onSend"
          @set-mode="onComposerMode"
          @cancel="() => client.abortCurrentPrompt()"
          @toggle-mode="(m: 'plan' | 'swarm' | 'goal') => {
            if (m === 'plan') client.togglePlanMode();
            else if (m === 'swarm') client.toggleSwarmMode();
            else if (m === 'goal') client.toggleGoalMode();
          }"
          @set-permission="(p: PermissionMode) => client.setPermission(p)"
          @set-model="onSetModel"
          @set-effort="onSetEffort"
          @pick-model="openModelPicker"
          @command="handleCommand"
        />
      </div>
    </div>

    <!-- 侧边任务(分栏) -->
    <SideTask v-bind="sideTaskProps" :running="sideChatRunning" @send="onSideChatSend">
      <!-- agent-transcript 模式:子 agent 详情 -->
      <div v-if="sideSubTask" class="msg-assistant">
        <div class="a-content">
          <p>
            <strong>{{ sideSubTask.name }}</strong>
            <span style="color: var(--text-3)"> · {{ sideSubTask.timing }}</span>
          </p>
          <div v-if="sideSubTaskModel" class="sat-model" :title="sideSubTaskModel.hint">
            <span>{{ sideSubTaskModel.route === 'secondary' ? '次级模型' : '主模型' }}</span>
            <strong>{{ sideSubTaskModel.name }}</strong>
            <span class="sat-inferred">{{ sideSubTaskModel.source === 'runtime' ? '运行时上报' : '配置推导' }}</span>
          </div>
          <div v-if="sideSubagentTimeline.length" class="sat-timeline">
            <span v-for="item in sideSubagentTimeline" :key="item">{{ item }}</span>
          </div>
          <div class="sat-toolbar">
            <div class="sat-tabs" role="tablist">
              <button :class="{ active: sideSubagentTab === 'reply' }" @click="sideSubagentTab = 'reply'">回复</button>
              <button :class="{ active: sideSubagentTab === 'activity' }" @click="sideSubagentTab = 'activity'">活动 {{ sideSubTask.output?.length ?? 0 }}</button>
              <button :class="{ active: sideSubagentTab === 'summary' }" @click="sideSubagentTab = 'summary'">摘要</button>
              <button :class="{ active: sideSubagentTab === 'relations' }" @click="sideSubagentTab = 'relations'">关联与产物</button>
            </div>
            <button class="btn sat-copy" @click="copySideSubagentOutput"><CodexIcon name="copy" /> 复制</button>
          </div>
          <p v-if="sideSubTask.suspendedReason" style="color: var(--warning)">
            等待输入：{{ sideSubTask.suspendedReason }}。请在主对话中的问题卡片回复。
          </p>
          <p v-else-if="sideSubTask.meta" style="color: var(--text-2)">{{ sideSubTask.meta }}</p>
          <section v-if="sideSubagentTab === 'reply' && sideSubagentText" class="sat-section">
            <span class="sat-label">回复正文</span>
            <pre>{{ sideSubagentVisibleText }}</pre>
          </section>
          <section v-if="sideSubagentTab === 'activity' && sideSubagentActivity" class="sat-section">
            <span class="sat-label">执行记录 · {{ sideSubTask.output?.length ?? 0 }} 行</span>
            <pre>{{ sideSubagentVisibleActivity }}</pre>
          </section>
          <section
            v-if="sideSubagentTab === 'summary' && sideSubTask.summary"
            class="sat-section"
          >
            <span class="sat-label">结果摘要</span>
            <div class="sat-summary">{{ sideSubTask.summary }}</div>
          </section>
          <section v-if="sideSubagentTab === 'relations'" class="sat-section sat-relations">
            <span class="sat-label">任务关系</span>
            <dl>
              <dt>主任务</dt><dd>{{ activeSession?.title || client.activeSessionId.value || '当前任务' }}</dd>
              <dt>工作区</dt><dd>{{ sidebarCurrentWsRoot || sidebarCurrentWs || '未记录' }}</dd>
              <dt>父工具调用</dt><dd><code>{{ sideSubTask.parentToolCallId || 'daemon 未上报' }}</code></dd>
              <dt>执行形态</dt><dd>{{ sideSubTask.runInBackground ? '后台子智能体' : '前台子智能体' }}<template v-if="sideSubTask.swarmIndex !== undefined"> · Swarm #{{ sideSubTask.swarmIndex + 1 }}</template></dd>
            </dl>
            <span class="sat-label">当前主任务变更（非单个子智能体归因）</span>
            <ul v-if="changedFiles.length" class="sat-files"><li v-for="file in changedFiles" :key="file.path"><code>{{ file.path }}</code><span>+{{ file.additions ?? 0 }} / -{{ file.deletions ?? 0 }}</span></li></ul>
            <p v-else style="color:var(--text-3)">当前任务还没有可展示的文件变更。</p>
          </section>
          <button
            v-if="Math.max(sideSubagentText.length, sideSubagentActivity.length) > SUBAGENT_PREVIEW_CHARS"
            class="btn sat-expand"
            @click="sideSubagentExpanded = !sideSubagentExpanded"
          >{{ sideSubagentExpanded ? '收起长输出' : '显示完整输出' }}</button>
          <p
            v-if="(sideSubagentTab === 'reply' && !sideSubagentText) || (sideSubagentTab === 'activity' && !sideSubagentActivity) || (sideSubagentTab === 'summary' && !sideSubTask.summary)"
            style="color: var(--text-3)"
          >
            该视图暂无可用记录。
          </p>
        </div>
      </div>
      <!-- thread 模式:侧边对话(/btw) -->
      <template v-else>
        <div v-if="sideChatTurns.length" class="side-chat-turns">
          <template v-for="t in sideChatTurns" :key="t.id">
            <MessageUser v-if="t.role === 'user'" :turn="t" />
            <MessageAssistant
              v-else-if="t.role === 'assistant'"
              :turn="t"
              :running="sideChatRunning && t.id === sideChatTurns[sideChatTurns.length - 1]?.id"
            />
          </template>
        </div>
        <div v-else class="msg-assistant">
          <div class="a-content">
            <p style="color: var(--text-3)">侧边对话:在这里问问题,不影响主线程。</p>
          </div>
        </div>
      </template>
    </SideTask>

    <!-- 子智能体面板 -->
    <AgentPanel
      :active="activeSubagents"
      :completed="completedSubagents"
      :session-title="activeSession?.title"
      :workspace-name="sidebarCurrentWs"
      :open="ui.agentPanelOpen.value"
      @inspect="openTranscript"
      @cancel="onCancelTask"
      @detach="onDetachTask"
      @close="ui.closeAgentPanel()"
    />
    <GlobalTaskPanel
      :open="globalTaskOpen"
      @close="globalTaskOpen = false"
      @open-session="openSessionFromGlobal"
    />

    <!-- Review pane(⌘B,有改动文件时出现) -->
    <ReviewPane
      v-if="changedFiles.length"
      :files="changedFiles"
      :hunks-by-file="hunksByFile"
      :branch="client.gitInfo.value?.branch ?? ''"
      :selected-path="client.selectedDiffPath.value"
      :loading="client.fileDiffLoading.value"
      @select-file="onSelectDiffFile"
      @request-fix="onRequestReviewFix"
    />

    <OfficialModelPicker
      v-if="showModelPicker"
      :models="client.models.value ?? []"
      :current="composerCurrentModel"
      :starred-ids="client.starredModelIds.value ?? []"
      :cache-warning="conversationTurns.length > 0"
      @select="onPickModelOverlay"
      @toggle-star="(id: string) => client.toggleStarModel(id)"
      @manage="() => { showModelPicker = false; settingsSection = 'models-providers'; settingsOpen = true; }"
      @close="showModelPicker = false"
    />
    <CacheExpiryDialog
      v-if="pendingCacheSend"
      :idle-minutes="pendingCacheSend.idleMinutes"
      :tokens="pendingCacheSend.tokens"
      @choose="resolveCacheExpiry"
    />

    <!-- 首次引导(语言/主题/accent) -->
    <Onboarding
      v-if="showOnboarding"
      @complete="() => { client.setOnboarded(true); showOnboarding = false; }"
      @skip="() => { client.setOnboarded(true); showOnboarding = false; }"
    />

    <!-- ⌘K 命令面板(命令 + 会话双区) -->
    <CommandPalette
      v-if="showSearch"
      :actions="paletteActions"
      :sessions="paletteSessions"
      :search-loading="searchLoading"
      :search-hint="searchHint"
      @select-action="onPaletteAction"
      @select-session="onSelectPaletteSession"
      @query="onPaletteQuery"
      @close="showSearch = false"
    />

  </AppShell>
  <!-- 必须位于设置/主页面条件分支之外：设置页手动检查发现新版本时立即弹出。 -->
  <UpdateDialog />
  <Toast />

  <!-- 401 时的 token 输入弹层(浏览器 dev 流程;Tauri 由 Rust 注入凭据) -->
  <OfficialServerAuthDialog v-if="showServerAuth" />

  <ProviderManager
    v-if="showProviderManager"
    :providers="client.providers.value ?? []"
    :models="client.models.value ?? []"
    :oauth-available="false"
    :loading="providerManagerLoading"
    :busy-ids="providerBusyIds"
    :adding="providerAdding"
    @add="addProvider"
    @update="updateProvider"
    @refresh="refreshProvider"
    @delete="onDeleteProvider"
    @imported="onProviderImported"
    @open-login="() => toast('请先在账户页登录 Kimi，再刷新 Provider')"
    @close="showProviderManager = false"
  />

  <CommandHelpDialog
    v-if="commandHelpOpen"
    @run="(command: string) => { commandHelpOpen = false; handleCommand(command); }"
    @close="commandHelpOpen = false"
  />

  <UndoDialog
    v-if="undoDialogOpen"
    :turns="conversationTurns"
    @undo="(count: number, text: string) => runUndo(count, text)"
    @close="undoDialogOpen = false"
  />

  <PluginTuiDialog
    v-if="pluginManagerOpen"
    :workspace-root="sidebarCurrentWsRoot"
    :runtime-version="client.serverVersion.value || undefined"
    @close="pluginManagerOpen = false"
  />

  <!-- 应用内输入/确认弹层(重命名/移除工作区等,替代 window.prompt) -->
  <PromptDialog
    v-if="promptDialog"
    :title="promptDialog.title"
    :description="promptDialog.description"
    :placeholder="promptDialog.placeholder"
    :initial="promptDialog.initial"
    :confirm-label="promptDialog.confirmLabel"
    :alternate-label="promptDialog.alternateLabel"
    :danger="promptDialog.danger"
    :input="promptDialog.input"
    @confirm="(v: string) => { const cb = promptDialog!.onConfirm; promptDialog = null; cb(v); }"
    @alternate="() => { const cb = promptDialog!.onAlternate; promptDialog = null; cb?.(); }"
    @cancel="promptDialog = null"
  />
  <div v-if="workspaceDropActive" class="workspace-drop-overlay">
    <div><CodexIcon name="file" /><strong>松开以添加工作区</strong><span>只会添加文件夹，不会移动或复制内容</span></div>
  </div>
</template>
