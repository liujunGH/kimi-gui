<script setup lang="ts">
/**
 * SettingsPage —— 按作用域分组的设置中心。
 *
 * 轮次 4e:接通 client 配置(权限/模型/字号/通知/归档)
 * 替代原型期的本地 ref 占位。
 */
import { computed, reactive, ref, watch } from 'vue';
import type { PermissionMode } from '../../../types';
import type { AppSession, AppConfig, AppMcpServer, AppToolDescriptor } from '../../../api/types';
import { getKimiWebApi } from '../../../api';
import { setEphemeralCredential } from '../../../api/daemon/serverAuth';
import CodexIcon from '../layout/CodexIcon.vue';
import PromptDialog from '../layout/PromptDialog.vue';
import { useTheme } from '../../../composables/codex/useTheme';
import { useKimiClient } from '../../../composables/codex/useKimiClient';
import { useUpdater } from '../../../composables/codex/useUpdater';
import { useToast } from '../layout/Toast.vue';
import {
  kimiNativeAvailable,
  kimiRuntime,
  type KimiAgentProfile,
  type KimiEngineStatus,
  type KimiBackupInfo,
  type KimiMcpConfigEntry,
  type KimiWorkspaceContext,
} from '../../../composables/useKimiRuntime';

type SettingsSectionId =
  | 'general'
  | 'appearance'
  | 'models-providers'
  | 'agents'
  | 'plugins-skills'
  | 'mcp'
  | 'permissions'
  | 'hooks'
  | 'directories'
  | 'shortcuts'
  | 'archive'
  | 'engine'
  | 'about';

const props = withDefaults(defineProps<{ initialSection?: SettingsSectionId }>(), {
  initialSection: 'general',
});
const emit = defineEmits<{
  (e: 'open-providers'): void;
  (e: 'launch-command', command: string): void;
}>();

const client = useKimiClient();

const NAV: Array<{ label: string; items: Array<{ id: SettingsSectionId; label: string; icon: string }> }> = [
  { label: '基础', items: [
    { id: 'general', label: '通用', icon: 'sliders' },
    { id: 'appearance', label: '外观与通知', icon: 'sun' },
    { id: 'shortcuts', label: '快捷键', icon: 'keyboard' },
  ] },
  { label: '智能能力', items: [
    { id: 'models-providers', label: '模型与 Provider', icon: 'bot' },
    { id: 'agents', label: 'Agents', icon: 'sparkle' },
    { id: 'plugins-skills', label: '插件与 Skills', icon: 'apps' },
    { id: 'mcp', label: 'MCP 服务', icon: 'terminal' },
  ] },
  { label: '安全与控制', items: [
    { id: 'permissions', label: '权限与工具', icon: 'shield' },
    { id: 'hooks', label: 'Hooks', icon: 'git-branch' },
  ] },
  { label: '数据与系统', items: [
    { id: 'directories', label: '工作区目录', icon: 'file' },
    { id: 'archive', label: '归档与导入', icon: 'archive' },
    { id: 'engine', label: 'Kimi Engine', icon: 'terminal' },
    { id: 'about', label: '关于', icon: 'info' },
  ] },
];

const active = ref<SettingsSectionId>(props.initialSection);

/* ---------- 通用 ---------- */
// 权限默认值:读 daemon 全局配置,写 client.updateConfig
const permDefault = computed<PermissionMode>({
  get: () =>
    ((client.config.value as AppConfig | null)?.defaultPermissionMode as PermissionMode | undefined) ??
    'manual',
  set: (v: PermissionMode) => void client.updateConfig({ defaultPermissionMode: v }),
});

// 默认模型:读 daemon 全局配置,写 client.updateConfig
const modelOptions = computed(() =>
  (client.models.value ?? []).map((m) => ({
    id: m.id,
    name: m.displayName ?? m.model ?? m.id,
  })),
);
const defaultModelId = computed<string>({
  get: () => (client.config.value as AppConfig | null)?.defaultModel ?? client.defaultModel.value ?? '',
  set: (v) => void client.updateConfig({ defaultModel: v }),
});
const secondaryEffort = ref(
  (client.config.value as AppConfig | null)?.secondaryModel?.defaultEffort ?? 'low',
);
const secondaryModelId = computed<string>({
  get: () => (client.config.value as AppConfig | null)?.secondaryModel?.model ?? '',
  set: (model) => void client.updateConfig({
    secondaryModel: model ? { model, defaultEffort: secondaryEffort.value || undefined } : {},
  }),
});
function saveSecondaryEffort(): void {
  const model = secondaryModelId.value;
  if (model) void client.updateConfig({ secondaryModel: { model, defaultEffort: secondaryEffort.value || undefined } });
}

/* ---------- Agent 中心 ---------- */
const nativeAvailable = kimiNativeAvailable();
const agents = ref<KimiAgentProfile[]>([]);
const agentsLoading = ref(false);
const selectedAgent = ref('');
const systemPrompt = ref('');
const systemPromptDirty = ref(false);
const agentForm = reactive({
  name: '',
  description: '',
  whenToUse: '',
  modelPreference: 'secondary' as 'primary' | 'secondary',
  tools: 'Read, Grep, Glob',
  disallowedTools: '',
  prompt: '${base_prompt}\n\n',
});
const deleteArmed = ref(false);

const activeWorkspaceRoot = computed(() =>
  client.workspacesView.value.find((workspace) => workspace.id === client.activeWorkspaceId.value)?.root,
);

function fillAgent(profile?: KimiAgentProfile): void {
  selectedAgent.value = profile?.name ?? '';
  agentForm.name = profile?.name ?? '';
  agentForm.description = profile?.description ?? '';
  agentForm.whenToUse = profile?.whenToUse ?? '';
  agentForm.modelPreference = profile?.modelPreference ?? 'secondary';
  agentForm.tools = profile?.tools.join(', ') ?? 'Read, Grep, Glob';
  agentForm.disallowedTools = profile?.disallowedTools.join(', ') ?? '';
  agentForm.prompt = profile?.prompt ?? '${base_prompt}\n\n';
  deleteArmed.value = false;
}
function csv(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}
async function loadAgentCenter(): Promise<void> {
  if (!nativeAvailable) return;
  agentsLoading.value = true;
  try {
    const root = activeWorkspaceRoot.value;
    const [profiles, prompt] = await Promise.all([
      kimiRuntime.listAgents(root),
      kimiRuntime.readSystemPrompt(),
    ]);
    agents.value = profiles;
    systemPrompt.value = prompt;
    systemPromptDirty.value = false;
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Agent 中心加载失败');
  } finally {
    agentsLoading.value = false;
  }
}

