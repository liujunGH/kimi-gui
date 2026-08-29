<script setup lang="ts">
/**
 * SettingsPage —— 按作用域分组的设置中心。
 *
 * 轮次 4e:接通 client 配置(权限/模型/字号/通知/归档)
 * 替代原型期的本地 ref 占位。
 */
import { computed, nextTick, reactive, ref, watch } from 'vue';
import type { PermissionMode, WorkspaceView } from '../../../types';
import type { AppSession, AppConfig, AppMcpServer, AppToolDescriptor } from '../../../api/types';
import { getKimiWebApi } from '../../../api';
import { setEphemeralCredential } from '../../../api/daemon/serverAuth';
import CodexIcon from '../layout/CodexIcon.vue';
import PromptDialog from '../layout/PromptDialog.vue';
import TaskCenter from './TaskCenter.vue';
import PerformanceSettings from './PerformanceSettings.vue';
import CapabilitiesSettings from './CapabilitiesSettings.vue';
import { useTheme } from '../../../composables/codex/useTheme';
import { useKimiClient } from '../../../composables/codex/useKimiClient';
import { useUpdater } from '../../../composables/codex/useUpdater';
import { useToast } from '../layout/Toast.vue';
import { formatLocalDate } from '../../../lib/formatMessageTime';
import {
  kimiNativeAvailable,
  kimiRuntime,
  type KimiAgentProfile,
  type KimiEngineStatus,
  type KimiBackupInfo,
  type KimiMcpConfigEntry,
  type OrphanSessionScanResult,
  type KimiWorkspaceContext,
} from '../../../composables/useKimiRuntime';

type SettingsSectionId =
  | 'general'
  | 'appearance'
  | 'models-providers'
  | 'agents'
  | 'plugins-skills'
  | 'capabilities'
  | 'mcp'
  | 'permissions'
  | 'hooks'
  | 'directories'
  | 'tasks'
  | 'performance'
  | 'shortcuts'
  | 'archive'
  | 'engine'
  | 'about';

const props = withDefaults(defineProps<{ initialSection?: SettingsSectionId }>(), {
  initialSection: 'general',
});
const emit = defineEmits<{
  (e: 'open-providers'): void;
  (e: 'open-plugin-manager'): void;
  (e: 'launch-command', command: string): void;
  (e: 'open-session', id: string): void;
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
    { id: 'capabilities', label: 'Capabilities', icon: 'sparkle' },
    { id: 'mcp', label: 'MCP 服务', icon: 'terminal' },
  ] },
  { label: '安全与控制', items: [
    { id: 'permissions', label: '权限与工具', icon: 'shield' },
    { id: 'hooks', label: 'Hooks', icon: 'git-branch' },
  ] },
  { label: '数据与系统', items: [
    { id: 'tasks', label: '任务中心', icon: 'check-circle' },
    { id: 'directories', label: '工作区目录', icon: 'file' },
    { id: 'archive', label: '归档与导入', icon: 'archive' },
    { id: 'performance', label: '运行与性能', icon: 'sliders' },
    { id: 'engine', label: 'Kimi Engine', icon: 'terminal' },
    { id: 'about', label: '关于', icon: 'info' },
  ] },
];

const active = ref<SettingsSectionId>(props.initialSection);
/** TaskCenter is mounted eagerly with the page but only drains /sessions when
 *  its section becomes active (opening Settings must not drain the endpoint). */
const taskCenterRef = ref<InstanceType<typeof TaskCenter> | null>(null);

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
    provider: m.provider,
  })),
);
const defaultModelId = computed<string>({
  get: () => (client.config.value as AppConfig | null)?.defaultModel ?? client.defaultModel.value ?? '',
  set: (v) => void client.updateConfig({ defaultModel: v }),
});
const defaultThinkingEnabled = computed<boolean>({
  get: () => {
    const thinking = (client.config.value as AppConfig | null)?.thinking;
    return !thinking || thinking.enabled !== false;
  },
  set: (enabled) => {
    const existing = (client.config.value as AppConfig | null)?.thinking ?? {};
    void client.updateConfig({ thinking: { ...existing, enabled } });
  },
});
const defaultPlanMode = computed<boolean>({
  get: () => (client.config.value as AppConfig | null)?.defaultPlanMode === true,
  set: (enabled) => void client.updateConfig({ defaultPlanMode: enabled }),
});
// Effort 词表 = 'off' | 'on' | 模型 support_efforts 声明档位;'on' = 模型默认
// 档,'' = 未设置(保持官方默认解析链)。不再兜底 'low' —— 那会在未设置时
// 冒充一个具体档位。
const secondaryEffort = ref(
  (client.config.value as AppConfig | null)?.secondaryModel?.defaultEffort ?? '',
);
// Effort is a local ref (select state); keep it in sync whenever the daemon
// config changes elsewhere (updateConfig responses, WS configChanged, backup
// restore) — otherwise the select keeps showing a stale value forever.
watch(
  () => (client.config.value as AppConfig | null)?.secondaryModel?.defaultEffort,
  (value) => {
    secondaryEffort.value = value ?? '';
  },
);
/** 仅用户显式改过 effort(select @change)才允许写点夹带 default_effort;
 *  表单同步 / 初始化不算 —— 未触碰时保持官方默认解析链,不把回显值写回 config。 */
const effortTouched = ref(false);
const secondaryModelExperimentEnabled = computed(
  () => client.experimentalFlags.value['secondary-model'] === true,
);
const enabledExperimentNames = computed(() =>
  Object.entries(client.experimentalFlags.value)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .sort(),
);
const experimentSaving = ref('');
const EXPERIMENT_COPY: Record<string, { label: string; description: string }> = {
  'tool-select': {
    label: '按需加载工具',
    description: '支持的模型只在需要时加载 MCP 工具 schema，可改善 prompt cache 与长会话性能。',
  },
  'secondary-model': {
    label: '次级模型路由',
    description: '允许 Agent / Swarm 把子任务路由到次级模型；GUI 启动的 Engine 会自动启用。',
  },
};
const experimentRows = computed(() => {
  const configured = (client.config.value as AppConfig | null)?.experimental ?? {};
  const runtime = client.experimentalFlags.value;
  // 不再播种 micro_compaction：它是 v1 引擎遗留 flag，agent-core-v2 不存在，
  // 显示出来即误导。仅当旧 config/运行时真的报告它时才作为未知项出现。
  const ids = new Set(['tool-select', ...Object.keys(configured), ...Object.keys(runtime)]);
  return [...ids].sort().map((id) => ({
    id,
    label: EXPERIMENT_COPY[id]?.label ?? id,
    description: EXPERIMENT_COPY[id]?.description ?? '由当前 Kimi Engine 报告的实验能力。',
    enabled: runtime[id] ?? configured[id] ?? false,
    configured: configured[id],
    locked: id !== 'tool-select',
  }));
});
async function setExperiment(id: string, enabled: boolean): Promise<void> {
  if (id === 'secondary-model') return;
  experimentSaving.value = id;
  try {
    const current = (client.config.value as AppConfig | null)?.experimental ?? {};
    await client.updateConfig({ experimental: { ...current, [id]: enabled } });
    toast(`${EXPERIMENT_COPY[id]?.label ?? id}已${enabled ? '启用' : '停用'}；新会话会使用该设置`);
  } catch (error) {
    toast(error instanceof Error ? error.message : '实验功能保存失败');
  } finally {
    experimentSaving.value = '';
  }
}

