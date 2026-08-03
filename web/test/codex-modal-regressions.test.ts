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
});