/* ---------- 插件 / Skills / 工具 ---------- */
const tools = ref<AppToolDescriptor[]>([]);
const toolsLoading = ref(false);
async function loadTools(): Promise<void> {
  toolsLoading.value = true;
  try {
    tools.value = await getKimiWebApi().listTools(client.activeSessionId.value || undefined);
  } catch (error) {
    tools.value = [];
    toast(error instanceof Error ? error.message : '工具目录加载失败');
  } finally {
    toolsLoading.value = false;
  }
}
const skillsBySource = computed(() => {
  const grouped = new Map<string, typeof client.skills.value>();
  for (const skill of client.skills.value) {
    const key = skill.source || 'unknown';
    grouped.set(key, [...(grouped.get(key) ?? []), skill]);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
});

/* ---------- MCP ---------- */
const mcpConfig = ref<KimiMcpConfigEntry[]>([]);
const mcpStatus = ref<AppMcpServer[]>([]);
const mcpLoading = ref(false);
const mcpForm = reactive({
  originalName: '',
  originalScope: 'project' as 'user' | 'project',
  name: '',
  scope: 'project' as 'user' | 'project',
  transport: 'stdio' as 'stdio' | 'http' | 'sse',
  command: '',
  args: '',
  url: '',
  enabled: true,
  hasSensitiveConfig: false,
});
function editMcp(entry?: KimiMcpConfigEntry): void {
  mcpForm.originalName = entry?.name ?? '';
  mcpForm.originalScope = entry?.scope ?? (activeWorkspaceRoot.value ? 'project' : 'user');
  mcpForm.name = entry?.name ?? '';
  mcpForm.scope = entry?.scope ?? (activeWorkspaceRoot.value ? 'project' : 'user');
  mcpForm.transport = entry?.transport ?? 'stdio';
  mcpForm.command = entry?.command ?? '';
  mcpForm.args = entry?.args.join('\n') ?? '';
  mcpForm.url = entry?.url ?? '';
  mcpForm.enabled = entry?.enabled ?? true;
  mcpForm.hasSensitiveConfig = entry?.hasSensitiveConfig ?? false;
}
async function loadMcp(): Promise<void> {
  mcpLoading.value = true;
  try {
    const [status, config] = await Promise.all([
      getKimiWebApi().listMcpServers().catch(() => []),
      nativeAvailable ? kimiRuntime.listMcpConfig(activeWorkspaceRoot.value) : Promise.resolve([]),
    ]);
    mcpStatus.value = status;
    mcpConfig.value = config;
  } catch (error) {
    toast(error instanceof Error ? error.message : 'MCP 配置加载失败');
  } finally {
    mcpLoading.value = false;
  }
}
async function saveMcp(): Promise<void> {
  try {
    const saved = await kimiRuntime.saveMcpServer({
      name: mcpForm.name.trim(),
      scope: mcpForm.scope,
      workspaceRoot: activeWorkspaceRoot.value,
      transport: mcpForm.transport,
      command: mcpForm.command.trim() || undefined,
      args: mcpForm.args.split('\n').map((v) => v.trim()).filter(Boolean),
      url: mcpForm.url.trim() || undefined,
      enabled: mcpForm.enabled,
    });
    if (mcpForm.originalName && mcpForm.originalName !== saved.name) {
      await kimiRuntime.deleteMcpServer(mcpForm.originalName, mcpForm.originalScope, activeWorkspaceRoot.value);
    }
    toast('MCP 配置已保存；新会话会载入它');
    await loadMcp();
    editMcp(saved);
  } catch (error) {
    toast(error instanceof Error ? error.message : 'MCP 保存失败');
  }
}
async function deleteMcp(entry: KimiMcpConfigEntry): Promise<void> {
  try {
    await kimiRuntime.deleteMcpServer(entry.name, entry.scope, activeWorkspaceRoot.value);
    toast('MCP 配置已删除');
    await loadMcp();
    if (mcpForm.originalName === entry.name) editMcp();
  } catch (error) {
    toast(error instanceof Error ? error.message : 'MCP 删除失败');
  }
}
async function deleteCurrentMcp(): Promise<void> {
  const entry = mcpConfig.value.find((item) =>
    item.name === mcpForm.originalName && item.scope === mcpForm.originalScope,
  );
  if (entry) await deleteMcp(entry);
}
async function restartMcp(id: string): Promise<void> {
  try {
    await getKimiWebApi().restartMcpServer(id);
    toast('正在重启 MCP 服务');
    window.setTimeout(() => void loadMcp(), 600);
  } catch (error) {
    toast(error instanceof Error ? error.message : 'MCP 重启失败');
  }
}

/* ---------- 权限规则 / Hooks ---------- */
type PermissionDecision = 'allow' | 'deny' | 'ask';
interface PermissionRule { decision: PermissionDecision; scope: string; pattern: string; reason: string }
interface HookRule { event: string; matcher: string; command: string; timeout: number }
const permissionRules = ref<PermissionRule[]>([]);
const hooks = ref<HookRule[]>([]);
function loadControlConfig(): void {
  const config = client.config.value as AppConfig | null;
  const sourceRules = (config?.permission as { rules?: unknown[] } | undefined)?.rules ?? [];
  permissionRules.value = sourceRules.map((raw) => {
    const rule = raw as Record<string, unknown>;
    return {
      decision: (['allow', 'deny', 'ask'].includes(String(rule.decision)) ? String(rule.decision) : 'ask') as PermissionDecision,
      scope: typeof rule.scope === 'string' ? rule.scope : '',
      pattern: typeof rule.pattern === 'string' ? rule.pattern : '',
      reason: typeof rule.reason === 'string' ? rule.reason : '',
    };
  });
  hooks.value = (config?.hooks ?? []).map((raw) => {
    const hook = raw as Record<string, unknown>;
    return {
      event: typeof hook.event === 'string' ? hook.event : '',
      matcher: typeof hook.matcher === 'string' ? hook.matcher : '',
      command: typeof hook.command === 'string' ? hook.command : '',
      timeout: typeof hook.timeout === 'number' ? hook.timeout : 30,
    };
  });
}
async function savePermissionRules(): Promise<void> {
  const rules = permissionRules.value
    .filter((rule) => rule.pattern.trim())
    .map((rule) => ({ decision: rule.decision, ...(rule.scope.trim() ? { scope: rule.scope.trim() } : {}), pattern: rule.pattern.trim(), ...(rule.reason.trim() ? { reason: rule.reason.trim() } : {}) }));
  await client.updateConfig({ permission: { rules } });
  toast('权限规则已保存');
}
async function saveHooks(): Promise<void> {
  const value = hooks.value
    .filter((hook) => hook.event.trim() && hook.command.trim())
    .map((hook) => ({ event: hook.event.trim(), ...(hook.matcher.trim() ? { matcher: hook.matcher.trim() } : {}), command: hook.command.trim(), timeout: Math.max(1, Number(hook.timeout) || 30) }));
  await client.updateConfig({ hooks: value });
  toast('Hooks 已保存；后续事件将使用新配置');
}

/* ---------- 工作区附加目录 ---------- */
const workspaceContext = ref<KimiWorkspaceContext | null>(null);
const additionalDirs = ref<string[]>([]);
async function loadWorkspaceContext(): Promise<void> {
  if (!nativeAvailable || !activeWorkspaceRoot.value) return;
  try {
    workspaceContext.value = await kimiRuntime.readWorkspaceContext(activeWorkspaceRoot.value);
    additionalDirs.value = [...workspaceContext.value.additionalDirs];
  } catch (error) {
    toast(error instanceof Error ? error.message : '工作区目录配置加载失败');
  }
}
async function saveWorkspaceContext(): Promise<void> {
  if (!activeWorkspaceRoot.value) return;
  try {
    workspaceContext.value = await kimiRuntime.saveWorkspaceContext(activeWorkspaceRoot.value, additionalDirs.value);
    additionalDirs.value = [...workspaceContext.value.additionalDirs];
    toast('附加目录已保存；新会话会纳入这些目录');
  } catch (error) {
    toast(error instanceof Error ? error.message : '附加目录保存失败');
  }
}
async function saveAgent(): Promise<void> {
  try {
    const saved = await kimiRuntime.saveAgent({
      name: agentForm.name.trim(),
      description: agentForm.description.trim(),
      whenToUse: agentForm.whenToUse.trim() || undefined,
      modelPreference: agentForm.modelPreference,
      tools: csv(agentForm.tools),
      disallowedTools: csv(agentForm.disallowedTools),
      prompt: agentForm.prompt,
    });
    const rest = agents.value.filter((agent) => !(agent.scope === 'user' && agent.name === saved.name));
    agents.value = [...rest, saved].sort((a, b) => a.name.localeCompare(b.name));
    fillAgent(saved);
    toast('Agent 已保存，新任务会自动发现它');
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Agent 保存失败');
  }
}
async function deleteAgent(): Promise<void> {
  if (!deleteArmed.value) {
    deleteArmed.value = true;
    return;
  }
  try {
    await kimiRuntime.deleteAgent(agentForm.name);
    agents.value = agents.value.filter((agent) => !(agent.scope === 'user' && agent.name === agentForm.name));
    fillAgent();
    toast('Agent 已删除');
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Agent 删除失败');
  }
}
async function saveSystemPrompt(): Promise<void> {
  try {
    await kimiRuntime.saveSystemPrompt(systemPrompt.value);
    systemPromptDirty.value = false;
    toast(systemPrompt.value.trim() ? 'SYSTEM.md 已保存' : '已恢复内置系统提示');
  } catch (error) {
    toast(error instanceof Error ? error.message : 'SYSTEM.md 保存失败');
  }
}

/* ---------- Engine ---------- */
const engine = ref<KimiEngineStatus | null>(null);
const maintenanceBusy = ref('');
const maintenanceOutput = ref('');
const restartConfirmOpen = ref(false);

function versionParts(version?: string): number[] | null {
  if (!version) return null;
  const match = version.trim().match(/^(?:v)?(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

/** Positive means the installed CLI is newer than the running daemon. */
const engineVersionRelation = computed<number | null>(() => {
  const cli = versionParts(engine.value?.version);
  const daemon = versionParts(client.serverVersion.value);
  if (!cli || !daemon) return null;
  for (let index = 0; index < 3; index += 1) {
    const cliPart = cli[index] ?? 0;
    const daemonPart = daemon[index] ?? 0;
    if (cliPart !== daemonPart) return cliPart - daemonPart;
  }
  return 0;
});

const restartDescription = computed(() => {
  const runningWarning = client.working.value
    ? '当前任务仍在运行，重启会中断这次执行。'
    : '重启会短暂断开连接，并中断 daemon 中尚未结束的任务。';
  return `${runningWarning} GUI 会在新 daemon 就绪后自动重连。`;
});

async function loadEngine(): Promise<void> {
  if (!nativeAvailable) return;
  try { engine.value = await kimiRuntime.engineStatus(); } catch { engine.value = null; }
}
async function restartDaemon(): Promise<void> {
  restartConfirmOpen.value = false;
  maintenanceBusy.value = 'restart';
  maintenanceOutput.value = '正在安全关闭当前 daemon，并使用已安装的 CLI 启动…';
  try {
    const info = await kimiRuntime.restartDaemon();
    setEphemeralCredential(info.token);
    localStorage.setItem('kimi-gui.daemon-base', info.base);
    maintenanceOutput.value = `daemon 已使用 Kimi CLI ${engine.value?.version ?? ''} 重启，正在刷新连接…`;
    toast('Kimi daemon 已重启');
    // A graceful daemon shutdown can leave the already-upgraded process alive
    // while this page's old WebSocket is still open. The new daemon is already
    // listening on the same port, but the socket would keep reporting the old
    // /meta version forever. Reload closes that half-old connection and lets
    // desktop bootstrap re-read the authoritative base/token from Rust.
    window.setTimeout(() => window.location.reload(), 500);
  } catch (error) {
    maintenanceOutput.value = error instanceof Error ? error.message : String(error);
    toast('Kimi daemon 重启失败');
  } finally {
    maintenanceBusy.value = '';
  }
}
async function runMaintenance(action: 'doctor-config' | 'doctor-tui' | 'migrate' | 'update' | 'visualizer'): Promise<void> {
  maintenanceBusy.value = action;
  maintenanceOutput.value = '';
  try {
    maintenanceOutput.value = await kimiRuntime.runMaintenance(action, client.activeSessionId.value ?? undefined) || '操作完成';
    toast('Kimi Engine 操作完成');
    await loadEngine();
  } catch (error) {
    maintenanceOutput.value = error instanceof Error ? error.message : String(error);
    toast('Kimi Engine 操作失败');
  } finally {
    maintenanceBusy.value = '';
  }
}

// 通知开关
const notifyComplete = computed<boolean>({
  get: () => client.notifyOnComplete.value ?? false,
  set: (v) => client.setNotifyOnComplete(v),
});
const notifyQuestion = computed<boolean>({
  get: () => client.notifyOnQuestion.value ?? false,
  set: (v) => client.setNotifyOnQuestion(v),
});
const notifyApproval = computed<boolean>({
  get: () => client.notifyOnApproval.value ?? false,
  set: (v) => client.setNotifyOnApproval(v),
});
const soundComplete = computed<boolean>({
  get: () => client.soundOnComplete.value ?? false,
  set: (v) => client.setSoundOnComplete(v),
});

/* ---------- 外观 ---------- */
type ThemeChoice = 'light' | 'dark' | 'system';
const { theme, set } = useTheme();
const themeChoice = ref<ThemeChoice>(theme.value);
function pickTheme(c: ThemeChoice) {
  themeChoice.value = c;
  set(c as any);
}

const fontSize = computed<string>({
  get: () => String(client.uiFontSize.value ?? 14) + 'px',
  set: (v) => client.setUiFontSize(Number(v.replace('px', '')) || 14),
});
function setFontSize(px: number) {
  client.setUiFontSize(px);
}

/* ---------- 权限(详细) ---------- */

/* ---------- 归档 ---------- */
const archivedSessions = ref<AppSession[]>([]);
const archiveQuery = ref('');
const archiveSelectedIds = ref<string[]>([]);
const archiveFiltered = computed(() => {
  const query = archiveQuery.value.trim().toLocaleLowerCase();
  if (!query) return archivedSessions.value;
  return archivedSessions.value.filter((session) =>
    [session.title, session.id, session.cwd]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(query)),
  );
});
const archiveAllVisibleSelected = computed(() =>
  archiveFiltered.value.length > 0
  && archiveFiltered.value.every((session) => archiveSelectedIds.value.includes(session.id)),
);
const backupBusy = ref(false);
const backupInfo = ref<KimiBackupInfo | null>(null);
const restoreArmed = ref(false);
/** 应用版本(构建期注入,单一来源 tauri.conf.json) */
const appVersion = __APP_VERSION__;

/* ---------- 检查更新 ---------- */
const { checking, error: updateError, checkForUpdate } = useUpdater();
const { toast } = useToast();
async function onCheckUpdate() {
  const found = await checkForUpdate(false);
  if (found) return; // available 有值,UpdateDialog 自动弹出
  if (updateError.value) toast(`检查失败:${updateError.value}`);
  else toast('已是最新版本');
}

/** 退出应用(托盘菜单之外的兜底退出路径;daemon 是共享设施,不动它) */
async function onQuitApp() {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('quit_app');
  } catch {
    window.close();
  }
}
const archivedLoading = ref(false);
async function loadArchive() {
  archivedLoading.value = true;
  try {
    const res = await client.loadArchivedSessions();
    archivedSessions.value = res?.items ?? [];
  } catch (err) {
    console.warn('[settings] load archived sessions failed', err);
    toast('加载归档会话失败');
  } finally {
    archivedLoading.value = false;
  }
}
/** 恢复归档会话(返回成功则移出列表) */
async function onRestore(id: string) {
  const ok = await client.restoreSession(id);
  if (ok) {
    archivedSessions.value = archivedSessions.value.filter((s) => s.id !== id);
    archiveSelectedIds.value = archiveSelectedIds.value.filter((value) => value !== id);
  }
}
function toggleArchiveSelection(id: string): void {
  archiveSelectedIds.value = archiveSelectedIds.value.includes(id)
    ? archiveSelectedIds.value.filter((value) => value !== id)
    : [...archiveSelectedIds.value, id];
}
function toggleVisibleArchives(): void {
  const visible = new Set(archiveFiltered.value.map((session) => session.id));
  archiveSelectedIds.value = archiveAllVisibleSelected.value
    ? archiveSelectedIds.value.filter((id) => !visible.has(id))
    : [...new Set([...archiveSelectedIds.value, ...visible])];
}
async function restoreSelectedArchives(): Promise<void> {
  const ids = [...archiveSelectedIds.value];
  if (!ids.length) return;
  const results = await Promise.all(ids.map(async (id) => ({ id, ok: await client.restoreSession(id) })));
  const restored = new Set(results.filter((result) => result.ok).map((result) => result.id));
  archivedSessions.value = archivedSessions.value.filter((session) => !restored.has(session.id));
  archiveSelectedIds.value = archiveSelectedIds.value.filter((id) => !restored.has(id));
  toast(`已恢复 ${restored.size} 条${restored.size < ids.length ? `，${ids.length - restored.size} 条失败` : ''}`);
}
function formatBackupBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
async function exportSettingsBackup(): Promise<void> {
  backupBusy.value = true;
  try {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const stamp = new Date().toISOString().slice(0, 10);
    const destination = await save({
      title: '导出 Kimi 设置备份',
      defaultPath: `kimi-settings-${stamp}.zip`,
      filters: [{ name: 'ZIP 备份', extensions: ['zip'] }],
    });
    if (!destination) return;
    backupInfo.value = await kimiRuntime.createSettingsBackup(destination);
    restoreArmed.value = false;
    toast(`已备份 ${backupInfo.value.files} 个文件`);
  } catch (error) {
    toast(error instanceof Error ? error.message : '设置备份失败');
  } finally {
    backupBusy.value = false;
  }
}
async function inspectSettingsBackup(): Promise<void> {
  backupBusy.value = true;
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      title: '选择 Kimi 设置备份',
      multiple: false,
      directory: false,
      filters: [{ name: 'ZIP 备份', extensions: ['zip'] }],
    });
    if (typeof selected !== 'string' || !selected) return;
    backupInfo.value = await kimiRuntime.inspectSettingsBackup(selected);
    restoreArmed.value = false;
    toast('备份预检通过，请核对内容后恢复');
  } catch (error) {
    backupInfo.value = null;
    restoreArmed.value = false;
    toast(error instanceof Error ? error.message : '备份预检失败');
  } finally {
    backupBusy.value = false;
  }
}
async function restoreSettingsBackup(): Promise<void> {
  if (!backupInfo.value) return;
  if (!restoreArmed.value) {
    restoreArmed.value = true;
    return;
  }
  backupBusy.value = true;
  try {
    const restored = await kimiRuntime.restoreSettingsBackup(backupInfo.value.path);
    backupInfo.value = restored;
    restoreArmed.value = false;
    toast(`已恢复 ${restored.files} 个文件；原设置已保存安全快照`);
  } catch (error) {
    restoreArmed.value = false;
    toast(error instanceof Error ? error.message : '设置恢复失败');
  } finally {
    backupBusy.value = false;
  }
}
watch(active, (section) => {
  if (section === 'archive') void loadArchive();
  else if (section === 'agents') void loadAgentCenter();
  else if (section === 'engine') void loadEngine();
  else if (section === 'plugins-skills') void loadTools();
  else if (section === 'mcp') void loadMcp();
  else if (section === 'permissions') { loadControlConfig(); void loadTools(); }
  else if (section === 'hooks') loadControlConfig();
  else if (section === 'directories') void loadWorkspaceContext();
}, { immediate: true });