// Engine env experiments (Kimi Code 0.39+): env-gated (tower / remote-control).
// The env vars have the HIGHEST precedence and only the GUI controls their
// injection, so they live outside `experimentRows` above. config.toml
// [experimental] can also enable them — but that path needs a daemon restart
// and is not runtime-reportable the same way.
const ENGINE_ENV_EXPERIMENTS = [
  { id: 'tower', env: 'KIMI_CODE_EXPERIMENTAL_TOWER', label: 'Tower 多智能体编排', description: '实验性 tower 模式；开启并重启 Engine 后，在会话中用 /tower 命令进入（/tower on 开启、/tower <目标> 启动编排）。' },
  { id: 'remote_control', env: 'KIMI_CODE_EXPERIMENTAL_REMOTE_CONTROL', label: '远程访问会话', description: 'Remote Control：通过浏览器远程访问本地会话（/remote-control，别名 /rc）。' },
] as const;
const engineEnvEnabled = ref<string[]>([]);
const engineEnvSaving = ref(false);
const engineEnvDirty = ref(false);
/** Snapshot of the env set as last LOADED from the shell — the baseline for
 *  deciding whether the dirty banner still applies after a save. */
const initialEngineEnv = ref<string[]>([]);
const engineEnvExperiments = computed(() =>
  ENGINE_ENV_EXPERIMENTS.map((feature) => ({ ...feature, enabled: engineEnvEnabled.value.includes(feature.id) })),
);
async function loadEngineEnvExperiments(): Promise<void> {
  if (!nativeAvailable) return;
  try {
    engineEnvEnabled.value = await kimiRuntime.experimentalEnv();
  } catch {
    engineEnvEnabled.value = [];
  }
  initialEngineEnv.value = [...engineEnvEnabled.value].sort();
}
async function setEngineEnvExperiment(id: string, enabled: boolean): Promise<void> {
  engineEnvSaving.value = true;
  try {
    const next = enabled
      ? [...new Set([...engineEnvEnabled.value, id])]
      : engineEnvEnabled.value.filter((item) => item !== id);
    await kimiRuntime.setExperimentalEnv(next);
    engineEnvEnabled.value = next;
    // Toggling an experiment back to its loaded state needs no restart —
    // drop the banner instead of latching it forever.
    engineEnvDirty.value = [...next].sort().join('\n') !== initialEngineEnv.value.join('\n');
    toast(`${ENGINE_ENV_EXPERIMENTS.find((feature) => feature.id === id)?.label ?? id}已${enabled ? '开启' : '关闭'}${engineEnvDirty.value ? '，重启 Engine 后生效' : ''}`);
  } catch (error) {
    toast(error instanceof Error ? error.message : '环境实验保存失败');
  } finally {
    engineEnvSaving.value = false;
  }
}
const secondaryModelId = computed<string>({
  // Official read priority (0.39.1 resolveSubagentModelPool): models pool >
  // default_model > legacy `model` —— 并存时 default_model 压制 model。
  // 池模式下 defaultModel 即池默认,select 显示它但被置灰(池归下方编辑器管)。
  get: () =>
    (client.config.value as AppConfig | null)?.secondaryModel?.defaultModel
    ?? (client.config.value as AppConfig | null)?.secondaryModel?.model
    ?? '',
  set: (model) => {
    // 单模型一律写 default_model 键(不再写 legacy model 键:REST deepMerge
    // 删不掉旧值,但它被优先级压制,无害)。effort 仅在用户显式选过且非空时
    // 随行写入;force 对单模型仍有效,原样保留。
    const current = (client.config.value as AppConfig | null)?.secondaryModel ?? {};
    void client.updateConfig({
      secondaryModel: model
        ? {
            defaultModel: model,
            force: current.force,
            ...(effortTouched.value && secondaryEffort.value
              ? { defaultEffort: secondaryEffort.value }
              : {}),
          }
        : { defaultModel: current.defaultModel },
    });
  },
});
/** Effort select 词表:'off'/'on' + 当前绑定模型(secondaryModelId 对应
 *  AppModel)support_efforts 声明的档位;模型未声明/目录未加载时兜底
 *  low/high/max。词表跟模型走,不写死。 */
const SECONDARY_EFFORT_FALLBACK = ['low', 'high', 'max'] as const;
const secondaryEffortOptions = computed<readonly string[]>(() => {
  const modelId = secondaryModelId.value;
  const model = modelId
    ? (client.models.value ?? []).find((m) => m.id === modelId || m.model === modelId)
    : undefined;
  const efforts = model?.supportEfforts?.length ? model.supportEfforts : SECONDARY_EFFORT_FALLBACK;
  return ['off', 'on', ...efforts].filter((value, index, all) => all.indexOf(value) === index);
});
/** config 存量值不在词表内(旧值 / 未知档位)时动态补一个回显 option,防
 *  select 显示空白;用户改选后即回到词表。 */
const secondaryEffortSelectOptions = computed<readonly string[]>(() => {
  const value = secondaryEffort.value;
  return value && !secondaryEffortOptions.value.includes(value)
    ? [...secondaryEffortOptions.value, value]
    : secondaryEffortOptions.value;
});
function secondaryEffortLabel(option: string): string {
  if (option === 'off') return '关闭';
  if (option === 'on') return '自动（模型默认）';
  return option.charAt(0).toUpperCase() + option.slice(1);
}
function onSecondaryEffortChange(): void {
  effortTouched.value = true;
  saveSecondaryEffort();
}
function saveSecondaryEffort(): void {
  // Effort is mode-independent (default_effort applies to pools too); merge
  // into the current section so whichever mode is active survives untouched.
  // 此处是用户显式选择,保持显式写(effortTouched 门控只约束其它写点)。
  const current = (client.config.value as AppConfig | null)?.secondaryModel ?? {};
  void client.updateConfig({
    secondaryModel: { ...current, defaultEffort: secondaryEffort.value || undefined },
  });
}

// Kimi Code 0.36+ secondary-model details — OFFICIAL semantics (verified
// against agent-core-v2 buildSubagentModelDescriptions/assertValidSubagent-
// ModelPool at 0.39.1):
// - `models` = MODEL ID → ROUTING DESCRIPTION. The key must resolve in the
//   model catalog (it is what the main agent passes to the Agent tool's
//   `model` parameter); the value is rendered into the Agent tool description
//   the main agent reads when picking a model per spawn.
// - `default_model` = the default MODEL ID (must be a key of models when the
//   pool table exists; marked [default] for the agent, [main model] is added
//   automatically when it equals the caller's model).
// - single-model mode: legacy `model` key (+ optional `force`).
// - `force` is mutually exclusive with `models` (the pool exists to give the
//   main agent a choice; force removes it).
const secondaryPool = ref<Array<{ model: string; description: string }>>([]);
const secondaryPoolDefault = ref('');
const secondaryPoolSaving = ref(false);
const secondaryForce = computed(
  () => (client.config.value as AppConfig | null)?.secondaryModel?.force === true,
);
/** Pool mode is active in the daemon config (models table present). While it
 *  is, the single-model select is intentionally inert: writing it would drop
 *  the pool (see secondaryModelId's setter). */
const secondaryPoolConfigured = computed(() => {
  const models = (client.config.value as AppConfig | null)?.secondaryModel?.models;
  return models !== undefined && Object.keys(models).length > 0;
});
/** Routing summary shown above the pool editor — what the daemon will
 *  actually do with the current config (mirrors the official description
 *  markers the main agent sees). */
