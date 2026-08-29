import { invoke } from '@tauri-apps/api/core';

export interface KimiAgentProfile {
  name: string;
  description: string;
  whenToUse?: string;
  modelPreference?: 'primary' | 'secondary';
  tools: string[];
  disallowedTools: string[];
  prompt: string;
  path: string;
  scope: 'user' | 'shared' | 'project' | 'project-shared' | string;
  editable: boolean;
}

export interface KimiEngineStatus {
  installed: boolean;
  cliPath?: string;
  version?: string;
  home: string;
  configPath: string;
  systemPromptPath: string;
}

export interface KimiDaemonInfo {
  base: string;
  token: string;
}

export interface KimiMcpConfigEntry {
  name: string;
  scope: 'user' | 'project';
  transport: 'stdio' | 'http' | 'sse';
  command?: string;
  args: string[];
  url?: string;
  enabled: boolean;
  hasSensitiveConfig: boolean;
  path: string;
}

export interface KimiWorkspaceContext {
  path: string;
  additionalDirs: string[];
}

export interface KimiPerformanceConfig {
  maxStepsPerTurn?: number;
  maxAttemptsPerStep: number;
  reservedContextSize?: number;
  maxRunningTasks?: number;
  bashAutoBackgroundOnTimeout: boolean;
  bashTaskTimeoutS: number;
  subagentTimeoutMs: number;
  mcpStartupTimeoutMs: number;
  mcpToolTimeoutMs: number;
  tokenCountingStrategy: 'measured+estimated' | 'measured' | 'estimated';
  imageMaxEdgePx: number;
  imageReadByteBudget: number;
  cacheExpiryHint: boolean;
}

export interface KimiBackupInfo {
  path: string;
  files: number;
  bytes: number;
  entries: string[];
  safetySnapshotPath?: string;
}

export interface Kimi033MigrationResult {
  changed: boolean;
  backupPath?: string;
  renamedKeys: string[];
}

export interface OrphanSessionCleanupResult {
  sessionId: string;
  backupPath?: string;
  alreadyCleaned: boolean;
}

export interface OrphanSessionInfo {
  sessionId: string;
  title: string;
  workDir: string;
  bytes: number;
}

export interface OrphanSessionScanResult {
  items: OrphanSessionInfo[];
  totalBytes: number;
}

export interface ArchivedSessionDeleteResult {
  sessionId: string;
  alreadyDeleted: boolean;
}

export interface PluginTuiSnapshot {
  output: string;
  running: boolean;
  pid?: number;
}

export interface KimiProviderCommandInput {
  action: 'catalog-list' | 'catalog-add' | 'registry-add';
  providerId?: string;
  url?: string;
  apiKey?: string;
  defaultModel?: string;
  baseUrl?: string;
  filter?: string;
}

export function kimiNativeAvailable(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function nativeInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!kimiNativeAvailable()) throw new Error('此功能仅在 Kimi GUI 桌面应用中可用');
  return invoke<T>(command, args);
}

