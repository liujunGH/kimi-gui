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

export interface KimiBackupInfo {
  path: string;
  files: number;
  bytes: number;
  entries: string[];
  safetySnapshotPath?: string;
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
  restartDaemon: () => nativeInvoke<KimiDaemonInfo>('restart_kimi_daemon'),
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
  createSettingsBackup: (destination: string) =>
    nativeInvoke<KimiBackupInfo>('create_kimi_settings_backup', { destination }),
  inspectSettingsBackup: (path: string) =>
    nativeInvoke<KimiBackupInfo>('inspect_kimi_settings_backup', { path }),
  restoreSettingsBackup: (path: string) =>
    nativeInvoke<KimiBackupInfo>('restore_kimi_settings_backup', { path }),
  runMaintenance: (action: 'doctor-config' | 'doctor-tui' | 'migrate' | 'update' | 'visualizer', sessionId?: string) =>
    nativeInvoke<string>('run_kimi_maintenance', { action, sessionId }),
};