const secondaryRoutingSummary = computed(() => {
  const section = (client.config.value as AppConfig | null)?.secondaryModel;
  const models = section?.models ?? {};
  const entries = Object.entries(models);
  if (section?.force) {
    return `强制路由：所有子任务一律走次级模型，主 Agent 不再挑选。`;
  }
  if (entries.length === 0) {
    // 与 secondaryModelId getter 同序:defaultModel 压制 legacy model。
    const single = section?.defaultModel ?? section?.model;
    return single
      ? `单模型路由：子任务默认走 ${single}，主 Agent 无可选池。`
      : '未配置次级模型：子任务继承主模型。';
  }
  const defaultId = section?.defaultModel;
  const described = entries.filter(([, d]) => d && d.trim().length > 0).length;
  return `池路由：主 Agent 派发子任务时从 ${entries.length} 个模型里挑选（${described} 个带路由描述）${defaultId ? `，默认 ${defaultId}` : ''}；另有 primary（主模型自身）始终可选。`;
});
function syncSecondaryPoolFromConfig(modelsOverride?: Record<string, string>): void {
  const section = (client.config.value as AppConfig | null)?.secondaryModel;
  const models = modelsOverride ?? section?.models ?? {};
  secondaryPool.value = Object.entries(models).map(([model, description]) => ({ model, description }));
  secondaryPoolDefault.value = section?.defaultModel ?? '';
}
// Watch the pool VALUE (stringified), not the section reference: effort /
// force writes replace the whole config object and would otherwise reset
// in-progress, unsaved pool edits.
watch(() => JSON.stringify((client.config.value as AppConfig | null)?.secondaryModel?.models ?? {}), () => syncSecondaryPoolFromConfig(), { immediate: true });
async function saveSecondaryPool(): Promise<void> {
  const models: Record<string, string> = {};
  for (const entry of secondaryPool.value) {
    if (!entry.model) continue;
    if (models[entry.model]) {
      toast(`模型 ${entry.model} 在池中重复，请删除重复行`);
      return;
    }
    // Empty descriptions are legal — the agent then only sees the model id.
    models[entry.model] = entry.description.trim();
  }
  const hasPool = Object.keys(models).length > 0;
  if (hasPool && !secondaryPoolDefault.value) {
    toast('请在池中选择一个默认模型（子任务派发未指定时的兜底）');
    return;
  }
  if (hasPool && !models[secondaryPoolDefault.value]) {
    toast('默认模型必须在池内，请先勾选一个池成员为默认');
    return;
  }
  secondaryPoolSaving.value = true;
  try {
    if (!hasPool) {
      // 官方 POST /config 是 deepMerge:`models:{}` 删不掉池表(REST 无
      // replace 语义)。清池必须走 shell 直接重写 config.toml。
      try {
        await kimiRuntime.clearSecondaryModelPool();
        toast('模型池已清除（已切回单模型）');
        await refreshConfigAfterPoolClear();
      } catch (error) {
        // 非 Tauri 环境该 invoke 直接抛错 → 引导手动编辑;桌面端的真实
        // 失败原因原样透出。
        toast(
          nativeAvailable && error instanceof Error && error.message
            ? error.message
            : '清空模型池需要桌面应用（浏览器模式请手动编辑 config.toml）',
        );
      }
      return;
    }
    const ok = await client.updateConfig({
      secondaryModel: {
        models,
        defaultModel: secondaryPoolDefault.value,
        // force 与 models 互斥,且并存会导致会话创建失败(官方文档明言)
        // —— deepMerge 会保留旧键,必须显式写 false 压掉存活的旧 force。
        force: false,
        ...(effortTouched.value && secondaryEffort.value
          ? { defaultEffort: secondaryEffort.value }
          : {}),
      },
    });
    toast(ok ? '模型池已保存；描述会作为主 Agent 的路由提示' : '模型池保存失败');
  } finally {
    secondaryPoolSaving.value = false;
  }
}
/** 清池命令在 shell 侧重写了 config.toml:重新拉取全局配置,让表单与所有
 *  读 client.config 的 getter 回到清后的状态。探测模式与 refreshConfigAfterRestore
 *  一致:优先 client.loadConfig(未来版本暴露即自动生效),fallback 直接
 *  GET /config 后手动同步表单。 */
async function refreshConfigAfterPoolClear(): Promise<void> {
  const loader = (client as unknown as { loadConfig?: () => Promise<void> }).loadConfig;
  if (typeof loader === 'function') {
    await loader.call(client);
    return;
  }
  try {
    const fresh = await getKimiWebApi().getConfig();
    secondaryEffort.value = fresh.secondaryModel?.defaultEffort ?? '';
    syncSecondaryPoolFromConfig(fresh.secondaryModel?.models);
  } catch {
    // Daemon may not expose /config yet; the next Engine restart refreshes it.
  }
}
async function setSecondaryForce(force: boolean): Promise<void> {
  // Guard against the PERSISTED pool (secondaryPoolConfigured), not unsaved
  // editor drafts: unsaved entries are not a config yet and must not block
  // the toggle.
  if (force && secondaryPoolConfigured.value) {
    toast('强制路由与模型池互斥：请先清空并保存模型池，再开启强制路由');
    return;
  }
  const current = (client.config.value as AppConfig | null)?.secondaryModel ?? {};
  // 单模型一律写 default_model 键(与读优先级同序:defaultModel 压制
  // legacy model;官方 force 本就要求 default_model)。
  const single = current.defaultModel ?? current.model;
  if (force && !single) {
    // Official rule: default_model is required when force is set.
    toast('开启强制路由前请先选择默认模型');
    return;
  }
  const ok = await client.updateConfig({
    secondaryModel: { defaultModel: single, defaultEffort: current.defaultEffort, force },
  });
  if (!ok) toast('强制路由保存失败');
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
  extraAgentDirs.value = ((client.config.value as AppConfig | null)?.extraAgentDirs ?? []).join(', ');
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
const skillCount = computed(() => client.skills.value.length);
const toolCounts = computed(() => ({
  builtin: tools.value.filter((tool) => tool.source === 'builtin').length,
  skill: tools.value.filter((tool) => tool.source === 'skill').length,
  mcp: tools.value.filter((tool) => tool.source === 'mcp').length,
  active: tools.value.filter((tool) => tool.active !== false).length,
}));

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
const HOOK_EVENT_TYPES = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'PermissionResult',
  'UserPromptSubmit',
  'UserPromptQueued',
  'TurnStarted',
  'Stop',
  'StopFailure',
  'Interrupt',
  'SessionStart',
  'SessionEnd',
  'SessionHeartbeat',
  'SubagentStart',
  'SubagentStop',
  'TaskStarted',
  'PreCompact',
  'PostCompact',
  'Notification',
] as const;
const permissionRules = ref<PermissionRule[]>([]);
const hooks = ref<HookRule[]>([]);
// Kimi Code 0.34+ global tool gating (`[tools]`, protocol 0.5.0) — comma-
// separated tool-name lists, edited as plain text and persisted via updateConfig.
const toolGatingEnabled = ref('');
const toolGatingDisabled = ref('');
const toolGatingSaving = ref(false);
/** Global config must be loaded before gating can be saved — writing tools
 *  with a null config base would silently clobber the daemon-side merge. */
const controlConfigReady = computed(() => (client.config.value as AppConfig | null) !== null);
function splitToolList(value: string): string[] {
  // Accept the full-width comma too — it is easy to type on a CNY keyboard.
  return value.replace(/，/g, ',').split(',').map((item) => item.trim()).filter(Boolean);
}