export const kimiRuntime = {
  engineStatus: () => nativeInvoke<KimiEngineStatus>('kimi_engine_status'),
  migrate033Config: () => nativeInvoke<Kimi033MigrationResult>('migrate_kimi_033_config'),
  restartDaemon: () => nativeInvoke<KimiDaemonInfo>('restart_kimi_daemon'),
  /** Env-gated daemon experiments (tower / remote-control). Persisted by the
   *  shell and injected into every daemon start; takes effect on restart. */
  experimentalEnv: () => nativeInvoke<string[]>('kimi_experimental_env'),
  setExperimentalEnv: (enabled: string[]) =>
    nativeInvoke<void>('set_kimi_experimental_env', { enabled }),
  listAgents: (workspaceRoot?: string) =>
    nativeInvoke<KimiAgentProfile[]>('list_kimi_agents', { workspaceRoot }),
  saveAgent: (agent: {
    name: string;
    description: string;
    whenToUse?: string;
    modelPreference?: 'primary' | 'secondary';
    tools: string[];
    disallowedTools: string[];
    prompt: string;
  }) => nativeInvoke<KimiAgentProfile>('save_kimi_agent', agent),
  deleteAgent: (name: string) => nativeInvoke<void>('delete_kimi_agent', { name }),
  readSystemPrompt: () => nativeInvoke<string>('read_kimi_system_prompt'),
  saveSystemPrompt: (content: string) => nativeInvoke<void>('save_kimi_system_prompt', { content }),
  listMcpConfig: (workspaceRoot?: string) =>
    nativeInvoke<KimiMcpConfigEntry[]>('list_kimi_mcp_config', { workspaceRoot }),
  saveMcpServer: (input: {
    name: string;
    scope: 'user' | 'project';
    workspaceRoot?: string;
    transport: 'stdio' | 'http' | 'sse';
    command?: string;
    args: string[];
    url?: string;
    enabled: boolean;
  }) => nativeInvoke<KimiMcpConfigEntry>('save_kimi_mcp_server', { input }),
  deleteMcpServer: (name: string, scope: 'user' | 'project', workspaceRoot?: string) =>
    nativeInvoke<void>('delete_kimi_mcp_server', { name, scope, workspaceRoot }),
  readWorkspaceContext: (workspaceRoot: string) =>
    nativeInvoke<KimiWorkspaceContext>('read_kimi_workspace_context', { workspaceRoot }),
  saveWorkspaceContext: (workspaceRoot: string, additionalDirs: string[]) =>
    nativeInvoke<KimiWorkspaceContext>('save_kimi_workspace_context', { workspaceRoot, additionalDirs }),
  readPerformanceConfig: () =>
    nativeInvoke<KimiPerformanceConfig>('read_kimi_performance_config'),
  savePerformanceConfig: (value: KimiPerformanceConfig) =>
    nativeInvoke<KimiPerformanceConfig>('save_kimi_performance_config', { value }),
  createSettingsBackup: (destination: string) =>
    nativeInvoke<KimiBackupInfo>('create_kimi_settings_backup', { destination }),
  inspectSettingsBackup: (path: string) =>
    nativeInvoke<KimiBackupInfo>('inspect_kimi_settings_backup', { path }),
  restoreSettingsBackup: (path: string) =>
    nativeInvoke<KimiBackupInfo>('restore_kimi_settings_backup', { path }),
  detectOrphanSessions: () =>
    nativeInvoke<OrphanSessionScanResult>('detect_orphan_kimi_sessions'),
  cleanupOrphanSession: (sessionId: string, backup: boolean) =>
    nativeInvoke<OrphanSessionCleanupResult>('cleanup_orphan_kimi_session', { sessionId, backup }),
  deleteArchivedSession: (sessionId: string) =>
    nativeInvoke<ArchivedSessionDeleteResult>('delete_archived_kimi_session', { sessionId }),
  runProviderCommand: (input: KimiProviderCommandInput) =>
    nativeInvoke<string>('run_kimi_provider_command', { ...input }),
  runMaintenance: (action: 'doctor-config' | 'doctor-tui' | 'migrate' | 'update' | 'visualizer', sessionId?: string) =>
    nativeInvoke<string>('run_kimi_maintenance', { action, sessionId }),
  startPluginTui: (workspaceRoot: string, cols?: number, rows?: number) =>
    nativeInvoke<PluginTuiSnapshot>('start_kimi_plugin_tui', { workspaceRoot, cols, rows }),
  readPluginTui: () => nativeInvoke<PluginTuiSnapshot>('read_kimi_plugin_tui'),
  writePluginTui: (data: string) => nativeInvoke<void>('write_kimi_plugin_tui', { data }),
  openPluginTui: () => nativeInvoke<void>('open_kimi_plugin_tui'),
  resizePluginTui: (cols: number, rows: number) =>
    nativeInvoke<void>('resize_kimi_plugin_tui', { cols, rows }),
  stopPluginTui: () => nativeInvoke<void>('stop_kimi_plugin_tui'),
};
