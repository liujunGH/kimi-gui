import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

describe('Codex modal regressions', () => {
  it('keeps destructive confirmation copy readable on its danger fill', () => {
    const dialog = readSource('../src/components/codex/layout/PromptDialog.vue');

    expect(dialog).toMatch(
      /\.pd-confirm\.danger\s*\{[^}]*color:\s*var\(--on-accent\)/s,
    );
  });

  it('mounts the updater outside the settings/main-page branch', () => {
    const app = readSource('../src/codex-app/CodexApp.vue');

    expect(app.match(/<UpdateDialog\s*\/>/g)).toHaveLength(1);
    expect(app.indexOf('<UpdateDialog />')).toBeGreaterThan(app.lastIndexOf('</AppShell>'));
  });

  it('renders unanchored pending approvals instead of showing only their count', () => {
    const app = readSource('../src/codex-app/CodexApp.vue');
    const conversation = readSource('../src/components/codex/chat/ConversationPane.vue');

    expect(app).toContain(':pending-approvals="standaloneApprovals"');
    expect(app).toContain('conversationRunning || standaloneApprovals.length');
    expect(app).toContain('<ApprovalCard v-bind="approval" />');
    expect(conversation).toContain('v-for="approval in props.pendingApprovals ?? []"');
  });

  it('keeps session search and app commands in explicit accessible tabs', () => {
    const palette = readSource('../src/components/codex/layout/CommandPalette.vue');

    expect(palette).toContain('role="tablist"');
    expect(palette).toContain("selectMode('sessions')");
    expect(palette).toContain("selectMode('commands')");
    expect(palette).toContain("mode === 'sessions' ? '搜索会话…' : '搜索命令…'");
  });

  it('exposes the new-session thinking and plan defaults in product settings', () => {
    const settings = readSource('../src/components/codex/settings/SettingsPage.vue');

    expect(settings).toContain('v-model="defaultThinkingEnabled"');
    expect(settings).toContain('v-model="defaultPlanMode"');
    expect(settings).toContain('aria-label="完成时通知"');
    expect(settings).toContain('aria-label="审批时通知"');
  });

  it('offers the required Engine restart after restoring a 0.33 session', () => {
    const taskCenter = readSource('../src/components/codex/settings/TaskCenter.vue');
    const settings = readSource('../src/components/codex/settings/SettingsPage.vue');

    expect(taskCenter).toContain('title="重启 Kimi Engine 以继续？"');
    expect(taskCenter).toContain('await kimiRuntime.restartDaemon()');
    expect(taskCenter).toContain("setEphemeralCredential(info.token)");
    expect(settings).toContain("requestDaemonRestart('restore')");
  });

  it('does not freeze a Capabilities UI label to one Kimi version', () => {
    const capabilities = readSource('../src/components/codex/settings/CapabilitiesSettings.vue');
    const pluginDialog = readSource('../src/components/codex/settings/PluginTuiDialog.vue');

    expect(capabilities).not.toContain('0.33');
    expect(capabilities).toContain('props.runtimeVersion');
    expect(pluginDialog).not.toContain('Kimi Code 0.33+');
    expect(pluginDialog).toContain('props.runtimeVersion');
    expect(pluginDialog).toContain('聚焦终端');
    expect(pluginDialog).toContain('键盘已就绪');
    expect(pluginDialog).toContain('Tab 切换 · ↑↓ 选择 · Enter 打开 · Esc 返回');
  });
});