// Kimi Code 0.34+ extra_agent_dirs: scan Markdown agent files from additional
// absolute directories.
const extraAgentDirs = ref('');
const extraAgentDirsSaving = ref(false);
async function saveExtraAgentDirs(): Promise<void> {
  extraAgentDirsSaving.value = true;
  try {
    const dirs = splitToolList(extraAgentDirs.value);
    const ok = await client.updateConfig({ extraAgentDirs: dirs });
    toast(ok ? `自定义 Agent 目录已保存（${dirs.length} 个）` : '自定义 Agent 目录保存失败');
  } finally {
    extraAgentDirsSaving.value = false;
  }
}
async function saveToolGating(): Promise<void> {
  if (!controlConfigReady.value) {
    toast('尚未取得全局配置，无法保存工具门控；请稍后重试');
    return;
  }
  toolGatingSaving.value = true;
  try {
    const enabled = splitToolList(toolGatingEnabled.value);
    const disabled = splitToolList(toolGatingDisabled.value);
    // 捕获旧值要在写之前：updateConfig 的回包会立刻替换 client.config。
    const previous = (client.config.value as AppConfig | null)?.tools;
    const hadGating =
      (previous?.enabled?.length ?? 0) > 0 || (previous?.disabled?.length ?? 0) > 0;
    // 官方 POST /config 是 deepMerge：空数组会整体替换（= 官方 evaluate 的
    // 「不限制」），所以清空列表必须显式发 []，不能省略键 —— 省略会保留旧值。
    const ok = await client.updateConfig({
      tools: { enabled, disabled },
    });
    const cleared = enabled.length === 0 && disabled.length === 0 && hadGating;
    toast(!ok ? '工具门控保存失败' : cleared ? '工具门控已清除（不再限制）；新会话生效' : '工具门控已保存；新会话生效');
  } finally {
    toolGatingSaving.value = false;
  }
}
function loadControlConfig(configOverride?: AppConfig): void {
  const config = configOverride ?? (client.config.value as AppConfig | null);
  toolGatingEnabled.value = (config?.tools?.enabled ?? []).join(', ');
  toolGatingDisabled.value = (config?.tools?.disabled ?? []).join(', ');
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
  const ok = await client.updateConfig({ permission: { rules } });
  toast(ok ? '权限规则已保存' : '权限规则保存失败');
}
async function saveHooks(): Promise<void> {
  const value = hooks.value
    .filter((hook) => hook.event.trim() && hook.command.trim())
    .map((hook) => ({ event: hook.event.trim(), ...(hook.matcher.trim() ? { matcher: hook.matcher.trim() } : {}), command: hook.command.trim(), timeout: Math.min(600, Math.max(1, Number(hook.timeout) || 30)) }));
  const ok = await client.updateConfig({ hooks: value });
  toast(ok ? 'Hooks 已保存；后续事件将使用新配置' : 'Hooks 保存失败');
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
const restartReason = ref<'manual' | 'restore'>('manual');

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
  const restoreReason = restartReason.value === 'restore'
    ? '当前 Kimi Engine 恢复归档任务后，需要重新启动才能可靠地继续对话。'
    : '';
  return `${restoreReason}${runningWarning} GUI 会在新 daemon 就绪后自动重连。`;
});

function requestDaemonRestart(reason: 'manual' | 'restore'): void {
  restartReason.value = reason;
  restartConfirmOpen.value = true;
}