watch(() => props.initialSection, (section) => { active.value = section; });


</script>

<template>
  <div class="settings">
    <div class="settings-inner">
      <h1 class="settings-title">设置</h1>
      <div class="settings-grid">
        <nav class="settings-nav">
          <div v-for="group in NAV" :key="group.label" class="settings-nav-group">
            <div class="settings-nav-label">{{ group.label }}</div>
            <a
              v-for="n in group.items"
              :key="n.id"
              :href="'#' + n.id"
              :class="{ active: active === n.id }"
              @click.prevent="active = n.id"
            >
              <CodexIcon :name="n.icon" />
              {{ n.label }}
            </a>
          </div>
        </nav>

        <div class="settings-content">
          <!-- 通用 -->
          <section class="settings-section" :class="{ active: active === 'general' }" id="general">
            <h2>通用</h2>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">默认权限模式</div>
              </div>
              <div class="setting-control">
                <select v-model="permDefault" class="control">
                  <option value="manual">逐条确认</option>
                  <option value="yolo">YOLO · 自动批准工具，仍可提问</option>
                  <option value="auto">自动 · 完全自主，不再提问</option>
                </select>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">发送快捷键</div>
                <div class="setting-desc">Enter 发送，Shift+Enter 换行</div>
              </div>
              <div class="setting-control">
                <div class="shortcut-keys">
                  <span class="kbd">Enter</span>
                </div>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">默认模型</div>
              </div>
              <div class="setting-control">
                <select v-model="defaultModelId" class="control">
                  <option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.name }}</option>
                </select>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">完成时通知</div>
                <div class="setting-desc">agent 完成任务后发送系统通知</div>
              </div>
              <div class="setting-control">
                <label class="switch">
                  <input v-model="notifyComplete" type="checkbox" />
                  <span class="switch-slider"></span>
                </label>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">提问时通知</div>
              </div>
              <div class="setting-control">
                <label class="switch">
                  <input v-model="notifyQuestion" type="checkbox" />
                  <span class="switch-slider"></span>
                </label>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">审批时通知</div>
              </div>
              <div class="setting-control">
                <label class="switch">
                  <input v-model="notifyApproval" type="checkbox" />
                  <span class="switch-slider"></span>
                </label>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">完成时播放声音</div>
              </div>
              <div class="setting-control">
                <label class="switch">
                  <input v-model="soundComplete" type="checkbox" />
                  <span class="switch-slider"></span>
                </label>
              </div>
            </div>
          </section>

          <!-- 模型与 Provider -->
          <section
            class="settings-section"
            :class="{ active: active === 'models-providers' }"
            id="models-providers"
          >
            <h2>模型与 Provider</h2>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">默认模型</div>
                <div class="setting-desc">新会话默认使用；会话内切换不会改写这个默认值。</div>
              </div>
              <div class="setting-control">
                <select v-model="defaultModelId" class="control">
                  <option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.name }}</option>
                </select>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">模型目录</div>
                <div class="setting-desc">{{ client.models.value.length }} 个模型 · {{ client.providers.value.length }} 个 Provider</div>
              </div>
              <div class="setting-control settings-button-row">
                <button class="btn" @click="client.refreshAllProviders()">刷新目录</button>
                <button class="btn" @click="emit('open-providers')">管理 Provider</button>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">次级模型</div>
                <div class="setting-desc">Agent / Swarm 子任务优先使用；未设置时继承主模型。只影响新创建的子任务。</div>
              </div>
              <div class="setting-control settings-inline-controls">
                <select v-model="secondaryModelId" class="control">
                  <option value="">继承主模型</option>
                  <option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.name }}</option>
                </select>
                <select v-model="secondaryEffort" class="control compact" :disabled="!secondaryModelId" @change="saveSecondaryEffort">
                  <option value="low">Low</option>
                  <option value="high">High</option>
                  <option value="max">Max</option>
                </select>
              </div>
            </div>
            <div v-if="client.providers.value.length" class="archive-preview">
              <div class="ap-head">已配置 Provider</div>
              <div v-for="provider in client.providers.value" :key="provider.id" class="archive-item">
                <span class="ai-icon"><CodexIcon name="bot" /></span>
                <div class="ai-info">
                  <div class="ai-name">{{ provider.id }}</div>
                  <div class="ai-meta">{{ provider.type }} · {{ provider.models?.length ?? 0 }} 个模型</div>
                </div>
                <span class="pill" :class="{ 'pill-success': provider.status === 'connected' }">{{ provider.status }}</span>
              </div>
            </div>
          </section>

          <!-- Agent 中心 -->
          <section class="settings-section" :class="{ active: active === 'agents' }" id="agents">
            <h2>Agents</h2>
            <div v-if="!nativeAvailable" class="settings-callout">Agent 文件管理仅在桌面应用中可用；浏览器模式仍可使用 daemon 已发现的 Skills。</div>
            <template v-else>
              <div class="setting-row top-aligned">
                <div class="setting-info">
                  <div class="setting-label">SYSTEM.md</div>
                  <div class="setting-desc">覆盖默认主 Agent 的系统提示。空内容会恢复内置提示；通常应保留 <code>${base_prompt}</code>。</div>
                </div>
                <div class="setting-control wide-control">
                  <textarea v-model="systemPrompt" class="settings-textarea" rows="6" placeholder="${base_prompt}" @input="systemPromptDirty = true"></textarea>
                  <button class="btn" :disabled="!systemPromptDirty" @click="saveSystemPrompt">保存 SYSTEM.md</button>
                </div>
              </div>

              <div class="agent-editor-grid">
                <div class="agent-profile-list">
                  <button class="agent-profile add" @click="fillAgent()"><CodexIcon name="plus" /> 新建用户 Agent</button>
                  <button
                    v-for="agent in agents"
                    :key="`${agent.scope}:${agent.path}`"
                    class="agent-profile"
                    :class="{ active: selectedAgent === agent.name }"
                    @click="fillAgent(agent)"
                  >
                    <span><strong>{{ agent.name }}</strong><small>{{ agent.scope }}</small></span>
                    <em>{{ agent.description || '无描述' }}</em>
                  </button>
                  <div v-if="agentsLoading" class="archive-empty">正在发现 Agent…</div>
                </div>
                <div class="agent-form">
                  <label>名称<input v-model="agentForm.name" class="control" placeholder="reviewer" :disabled="Boolean(selectedAgent && agents.find(a => a.name === selectedAgent)?.editable === false)" /></label>
                  <label>描述<input v-model="agentForm.description" class="control" placeholder="严格审查代码并按严重度输出问题" /></label>
                  <label>适用场景<input v-model="agentForm.whenToUse" class="control" placeholder="代码审查、PR 检查" /></label>
                  <div class="agent-form-split">
                    <label>模型偏好<select v-model="agentForm.modelPreference" class="control"><option value="primary">主模型</option><option value="secondary">次级模型</option></select></label>
                    <label>允许工具<input v-model="agentForm.tools" class="control" placeholder="Read, Grep, Glob" /></label>
                  </div>
                  <label>禁用工具<input v-model="agentForm.disallowedTools" class="control" placeholder="Bash" /></label>
                  <label>系统提示<textarea v-model="agentForm.prompt" class="settings-textarea" rows="10"></textarea></label>
                  <div class="settings-button-row">
                    <button class="btn primary" :disabled="Boolean(selectedAgent && agents.find(a => a.name === selectedAgent)?.editable === false)" @click="saveAgent">保存 Agent</button>
                    <button v-if="selectedAgent && agents.find(a => a.name === selectedAgent)?.editable" class="btn danger" @click="deleteAgent">{{ deleteArmed ? '再次点击确认删除' : '删除' }}</button>
                    <span v-if="selectedAgent && agents.find(a => a.name === selectedAgent)?.editable === false" class="pill">只读 · 来自项目或共享目录</span>
                  </div>
                </div>
              </div>
            </template>
          </section>

          <!-- 插件与 Skills -->
          <section class="settings-section" :class="{ active: active === 'plugins-skills' }" id="plugins-skills">
            <h2>插件与 Skills</h2>
            <div class="settings-callout subtle">Skills 是当前会话可直接调用的能力；插件的安装、启停和重载由 Kimi 官方插件管理器完成，变更通常在新会话或重载后生效。</div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">插件管理器</div>
                <div class="setting-desc">在输入框中打开 <code>/plugins</code>，继续选择 list / install / enable / disable / reload。</div>
              </div>
              <div class="setting-control settings-button-row">
                <button class="btn primary" @click="emit('launch-command', '/plugins ')">打开插件管理</button>
                <button class="btn" :disabled="toolsLoading" @click="loadTools">刷新能力</button>
              </div>
            </div>
            <div v-if="skillsBySource.length" class="capability-groups">
              <div v-for="[source, sourceSkills] in skillsBySource" :key="source" class="capability-group">
                <div class="ap-head"><span>{{ source }}</span><span class="pill">{{ sourceSkills.length }}</span></div>
                <div class="capability-grid">
                  <button v-for="skill in sourceSkills" :key="`${source}:${skill.name}`" class="capability-card" @click="emit('launch-command', `/${skill.name} `)">
                    <strong>/{{ skill.name }}</strong><span>{{ skill.description || '无描述' }}</span>
                  </button>
                </div>
              </div>
            </div>
            <div v-else class="archive-empty">当前工作区或会话没有发现可调用 Skill</div>
            <div class="setting-row">
              <div class="setting-info"><div class="setting-label">运行时工具</div><div class="setting-desc">{{ tools.length }} 个工具；MCP 工具会标记来源。</div></div>
              <div class="setting-control"><span class="pill">{{ toolsLoading ? '加载中…' : `${tools.filter(t => t.active !== false).length} 可用` }}</span></div>
            </div>
          </section>

          <!-- MCP -->
          <section class="settings-section" :class="{ active: active === 'mcp' }" id="mcp">
            <h2>MCP 服务</h2>
            <div v-if="!nativeAvailable" class="settings-callout">浏览器模式可以查看 daemon 运行状态；编辑用户或项目 MCP 配置需要桌面应用。</div>
            <div class="setting-row">
              <div class="setting-info"><div class="setting-label">运行状态</div><div class="setting-desc">来自当前 Kimi Engine；配置变更对新会话最稳定。</div></div>
              <div class="setting-control"><button class="btn" :disabled="mcpLoading" @click="loadMcp">{{ mcpLoading ? '加载中…' : '刷新' }}</button></div>
            </div>
            <div v-if="mcpStatus.length" class="archive-preview">
              <div class="ap-head">已加载服务</div>
              <div v-for="server in mcpStatus" :key="server.id" class="archive-item">
                <span class="ai-icon"><CodexIcon name="terminal" /></span>
                <div class="ai-info"><div class="ai-name">{{ server.name }}</div><div class="ai-meta">{{ server.transport }} · {{ server.toolCount }} 个工具<span v-if="server.lastError"> · {{ server.lastError }}</span></div></div>
                <span class="pill" :class="{ 'pill-success': server.status === 'connected' }">{{ server.status }}</span>
                <button class="ai-restore" @click="restartMcp(server.id)">重启</button>
              </div>
            </div>
            <template v-if="nativeAvailable">
              <div class="agent-editor-grid mcp-editor-grid">
                <div class="agent-profile-list">
                  <button class="agent-profile add" @click="editMcp()"><CodexIcon name="plus" /> 新建 MCP</button>
                  <button v-for="entry in mcpConfig" :key="`${entry.scope}:${entry.name}`" class="agent-profile" :class="{ active: mcpForm.originalName === entry.name && mcpForm.scope === entry.scope }" @click="editMcp(entry)">
                    <span><strong>{{ entry.name }}</strong><small>{{ entry.scope }}</small></span>
                    <em>{{ entry.transport }} · {{ entry.enabled ? '启用' : '停用' }}<template v-if="entry.hasSensitiveConfig"> · 含保留的敏感字段</template></em>
                  </button>
                </div>
                <div class="agent-form">
                  <div class="agent-form-split">
                    <label>名称<input v-model="mcpForm.name" class="control" placeholder="github" /></label>
                    <label>作用域<select v-model="mcpForm.scope" class="control"><option value="user">用户</option><option value="project" :disabled="!activeWorkspaceRoot">当前项目</option></select></label>
                  </div>
                  <label>传输方式<select v-model="mcpForm.transport" class="control"><option value="stdio">stdio</option><option value="http">HTTP</option><option value="sse">SSE</option></select></label>
                  <template v-if="mcpForm.transport === 'stdio'">
                    <label>命令<input v-model="mcpForm.command" class="control" placeholder="npx" /></label>
                    <label>参数（每行一个）<textarea v-model="mcpForm.args" class="settings-textarea" rows="5" placeholder="-y&#10;@modelcontextprotocol/server-filesystem"></textarea></label>
                    <div class="settings-callout subtle">项目级 stdio MCP 会执行本机命令；只添加你信任的命令和包。</div>
                  </template>
                  <label v-else>URL<input v-model="mcpForm.url" class="control" placeholder="https://example.com/mcp" /></label>
                  <label class="settings-check"><input v-model="mcpForm.enabled" type="checkbox" /> 启用</label>
                  <div v-if="mcpForm.hasSensitiveConfig" class="settings-callout subtle">env、headers、令牌环境变量等未展示字段会原样保留，不会回显到界面。</div>
                  <div class="settings-button-row">
                    <button class="btn primary" @click="saveMcp">保存 MCP</button>
                    <button v-if="mcpForm.originalName" class="btn danger" @click="deleteCurrentMcp">删除</button>
                  </div>
                </div>
              </div>
            </template>
          </section>

          <!-- 外观 -->
          <section
            class="settings-section"
            :class="{ active: active === 'appearance' }"
            id="appearance"
          >
            <h2>外观</h2>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">主题</div>
              </div>
              <div class="setting-control">
                <div class="seg">
                  <button :class="{ active: themeChoice === 'light' }" @click="pickTheme('light')">
                    浅色
                  </button>
                  <button :class="{ active: themeChoice === 'dark' }" @click="pickTheme('dark')">
                    深色
                  </button>
                  <button :class="{ active: themeChoice === 'system' }" @click="pickTheme('system')">
                    跟随系统
                  </button>
                </div>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">界面字号</div>
                <div class="setting-desc">当前: {{ fontSize }}</div>
              </div>
              <div class="setting-control">
                <div class="seg">
                  <button @click="setFontSize(13)">小</button>
                  <button @click="setFontSize(14)">标准</button>
                  <button @click="setFontSize(16)">大</button>
                </div>
              </div>
            </div>
          </section>

          <!-- 权限 -->
          <section
            class="settings-section"
            :class="{ active: active === 'permissions' }"
            id="permissions"
          >
            <h2>权限</h2>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">当前会话权限</div>
                <div class="setting-desc">{{ permDefault }}</div>
              </div>
              <div class="setting-control">
                <select v-model="permDefault" class="control">
                  <option value="manual">逐条确认</option>
                  <option value="yolo">YOLO · 自动批准工具，仍可提问</option>
                  <option value="auto">自动 · 完全自主，不再提问</option>
                </select>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">网络访问</div>
                <div class="setting-desc">由 daemon 权限模式与工具规则共同控制</div>
              </div>
              <div class="setting-control">
                <span class="pill">跟随权限模式</span>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">模式说明</div>
                <div class="setting-desc">Manual 逐条确认；YOLO 自动批准工具但仍可提问；Auto 不再批准或提问。</div>
              </div>
              <div class="setting-control">
                <span class="pill">跟随当前模式</span>
              </div>
            </div>
            <div class="settings-subhead"><div><strong>细粒度规则</strong><span>按顺序交给 Kimi 匹配；规则为空时沿用权限模式。</span></div><button class="btn" @click="permissionRules.push({ decision: 'ask', scope: '', pattern: '', reason: '' })"><CodexIcon name="plus" /> 添加规则</button></div>
            <div v-if="permissionRules.length" class="rule-list">
              <div v-for="(rule, index) in permissionRules" :key="index" class="rule-row">
                <select v-model="rule.decision" class="control compact"><option value="allow">允许</option><option value="ask">询问</option><option value="deny">拒绝</option></select>
                <input v-model="rule.scope" class="control" placeholder="scope（可选）" />
                <input v-model="rule.pattern" class="control rule-pattern" placeholder="pattern，例如 Bash(git status:*)" />
                <input v-model="rule.reason" class="control" placeholder="原因（可选）" />
                <button class="icon-btn" aria-label="删除规则" @click="permissionRules.splice(index, 1)"><CodexIcon name="trash" /></button>
              </div>
              <div class="settings-button-row"><button class="btn primary" @click="savePermissionRules">保存权限规则</button></div>
            </div>
            <div v-else class="archive-empty">未配置细粒度规则</div>
            <div class="settings-subhead"><div><strong>当前会话工具</strong><span>{{ tools.length }} 个工具；禁用状态由会话配置和规则共同决定。</span></div><button class="btn" @click="loadTools">刷新</button></div>
            <div v-if="tools.length" class="tool-list">
              <div v-for="tool in tools" :key="`${tool.source}:${tool.name}`" class="tool-row">
                <span class="pill">{{ tool.source }}</span><strong>{{ tool.name }}</strong><span>{{ tool.description }}</span><em :class="{ ok: tool.active !== false }">{{ tool.active === false ? '未启用' : '可用' }}</em>
              </div>
            </div>
          </section>

          <!-- Hooks -->
          <section class="settings-section" :class="{ active: active === 'hooks' }" id="hooks">
            <h2>Hooks</h2>
            <div class="settings-callout subtle">Hook 会在匹配事件发生时执行本机命令。保存前请确认命令来源；超时用于防止 Hook 长时间阻塞 Agent。</div>
            <div class="settings-subhead"><div><strong>事件 Hook</strong><span>{{ hooks.length }} 条</span></div><button class="btn" @click="hooks.push({ event: '', matcher: '', command: '', timeout: 30 })"><CodexIcon name="plus" /> 添加 Hook</button></div>
            <div v-if="hooks.length" class="rule-list hook-list">
              <div v-for="(hook, index) in hooks" :key="index" class="rule-row hook-row">
                <input v-model="hook.event" class="control" placeholder="event" />
                <input v-model="hook.matcher" class="control" placeholder="matcher（可选）" />
                <input v-model="hook.command" class="control rule-pattern" placeholder="command" />
                <label class="timeout-field"><input v-model.number="hook.timeout" class="control compact" type="number" min="1" /> 秒</label>
                <button class="icon-btn" aria-label="删除 Hook" @click="hooks.splice(index, 1)"><CodexIcon name="trash" /></button>
              </div>
              <div class="settings-button-row"><button class="btn primary" @click="saveHooks">保存 Hooks</button></div>
            </div>
            <div v-else class="archive-empty">尚未配置 Hook</div>
          </section>

          <!-- 快捷键 -->
          <section
            class="settings-section"
            :class="{ active: active === 'shortcuts' }"
            id="shortcuts"
          >
            <h2>快捷键</h2>
            <div class="setting-row">
              <div class="setting-info"><div class="setting-label">发送消息</div></div>
              <div class="setting-control">
                <div class="shortcut-keys"><span class="kbd">⌘</span><span class="kbd">Enter</span></div>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info"><div class="setting-label">中断当前轮</div></div>
              <div class="setting-control">
                <div class="shortcut-keys"><span class="kbd">Esc</span></div>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info"><div class="setting-label">Review pane</div></div>
              <div class="setting-control">
                <div class="shortcut-keys"><span class="kbd">⌘</span><span class="kbd">B</span></div>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info"><div class="setting-label">Inspect</div></div>
              <div class="setting-control">
                <div class="shortcut-keys"><span class="kbd">⌘</span><span class="kbd">I</span></div>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info"><div class="setting-label">侧边任务</div></div>
              <div class="setting-control">
                <div class="shortcut-keys"><span class="kbd">⌥</span><span class="kbd">⌘</span><span class="kbd">S</span></div>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info"><div class="setting-label">全局唤起</div></div>
              <div class="setting-control">
                <div class="shortcut-keys"><span class="kbd">⌘</span><span class="kbd">⌥</span><span class="kbd">N</span></div>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">审批操作</div>
                <div class="setting-desc">批准 / 本会话 / 拒绝 / 反馈</div>
              </div>
              <div class="setting-control">
                <div class="shortcut-keys">
                  <span class="kbd">Y</span><span class="kbd">A</span><span class="kbd">N</span><span class="kbd">P</span>
                </div>
              </div>
            </div>
          </section>

          <!-- 工作区目录 -->
          <section class="settings-section" :class="{ active: active === 'directories' }" id="directories">
            <h2>工作区目录</h2>
            <div v-if="!activeWorkspaceRoot" class="settings-callout">先选择一个工作区，再为它配置附加目录。</div>
            <div v-else-if="!nativeAvailable" class="settings-callout">附加目录写入项目 <code>.kimi-code/local.toml</code>，仅桌面应用可编辑。</div>
            <template v-else>
              <div class="setting-row">
                <div class="setting-info"><div class="setting-label">当前工作区</div><div class="setting-desc">{{ activeWorkspaceRoot }}</div></div>
                <div class="setting-control"><span class="pill">项目作用域</span></div>
              </div>
              <div class="settings-callout subtle">附加目录扩展 Agent 可访问的上下文边界，并不会把目录移动或复制进项目。请只添加你信任且确实需要的绝对路径。</div>
              <div class="directory-list">
                <div v-for="(_, index) in additionalDirs" :key="index" class="directory-row">
                  <input v-model="additionalDirs[index]" class="control" placeholder="/absolute/path" />
                  <button class="icon-btn" aria-label="移除目录" @click="additionalDirs.splice(index, 1)"><CodexIcon name="trash" /></button>
                </div>
                <div class="settings-button-row">
                  <button class="btn" @click="additionalDirs.push('')"><CodexIcon name="plus" /> 添加目录</button>
                  <button class="btn primary" @click="saveWorkspaceContext">保存工作区目录</button>
                </div>
              </div>
              <div v-if="workspaceContext" class="setting-desc">配置文件：{{ workspaceContext.path }}</div>
            </template>
          </section>

          <!-- 归档管理 -->
          <section class="settings-section" :class="{ active: active === 'archive' }" id="archive">
            <h2>归档、导出与迁移</h2>
            <div class="settings-subhead">
              <div><strong>迁移其他 CLI 数据</strong><span>在当前工作区启动 Kimi 内置导入向导，识别 Claude Code 与 Codex 数据。</span></div>
              <button class="btn" @click="emit('launch-command', '/import-from-cc-codex ')"><CodexIcon name="download" /> 从 Claude / Codex 导入</button>
            </div>
            <div class="settings-callout subtle">导入命令会先返回主界面供你补充路径或选项；不会在打开设置页时自动迁移。</div>

            <div class="settings-subhead">
              <div><strong>设置备份与恢复</strong><span>包含 config、TUI、MCP、SYSTEM.md、自定义 Agents / Skills；不包含登录凭证和会话档案。</span></div>
              <div class="settings-button-row">
                <button class="btn" :disabled="backupBusy || !nativeAvailable" @click="exportSettingsBackup">导出设置备份</button>
                <button class="btn" :disabled="backupBusy || !nativeAvailable" @click="inspectSettingsBackup">检查备份并恢复</button>
              </div>
            </div>
            <div v-if="!nativeAvailable" class="settings-callout">设置备份与恢复需要桌面应用；浏览器模式不会获得本机配置文件权限。</div>
            <div v-if="backupInfo" class="backup-preview">
              <div class="backup-summary">
                <CodexIcon name="shield" />
                <div><strong>{{ backupInfo.files }} 个文件 · {{ formatBackupBytes(backupInfo.bytes) }}</strong><span>{{ backupInfo.path }}</span></div>
                <span class="pill pill-success">预检通过</span>
              </div>
              <details>
                <summary>查看备份清单</summary>
                <code v-for="entry in backupInfo.entries" :key="entry">{{ entry }}</code>
              </details>
              <div v-if="backupInfo.safetySnapshotPath" class="settings-callout subtle">恢复完成。原设置安全快照：<code>{{ backupInfo.safetySnapshotPath }}</code></div>
              <div v-else class="settings-button-row restore-actions">
                <button class="btn" @click="backupInfo = null; restoreArmed = false">取消</button>
                <button class="btn danger" :disabled="backupBusy" @click="restoreSettingsBackup">{{ restoreArmed ? '再次点击确认恢复' : '恢复这个备份' }}</button>
              </div>
            </div>

            <div class="settings-subhead archive-subhead">
              <div><strong>已归档对话</strong><span>{{ archivedSessions.length }} 条，可搜索、选择并批量恢复。</span></div>
              <button class="btn" @click="loadArchive" :disabled="archivedLoading">{{ archivedLoading ? '加载中…' : '刷新' }}</button>
            </div>
            <div class="setting-row">
              <label class="archive-search-field"><CodexIcon name="search" /><input v-model="archiveQuery" class="control" placeholder="搜索标题、会话 ID 或工作区路径" /></label>
              <div class="setting-control settings-button-row">
                <button class="btn" :disabled="!archiveFiltered.length" @click="toggleVisibleArchives">{{ archiveAllVisibleSelected ? '取消全选' : '选择当前结果' }}</button>
                <button class="btn primary" :disabled="!archiveSelectedIds.length" @click="restoreSelectedArchives">恢复所选（{{ archiveSelectedIds.length }}）</button>
              </div>
            </div>

            <div v-if="archivedSessions.length" class="archive-preview">
              <div class="ap-head">归档列表 · {{ archiveFiltered.length }} 条结果</div>
              <div v-for="s in archiveFiltered" :key="s.id" class="archive-item">
                <input type="checkbox" :checked="archiveSelectedIds.includes(s.id)" :aria-label="`选择 ${s.title || s.id}`" @change="toggleArchiveSelection(s.id)" />
                <span class="ai-icon"><CodexIcon name="archive" /></span>
                <div class="ai-info">
                  <div class="ai-name">{{ s.title || s.id }}</div>
                  <div class="ai-meta">归档于 {{ s.updatedAt?.slice(0, 10) ?? '未知' }}<template v-if="s.cwd"> · {{ s.cwd }}</template></div>
                </div>
                <button class="ai-restore" @click="onRestore(s.id)">恢复</button>
              </div>
              <div v-if="!archiveFiltered.length" class="archive-empty">没有匹配的归档对话</div>
            </div>
            <div v-else-if="!archivedLoading" class="archive-empty">暂无归档对话</div>
          </section>

          <!-- Kimi Engine -->
          <section class="settings-section" :class="{ active: active === 'engine' }" id="engine">
            <h2>Kimi Engine</h2>
            <div v-if="!nativeAvailable" class="settings-callout">Engine 维护仅在桌面应用中可用。</div>
            <template v-else>
              <div class="setting-row">
                <div class="setting-info"><div class="setting-label">CLI</div><div class="setting-desc">{{ engine?.cliPath ?? '未找到' }}</div></div>
                <div class="setting-control"><span class="pill" :class="{ 'pill-success': engine?.installed }">{{ engine?.version ?? '未安装' }}</span></div>
              </div>
              <div class="setting-row">
                <div class="setting-info"><div class="setting-label">Daemon</div><div class="setting-desc">API {{ client.serverVersion.value || '—' }} · backend {{ client.backend.value || '—' }}</div></div>
                <div class="setting-control settings-button-row">
                  <span>{{ client.connection.value === 'connected' ? '已连接' : '未连接' }}</span>
                  <button
                    class="btn"
                    :disabled="Boolean(maintenanceBusy) || !engine?.installed || (engineVersionRelation !== null && engineVersionRelation < 0)"
                    @click="restartConfirmOpen = true"
                  >{{ maintenanceBusy === 'restart' ? '重启中…' : `使用 CLI ${engine?.version ?? ''} 重启` }}</button>
                </div>
              </div>
              <div v-if="engineVersionRelation !== null && engineVersionRelation > 0" class="settings-callout">
                已安装 CLI {{ engine?.version }}，但当前 daemon 仍是 {{ client.serverVersion.value }}。重启后即可使用新版 daemon 功能。
              </div>
              <div v-else-if="engineVersionRelation !== null && engineVersionRelation < 0" class="settings-callout">
                当前 daemon {{ client.serverVersion.value }} 比本机 CLI {{ engine?.version }} 新。请先更新 CLI，避免重启后降级。
              </div>
              <div class="setting-row top-aligned">
                <div class="setting-info"><div class="setting-label">诊断与维护</div><div class="setting-desc">Doctor 只检查配置；迁移与更新仅在你点击后执行。</div></div>
                <div class="setting-control settings-button-row">
                  <button class="btn" :disabled="Boolean(maintenanceBusy)" @click="runMaintenance('doctor-config')">检查 config</button>
                  <button class="btn" :disabled="Boolean(maintenanceBusy)" @click="runMaintenance('doctor-tui')">检查 TUI</button>
                  <button class="btn" :disabled="Boolean(maintenanceBusy)" @click="runMaintenance('migrate')">迁移旧 Kimi</button>
                  <button class="btn" :disabled="Boolean(maintenanceBusy)" @click="runMaintenance('update')">{{ maintenanceBusy === 'update' ? '更新中…' : '更新 Kimi CLI' }}</button>
                  <button class="btn" :disabled="Boolean(maintenanceBusy) || !client.activeSessionId.value" @click="runMaintenance('visualizer')">打开 Visualizer</button>
                </div>
              </div>
              <pre v-if="maintenanceOutput" class="maintenance-output">{{ maintenanceOutput }}</pre>
              <div class="settings-callout subtle">次级模型实验开关会在 GUI 自己启动 Kimi Engine 时启用；若复用了外部 daemon，请用相同环境变量启动后再使用次级模型。</div>
            </template>
          </section>

          <!-- 关于 -->
          <section class="settings-section" :class="{ active: active === 'about' }" id="about">
            <h2>关于</h2>
            <div class="setting-row">
              <div class="setting-info"><div class="setting-label">版本</div></div>
              <div class="setting-control"><span>Kimi Code v{{ appVersion }}</span></div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">更新</div>
                <div class="setting-desc">有新版本时查看功能描述并下载安装</div>
              </div>
              <div class="setting-control">
                <button class="btn" :disabled="checking" @click="onCheckUpdate">
                  {{ checking ? '检查中…' : '检查更新' }}
                </button>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">退出</div>
                <div class="setting-desc">关闭主窗口并退出应用(daemon 保持后台运行)</div>
              </div>
              <div class="setting-control">
                <button class="btn" @click="onQuitApp">退出应用</button>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info"><div class="setting-label">Daemon</div></div>
              <div class="setting-control">
                <span>{{ client.connection.value === 'connected' ? '已连接' : '未连接' }}</span>
                <span v-if="client.serverVersion.value" class="pill">{{ client.serverVersion.value }}</span>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">模型引擎</div>
              </div>
              <div class="setting-control">
                <span>{{ client.backend.value ?? '—' }}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
    <PromptDialog
      v-if="restartConfirmOpen"
      title="重启 Kimi daemon？"
      :description="restartDescription"
      :confirm-label="`使用 CLI ${engine?.version ?? ''} 重启`"
      :danger="client.working.value"
      :input="false"
      @confirm="restartDaemon"
      @cancel="restartConfirmOpen = false"
    />
  </div>
</template>