async function loadEngine(): Promise<void> {
  if (!nativeAvailable) return;
  try { engine.value = await kimiRuntime.engineStatus(); } catch { engine.value = null; }
  void loadEngineEnvExperiments();
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
async function migrate033Config(): Promise<void> {
  maintenanceBusy.value = 'migrate-033';
  maintenanceOutput.value = '';
  try {
    const result = await kimiRuntime.migrate033Config();
    maintenanceOutput.value = result.changed
      ? `已迁移 ${result.renamedKeys.join('、')}\n备份：${result.backupPath ?? '未生成'}`
      : '未发现需要迁移的 0.33 配置键';
    toast(result.changed ? 'Kimi 0.33 配置已迁移' : '配置无需迁移');
  } catch (error) {
    maintenanceOutput.value = error instanceof Error ? error.message : String(error);
    toast('Kimi 0.33 配置迁移失败');
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
const archiveDeleteIds = ref<string[]>([]);
const archiveDeleting = ref(false);
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
/** 恢复备份后的一站式提示：环境实验文件已随备份恢复，需重启 Engine。 */
const restoreNotice = ref('');
const orphanScan = ref<OrphanSessionScanResult | null>(null);
const orphanDetecting = ref(false);
const orphanCleaning = ref(false);
const orphanCleanupProgress = ref('');
const orphanConfirmMode = ref<'delete' | 'backup' | null>(null);
const emptyWorkspaceScan = ref<WorkspaceView[]>([]);
const emptyWorkspaceCleaning = ref(false);
const emptyWorkspaceConfirmOpen = ref(false);
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
async function detectOrphanSessions(): Promise<void> {
  if (!nativeAvailable || orphanDetecting.value || orphanCleaning.value) return;
  orphanDetecting.value = true;
  try {
    orphanScan.value = await kimiRuntime.detectOrphanSessions();
    emptyWorkspaceScan.value = client.workspacesView.value.filter(
      (workspace) => workspace.sessionCount === 0,
    );
    const parts = [];
    if (orphanScan.value.items.length) parts.push(`${orphanScan.value.items.length} 个失效任务`);
    if (emptyWorkspaceScan.value.length) parts.push(`${emptyWorkspaceScan.value.length} 个空工作区`);
    toast(parts.length ? `发现 ${parts.join('、')}` : '未发现需要清理的数据');
  } catch (error) {
    orphanScan.value = null;
    emptyWorkspaceScan.value = [];
    toast(error instanceof Error ? error.message : '检测失效任务失败');
  } finally {
    orphanDetecting.value = false;
  }
}
async function removeDetectedEmptyWorkspaces(): Promise<void> {
  const items = [...emptyWorkspaceScan.value];
  emptyWorkspaceConfirmOpen.value = false;
  if (!items.length || emptyWorkspaceCleaning.value) return;
  emptyWorkspaceCleaning.value = true;
  try {
    for (const workspace of items) await client.deleteWorkspace(workspace.id);
    emptyWorkspaceScan.value = [];
    toast(`已移除 ${items.length} 个空工作区；目录和会话数据均未删除`);
  } finally {
    emptyWorkspaceCleaning.value = false;
  }
}
function requestOrphanCleanup(mode: 'delete' | 'backup'): void {
  if (!orphanScan.value?.items.length || orphanCleaning.value) return;
  orphanConfirmMode.value = mode;
}
async function cleanupDetectedOrphans(): Promise<void> {
  const mode = orphanConfirmMode.value;
  const items = [...(orphanScan.value?.items ?? [])];
  orphanConfirmMode.value = null;
  if (!mode || !items.length) return;
  orphanCleaning.value = true;
  const failed = [];
  let cleaned = 0;
  for (const [index, item] of items.entries()) {
    orphanCleanupProgress.value = `正在处理 ${index + 1}/${items.length}`;
    const result = await client.cleanupOrphanSession(item.sessionId, mode === 'backup');
    if (result) cleaned += 1;
    else failed.push(item);
  }
  const failedIds = new Set(failed.map((item) => item.sessionId));
  orphanScan.value = {
    items: failed,
    totalBytes: failed.reduce((sum, item) => sum + item.bytes, 0),
  };
  orphanCleanupProgress.value = '';
  orphanCleaning.value = false;
  toast(
    `已清理 ${cleaned} 个失效任务${failedIds.size ? `，${failedIds.size} 个失败` : ''}`,
  );
}
/** 恢复归档会话(返回成功则移出列表) */
async function onRestore(id: string) {
  const ok = await client.restoreSession(id);
  if (ok) {
    archivedSessions.value = archivedSessions.value.filter((s) => s.id !== id);
    archiveSelectedIds.value = archiveSelectedIds.value.filter((value) => value !== id);
    if (nativeAvailable) requestDaemonRestart('restore');
    else toast('任务已恢复；请重启 Kimi Engine 后再继续对话');
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
  if (restored.size) {
    if (nativeAvailable) requestDaemonRestart('restore');
    else toast('继续已恢复的对话前，请先重启 Kimi Engine');
  }
}
function requestDeleteArchived(ids: string[]): void {
  archiveDeleteIds.value = [...new Set(ids.filter(Boolean))];
}
async function deleteSelectedArchives(): Promise<void> {
  const ids = [...archiveDeleteIds.value];
  archiveDeleteIds.value = [];
  if (!nativeAvailable || !ids.length || archiveDeleting.value) return;
  archiveDeleting.value = true;
  const deleted = new Set<string>();
  for (const id of ids) {
    try {
      await kimiRuntime.deleteArchivedSession(id);
      deleted.add(id);
    } catch (error) {
      console.warn('[settings] permanently delete archived session failed', id, error);
    }
  }
  archivedSessions.value = archivedSessions.value.filter((session) => !deleted.has(session.id));
  archiveSelectedIds.value = archiveSelectedIds.value.filter((id) => !deleted.has(id));
  archiveDeleting.value = false;
  toast(`已永久删除 ${deleted.size} 条归档对话${deleted.size < ids.length ? `，${ids.length - deleted.size} 条失败` : ''}`);
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
    restoreNotice.value = '';
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
    restoreNotice.value = '';
    toast('备份预检通过，请核对内容后恢复');
  } catch (error) {
    backupInfo.value = null;
    restoreArmed.value = false;
    toast(error instanceof Error ? error.message : '备份预检失败');
  } finally {
    backupBusy.value = false;
  }
}
/** 恢复备份覆盖了磁盘上的 config.toml:重新拉取全局配置,让表单与后续
 *  保存都基于新值(client 自身的 config 可能仍是 daemon 内存里的旧快照)。 */
async function refreshConfigAfterRestore(): Promise<void> {
  // The official client does not expose workspaceState.loadConfig (grep
  // verified) — prefer it when a future version does, else pull GET /config.
  const loader = (client as unknown as { loadConfig?: () => Promise<void> }).loadConfig;
  if (typeof loader === 'function') {
    // Preferred: a real loadConfig updates client.config, after which the
    // secondaryEffort / secondaryPool watchers resync on their own.
    await loader.call(client);
    loadControlConfig();
    return;
  }
  // Fallback (client does not expose loadConfig): pull GET /config directly
  // and sync the local form refs from the fresh value.
  try {
    const fresh = await getKimiWebApi().getConfig();
    loadControlConfig(fresh);
    secondaryEffort.value = fresh.secondaryModel?.defaultEffort ?? '';
    syncSecondaryPoolFromConfig(fresh.secondaryModel?.models);
  } catch {
    // Daemon may not expose /config yet; the next Engine restart refreshes it.
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
    // 备份包含 kimi-gui-experiments.json：环境实验开关已随备份落盘，但只影响
    // GUI 之后启动的 daemon 进程 —— 提示重启，并重读表单以反映恢复后的开关。
    if (nativeAvailable) {
      restoreNotice.value = '环境实验开关（kimi-gui-experiments.json）已随备份恢复，重启 Engine 后生效';
      await loadEngineEnvExperiments();
    }
    await refreshConfigAfterRestore();
  } catch (error) {
    restoreArmed.value = false;
    toast(error instanceof Error ? error.message : '设置恢复失败');
  } finally {
    backupBusy.value = false;
  }
}
watch(active, (section) => {
  if (section === 'archive') void loadArchive();
  else if (section === 'models-providers') void Promise.all([client.loadModels(), client.loadProviders()]);
  else if (section === 'agents') void loadAgentCenter();
  else if (section === 'engine') void loadEngine();
  else if (section === 'plugins-skills') void loadTools();
  else if (section === 'mcp') void loadMcp();
  else if (section === 'permissions') { loadControlConfig(); void loadTools(); }
  else if (section === 'hooks') loadControlConfig();
  else if (section === 'directories') void loadWorkspaceContext();
  // nextTick: with `immediate: true` the watch fires during setup, before the
  // (always-rendered) TaskCenter instance has mounted and its ref populated.
  else if (section === 'tasks') void nextTick(() => taskCenterRef.value?.load());
}, { immediate: true });

// Kimi Code 0.36+: any client mutating the plugin set (or a capability install
// settling) bumps pluginsRevision — refresh the tool/skill listing live while
// a consuming section is open, so installs made in the embedded /plugins TUI
// or another client show up without a manual reload.
// Optional-chained: the sandbox demo client does not expose these refs.
watch(() => client.pluginsRevision?.value ?? 0, () => {
  if (['plugins-skills', 'permissions', 'capabilities'].includes(active.value)) void loadTools();
});
// Capability install finished (running turned false) — surface the outcome.
watch(() => client.capabilityInstall?.value, (frame, previous) => {
  if (!frame || frame.running || previous === undefined) return;
  toast(frame.error ? `能力 ${frame.capabilityId} 安装失败：${frame.error}` : `能力 ${frame.capabilityId} 安装完成`);
});
const capabilityInstallRunning = computed(() => client.capabilityInstall?.value?.running === true);
const capabilityInstallPercent = computed(() => {
  const percent = client.capabilityInstall?.value?.percent;
  return percent !== undefined && percent >= 0 ? `${Math.round(percent)}%` : '';
});

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
            <h3 class="settings-group-title">新任务默认值</h3>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">默认权限模式</div>
              </div>
              <div class="setting-control">
                <select v-model="permDefault" class="control" aria-label="默认权限模式">
                  <option value="manual">逐条确认</option>
                  <option value="yolo">YOLO · 自动批准工具，仍可提问</option>
                  <option value="auto">自动 · 完全自主，不再提问</option>
                </select>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">默认模型</div>
              </div>
              <div class="setting-control">
                <select v-model="defaultModelId" class="control" aria-label="默认模型">
                  <option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.name }}<template v-if="m.provider">（{{ m.provider }}）</template></option>
                </select>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">默认开启思考</div>
                <div class="setting-desc">新任务使用模型默认思考强度；关闭后默认不启用扩展思考。</div>
              </div>
              <div class="setting-control">
                <label class="switch">
                  <input v-model="defaultThinkingEnabled" type="checkbox" aria-label="默认开启思考" />
                  <span class="switch-slider"></span>
                </label>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">默认计划模式</div>
                <div class="setting-desc">新任务默认先制定计划，再进入执行。</div>
              </div>
              <div class="setting-control">
                <label class="switch">
                  <input v-model="defaultPlanMode" type="checkbox" aria-label="默认计划模式" />
                  <span class="switch-slider"></span>
                </label>
              </div>
            </div>
            <h3 class="settings-group-title">输入与提醒</h3>
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
                <div class="setting-label">完成时通知</div>
                <div class="setting-desc">agent 完成任务后发送系统通知</div>
              </div>
              <div class="setting-control">
                <label class="switch">
                  <input v-model="notifyComplete" type="checkbox" aria-label="完成时通知" />
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
                  <input v-model="notifyQuestion" type="checkbox" aria-label="提问时通知" />
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
                  <input v-model="notifyApproval" type="checkbox" aria-label="审批时通知" />
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
                  <input v-model="soundComplete" type="checkbox" aria-label="完成时播放声音" />
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
                  <option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.name }}<template v-if="m.provider">（{{ m.provider }}）</template></option>
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
                <select v-model="secondaryModelId" class="control" aria-label="次级模型" :disabled="!secondaryModelExperimentEnabled || secondaryPoolConfigured">
                  <option value="">{{ secondaryPoolConfigured ? '使用模型池（主 Agent 按路由描述挑选）' : '继承主模型' }}</option>
                  <option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.name }}<template v-if="m.provider">（{{ m.provider }}）</template></option>
                </select>
                <select v-model="secondaryEffort" class="control compact" aria-label="次级模型思考强度" :disabled="!secondaryModelExperimentEnabled || (!secondaryModelId && !secondaryPoolConfigured)" @change="onSecondaryEffortChange">
                  <option value="">未设置（跟随模型默认）</option>
                  <option v-for="opt in secondaryEffortSelectOptions" :key="opt" :value="opt">{{ secondaryEffortLabel(opt) }}</option>
                </select>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">强制路由</div>
                <div class="setting-desc">所有子任务一律走次级模型，忽略各 Agent 配置里的主/次偏好（Kimi Code 0.36+）。<strong>与模型池互斥</strong>：池的意义是让主 Agent 自己挑，强制路由移除了这个选择。</div>
              </div>
              <div class="setting-control">
                <input type="checkbox" :checked="secondaryForce" :disabled="!secondaryModelExperimentEnabled || secondaryPoolSaving || secondaryPoolConfigured" @change="setSecondaryForce(($event.target as HTMLInputElement).checked)" />
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">当前路由</div>
                <div class="setting-desc">{{ secondaryRoutingSummary }}</div>
              </div>
              <div class="setting-control"><span class="pill">{{ secondaryPoolConfigured ? '池模式' : secondaryForce ? '强制' : '单模型' }}</span></div>
            </div>
            <div class="setting-row top-aligned">
              <div class="setting-info">
                <div class="setting-label">模型池</div>
                <div class="setting-desc">Kimi Code 0.36+：每个成员 = <strong>模型 + 路由描述</strong>。描述会作为该模型的使用提示展示给主 Agent（派发子任务时据此挑选），如「快速模型，适合简单查询」；勾选一个成员作为默认（未指定时的兜底）。与强制路由互斥；清空保存即切回单模型模式。</div>
              </div>
              <div class="setting-control wide-control">
                <div v-if="secondaryPool.length" class="rule-list">
                  <div v-for="(entry, index) in secondaryPool" :key="index" class="rule-row">
                    <input
                      type="radio"
                      name="secondary-pool-default"
                      :checked="secondaryPoolDefault === entry.model"
                      :disabled="!entry.model"
                      title="设为默认模型（未指定时的兜底）"
                      @change="secondaryPoolDefault = entry.model"
                    />
                    <select v-model="entry.model" class="control">
                      <option value="">选择模型</option>
                      <option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.name }}<template v-if="m.provider">（{{ m.provider }}）</template></option>
                    </select>
                    <input v-model="entry.description" class="control rule-pattern" placeholder="路由描述（给主 Agent 的使用提示，可空）" />
                    <button class="icon-btn" aria-label="删除池成员" @click="secondaryPool.splice(index, 1)"><CodexIcon name="trash" /></button>
                  </div>
                </div>
                <div v-else class="archive-empty">未配置模型池</div>
                <div class="settings-button-row">
                  <button class="btn" :disabled="!secondaryModelExperimentEnabled || secondaryForce" @click="secondaryPool.push({ model: '', description: '' })"><CodexIcon name="plus" /> 添加池成员</button>
                  <button class="btn primary" :disabled="!secondaryModelExperimentEnabled || secondaryPoolSaving" @click="saveSecondaryPool">{{ secondaryPoolSaving ? '保存中…' : '保存模型池' }}</button>
                </div>
              </div>
            </div>
            <div v-if="!secondaryModelExperimentEnabled" class="settings-callout">
              当前 daemon 没有启用 <code>secondary-model</code> 实验，次级模型不会参与 Agent / Swarm 路由。
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
            <div class="setting-row top-aligned">
              <div class="setting-info">
                <div class="setting-label">自定义 Agent 目录</div>
                <div class="setting-desc">Kimi Code 0.34+：扫描带 frontmatter 的 Markdown Agent 文件（可作主 Agent 或子 Agent）；frontmatter 需含非空 description。</div>
              </div>
              <div class="setting-control wide-control">
                <input v-model="extraAgentDirs" class="control" placeholder="绝对目录或 ~/ 路径，逗号分隔；相对路径相对项目根解析；目录递归扫描 .md（深度上限 8）" />
                <button class="btn" :disabled="extraAgentDirsSaving" @click="saveExtraAgentDirs">{{ extraAgentDirsSaving ? '保存中…' : '保存目录' }}</button>
              </div>
            </div>
            <template v-if="nativeAvailable">
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
                    <label>模型偏好<select v-model="agentForm.modelPreference" class="control"><option value="primary">主模型</option><option value="secondary">次级模型</option></select><small v-if="secondaryForce" class="setting-desc" style="margin-top:4px">强制路由已开启：所有子任务都会走次级模型，此偏好暂时被忽略。</small></label>
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
            <div class="settings-callout subtle">这里展示 daemon 为当前会话实际加载的 Skills、MCP 与内置工具。当前 daemon REST 尚未提供插件管理接口；桌面版可在应用内运行官方插件管理器，所有变更仍由 Kimi CLI 执行。</div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">官方插件管理器</div>
                <div class="setting-desc">安装、浏览市场、启停、MCP 开关、删除与重载均使用当前 Kimi Code 的原生 <code>/plugins</code> 流程，不会跳到外部终端。</div>
              </div>
              <div class="setting-control settings-button-row">
                <button class="btn primary" :disabled="!nativeAvailable || !activeWorkspaceRoot" @click="emit('open-plugin-manager')">应用内管理</button>
              </div>
            </div>
            <div v-if="!nativeAvailable" class="settings-callout">浏览器模式不能启动本机 PTY；请在 Kimi GUI 桌面应用中打开插件管理器。</div>
            <div v-else-if="!activeWorkspaceRoot" class="settings-callout">请先在主界面选择一个工作区；插件状态是全局的，但官方 TUI 需要从一个已登记的工作区启动。</div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">当前会话能力</div>
                <div class="setting-desc">数据直接来自正在连接的 Kimi Engine，不根据本地目录猜测安装状态。</div>
              </div>
              <div class="setting-control settings-button-row">
                <button class="btn" :disabled="toolsLoading" @click="loadTools">刷新能力</button>
              </div>
            </div>
            <div class="capability-summary" aria-label="当前会话能力统计">
              <div><strong>{{ skillCount }}</strong><span>Skills</span></div>
              <div><strong>{{ toolCounts.skill }}</strong><span>Skill 工具</span></div>
              <div><strong>{{ toolCounts.mcp }}</strong><span>MCP 工具</span></div>
              <div><strong>{{ toolCounts.builtin }}</strong><span>内置工具</span></div>
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
              <div class="setting-control"><span class="pill">{{ toolsLoading ? '加载中…' : `${toolCounts.active} 可用` }}</span></div>
            </div>
            <div v-if="tools.length" class="tool-list">
              <div v-for="tool in tools" :key="`${tool.source}:${tool.mcpServerId || ''}:${tool.name}`" class="tool-row">
                <span class="pill">{{ tool.source }}</span><strong>{{ tool.name }}</strong><span>{{ tool.description || '无描述' }}</span><em :class="{ ok: tool.active !== false }">{{ tool.active === false ? '未启用' : '可用' }}</em>
              </div>
            </div>
          </section>

          <section class="settings-section" :class="{ active: active === 'capabilities' }" id="capabilities">
            <h2>Capabilities</h2>
            <div v-if="capabilityInstallRunning" class="settings-callout">
              正在安装能力 <code>{{ client.capabilityInstall?.value?.capabilityId }}</code>
              <template v-if="client.capabilityInstall?.value?.step"> · {{ client.capabilityInstall?.value?.step }}</template>
              <span v-if="capabilityInstallPercent" class="aph-bar" style="display:inline-block;width:120px;vertical-align:middle"><span class="aph-bar-fill" :style="{ width: capabilityInstallPercent }"></span></span>
            </div>
            <CapabilitiesSettings :runtime-version="client.serverVersion.value || undefined" @manage="emit('open-plugin-manager')" />
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
            <div class="settings-subhead"><div><strong>工具门控</strong><span>Kimi Code 0.34+ 全局 `[tools]` 配置：限定 agent 可用的工具，会话可覆盖；逗号分隔工具名。通配符仅对 <code>mcp__*</code> 工具生效；同一工具同时命中允许与禁用列表时禁用优先。</span></div></div>
            <div class="rule-list">
              <div class="rule-row">
                <span class="pill" style="align-self:center">允许</span>
                <input v-model="toolGatingEnabled" class="control rule-pattern" placeholder="enabled，例如 Read, Grep, mcp__github__*；留空并保存 = 清除（不限制）" />
              </div>
              <div class="rule-row">
                <span class="pill" style="align-self:center">禁用</span>
                <input v-model="toolGatingDisabled" class="control rule-pattern" placeholder="disabled，例如 Bash, Write；留空并保存 = 清除（不禁用）" />
              </div>
              <div class="settings-button-row"><span class="setting-desc">{{ controlConfigReady ? '工具名见下方「当前会话工具」列表。' : '正在等待全局配置加载，暂不能保存。' }}</span><button class="btn primary" :disabled="toolGatingSaving || !controlConfigReady" @click="saveToolGating">{{ toolGatingSaving ? '保存中…' : '保存工具门控' }}</button></div>
            </div>
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
            <div class="settings-callout subtle">Hook 会在匹配事件发生时执行本机命令。已包含 Kimi Code 0.32 新增的 TurnStarted、UserPromptQueued、TaskStarted 和 SessionHeartbeat；保存前请确认命令来源。</div>
            <datalist id="kimi-hook-events">
              <option v-for="eventName in HOOK_EVENT_TYPES" :key="eventName" :value="eventName"></option>
            </datalist>
            <div class="settings-subhead"><div><strong>事件 Hook</strong><span>{{ hooks.length }} 条</span></div><button class="btn" @click="hooks.push({ event: '', matcher: '', command: '', timeout: 30 })"><CodexIcon name="plus" /> 添加 Hook</button></div>
            <div v-if="hooks.length" class="rule-list hook-list">
              <div v-for="(hook, index) in hooks" :key="index" class="rule-row hook-row">
                <input v-model="hook.event" class="control" list="kimi-hook-events" placeholder="选择或输入 event" />
                <input v-model="hook.matcher" class="control" placeholder="matcher（可选）" />
                <input v-model="hook.command" class="control rule-pattern" placeholder="command" />
                <label class="timeout-field"><input v-model.number="hook.timeout" class="control compact" type="number" min="1" max="600" /> 秒</label>
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
          <section class="settings-section" :class="{ active: active === 'tasks' }" id="tasks">
            <h2>任务中心</h2>
            <div class="settings-callout subtle">集中搜索、筛选、归档、恢复、导出和永久删除任务。结果按批次渲染，不会扩展侧栏 DOM。</div>
            <TaskCenter ref="taskCenterRef" @open-session="emit('open-session', $event)" />
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
              <div v-if="restoreNotice" class="settings-callout">{{ restoreNotice }}</div>
              <div v-if="backupInfo.safetySnapshotPath" class="settings-callout subtle">恢复完成。原设置安全快照：<code>{{ backupInfo.safetySnapshotPath }}</code></div>
              <div v-else class="settings-button-row restore-actions">
                <button class="btn" @click="backupInfo = null; restoreArmed = false">取消</button>
                <button class="btn danger" :disabled="backupBusy" @click="restoreSettingsBackup">{{ restoreArmed ? '再次点击确认恢复' : '恢复这个备份' }}</button>
              </div>
            </div>

            <div class="settings-subhead">
              <div><strong>失效数据清理</strong><span>检测工作区已经不存在的任务，以及没有任何任务的空工作区；正常任务不会被处理。</span></div>
              <button class="btn" :disabled="!nativeAvailable || orphanDetecting || orphanCleaning || emptyWorkspaceCleaning" @click="detectOrphanSessions">
                <CodexIcon name="search" /> {{ orphanDetecting ? '检测中…' : '一键检测' }}
              </button>
            </div>
            <div v-if="orphanScan && !orphanScan.items.length && !emptyWorkspaceScan.length" class="settings-callout subtle">未发现需要清理的失效任务或空工作区。</div>
            <div v-if="orphanScan?.items.length" class="archive-preview orphan-preview">
              <div class="ap-head">发现 {{ orphanScan.items.length }} 个失效任务 · {{ formatBackupBytes(orphanScan.totalBytes) }}</div>
              <div v-for="item in orphanScan.items" :key="item.sessionId" class="archive-item">
                <span class="ai-icon"><CodexIcon name="alert-triangle" /></span>
                <div class="ai-info">
                  <div class="ai-name">{{ item.title }}</div>
                  <div class="ai-meta">{{ item.workDir }} · {{ formatBackupBytes(item.bytes) }}</div>
                </div>
              </div>
              <div class="settings-button-row orphan-actions">
                <span v-if="orphanCleaning" class="setting-desc">{{ orphanCleanupProgress }}</span>
                <button class="btn" :disabled="orphanCleaning" @click="requestOrphanCleanup('backup')">全部备份后清理</button>
                <button class="btn danger" :disabled="orphanCleaning" @click="requestOrphanCleanup('delete')">全部直接清理</button>
              </div>
            </div>
            <div v-if="emptyWorkspaceScan.length" class="archive-preview orphan-preview">
              <div class="ap-head">发现 {{ emptyWorkspaceScan.length }} 个空工作区</div>
              <div v-for="(workspace, index) in emptyWorkspaceScan" :key="`${workspace.id || workspace.root || 'empty'}-${index}`" class="archive-item">
                <span class="ai-icon"><CodexIcon name="folder" /></span>
                <div class="ai-info">
                  <div class="ai-name">{{ workspace.name || workspace.root || workspace.id || '未命名工作区' }}</div>
                  <div class="ai-meta">{{ workspace.root || '未记录工作区路径' }}</div>
                </div>
              </div>
              <div class="settings-button-row orphan-actions">
                <button class="btn danger" :disabled="emptyWorkspaceCleaning" @click="emptyWorkspaceConfirmOpen = true">
                  {{ emptyWorkspaceCleaning ? '移除中…' : '全部移除空工作区' }}
                </button>
              </div>
            </div>

            <div class="settings-subhead archive-subhead">
              <div><strong>已归档对话</strong><span>{{ archivedSessions.length }} 条，可搜索、恢复或永久删除。</span></div>
              <button class="btn" @click="loadArchive" :disabled="archivedLoading">{{ archivedLoading ? '加载中…' : '刷新' }}</button>
            </div>
            <div class="setting-row">
              <label class="archive-search-field"><CodexIcon name="search" /><input v-model="archiveQuery" class="control" placeholder="搜索标题、会话 ID 或工作区路径" /></label>
              <div class="setting-control settings-button-row">
                <button class="btn" :disabled="!archiveFiltered.length" @click="toggleVisibleArchives">{{ archiveAllVisibleSelected ? '取消全选' : '选择当前结果' }}</button>
                <button class="btn primary" :disabled="!archiveSelectedIds.length" @click="restoreSelectedArchives">恢复所选（{{ archiveSelectedIds.length }}）</button>
                <button class="btn danger" :disabled="!nativeAvailable || !archiveSelectedIds.length || archiveDeleting" @click="requestDeleteArchived(archiveSelectedIds)">永久删除所选（{{ archiveSelectedIds.length }}）</button>
              </div>
            </div>

            <div v-if="archivedSessions.length" class="archive-preview">
              <div class="ap-head">归档列表 · {{ archiveFiltered.length }} 条结果</div>
              <div v-for="s in archiveFiltered" :key="s.id" class="archive-item">
                <input type="checkbox" :checked="archiveSelectedIds.includes(s.id)" :aria-label="`选择 ${s.title || s.id}`" @change="toggleArchiveSelection(s.id)" />
                <span class="ai-icon"><CodexIcon name="archive" /></span>
                <div class="ai-info">
                  <div class="ai-name">{{ s.title || s.id }}</div>
                  <div class="ai-meta">归档于 {{ s.updatedAt ? formatLocalDate(s.updatedAt) : '未知' }}<template v-if="s.cwd"> · {{ s.cwd }}</template></div>
                </div>
                <div class="settings-button-row">
                  <button class="ai-restore" @click="onRestore(s.id)">恢复</button>
                  <button class="ai-restore danger" :disabled="!nativeAvailable || archiveDeleting" @click="requestDeleteArchived([s.id])">永久删除</button>
                </div>
              </div>
              <div v-if="!archiveFiltered.length" class="archive-empty">没有匹配的归档对话</div>
            </div>
            <div v-else-if="!archivedLoading" class="archive-empty">暂无归档对话</div>
          </section>

          <!-- Kimi Engine -->
          <section class="settings-section" :class="{ active: active === 'performance' }" id="performance">
            <h2>运行与性能</h2>
            <div class="settings-callout subtle">配置 Agent 步数、后台并发、超时、上下文预算和图像读取。保存时保留 config.toml 中不相关的官方或自定义字段。</div>
            <PerformanceSettings />
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
                    @click="requestDaemonRestart('manual')"
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
                  <button class="btn" :disabled="Boolean(maintenanceBusy)" @click="migrate033Config">迁移 0.33 配置</button>
                  <button class="btn" :disabled="Boolean(maintenanceBusy)" @click="runMaintenance('update')">{{ maintenanceBusy === 'update' ? '更新中…' : '更新 Kimi CLI' }}</button>
                  <button class="btn" :disabled="Boolean(maintenanceBusy) || !client.activeSessionId.value" @click="runMaintenance('visualizer')">打开 Visualizer</button>
                </div>
              </div>
              <pre v-if="maintenanceOutput" class="maintenance-output">{{ maintenanceOutput }}</pre>
            </template>
            <div class="setting-row top-aligned">
              <div class="setting-info"><div class="setting-label">实验能力</div><div class="setting-desc">显示当前 daemon 的实际状态；可配置项写入 config.toml，新会话生效。</div></div>
              <div class="setting-control"><span class="pill">{{ enabledExperimentNames.length }} 项运行中</span></div>
            </div>
            <div class="experiment-grid">
              <label v-for="feature in experimentRows" :key="feature.id" class="experiment-card" :class="{ locked: feature.locked }">
                <span class="experiment-main"><strong>{{ feature.label }}</strong><code>{{ feature.id }}</code><small>{{ feature.description }}</small></span>
                <span class="experiment-state">
                  <span v-if="feature.configured !== undefined" class="pill">config</span>
                  <input
                    type="checkbox"
                    :checked="feature.enabled"
                    :disabled="feature.locked || experimentSaving === feature.id"
                    @change="setExperiment(feature.id, ($event.target as HTMLInputElement).checked)"
                  />
                </span>
              </label>
            </div>
            <div class="settings-callout subtle">GUI 启动的 Kimi Engine 会启用次级模型实验；外部 daemon 的能力以这里显示的运行时开关为准。</div>

            <div class="setting-row top-aligned">
              <div class="setting-info"><div class="setting-label">Engine 环境实验</div><div class="setting-desc">通过环境变量开启的实验能力（Kimi Code 0.39+）：环境变量优先级最高且仅 GUI 注入可控，config <code>[experimental]</code> 亦可开启但需重启 Engine。</div></div>
              <div class="setting-control"><span class="pill">{{ engineEnvExperiments.filter((e) => e.enabled).length }}/{{ engineEnvExperiments.length }} 开启</span></div>
            </div>
            <div class="experiment-grid">
              <label v-for="feature in engineEnvExperiments" :key="feature.id" class="experiment-card" :class="{ locked: !nativeAvailable }">
                <span class="experiment-main"><strong>{{ feature.label }}</strong><code>{{ feature.env }}</code><small>{{ feature.description }}</small></span>
                <span class="experiment-state">
                  <input
                    type="checkbox"
                    :checked="feature.enabled"
                    :disabled="!nativeAvailable || engineEnvSaving"
                    @change="setEngineEnvExperiment(feature.id, ($event.target as HTMLInputElement).checked)"
                  />
                </span>
              </label>
            </div>
            <div v-if="engineEnvDirty" class="settings-callout">环境实验已保存，重启 Engine 后生效：<button class="btn primary" :disabled="Boolean(maintenanceBusy) || !engine?.installed || (engineVersionRelation !== null && engineVersionRelation < 0)" @click="requestDaemonRestart('manual')">{{ maintenanceBusy === 'restart' ? '正在重启…' : '立即重启 Engine' }}</button></div>
          </section>

          <!-- 关于 -->
          <section class="settings-section" :class="{ active: active === 'about' }" id="about">
            <h2>关于</h2>
            <div class="setting-row">
              <div class="setting-info"><div class="setting-label">版本</div></div>
              <div class="setting-control"><span>Kimi Studio v{{ appVersion }}</span></div>
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
      v-if="archiveDeleteIds.length"
      title="永久删除归档对话？"
      :description="`将永久删除 ${archiveDeleteIds.length} 条归档对话的本地记录，聊天内容无法恢复。活动会话不会被删除。`"
      confirm-label="永久删除"
      :danger="true"
      :input="false"
      @confirm="deleteSelectedArchives"
      @cancel="archiveDeleteIds = []"
    />
    <PromptDialog
      v-if="orphanConfirmMode"
      :title="orphanConfirmMode === 'backup' ? '备份后清理全部失效任务？' : '永久清理全部失效任务？'"
      :description="orphanConfirmMode === 'backup'
        ? `将清理 ${orphanScan?.items.length ?? 0} 个失效任务，并把完整记录移动到 ~/.kimi-code/orphaned-sessions。`
        : `将永久删除 ${orphanScan?.items.length ?? 0} 个失效任务的本地记录；此操作无法恢复。`"
      :confirm-label="orphanConfirmMode === 'backup' ? '备份后清理' : '永久清理'"
      :danger="orphanConfirmMode === 'delete'"
      :input="false"
      @confirm="cleanupDetectedOrphans"
      @cancel="orphanConfirmMode = null"
    />
    <PromptDialog
      v-if="emptyWorkspaceConfirmOpen"
      title="移除全部空工作区？"
      :description="`将从侧栏和工作区注册表移除 ${emptyWorkspaceScan.length} 个没有任务的工作区；不会删除目录或会话数据，之后仍可重新添加。`"
      confirm-label="移除空工作区"
      :danger="true"
      :input="false"
      @confirm="removeDetectedEmptyWorkspaces"
      @cancel="emptyWorkspaceConfirmOpen = false"
    />
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
