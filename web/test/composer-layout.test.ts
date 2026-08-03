import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

describe('task context placement', () => {
  it('keeps workspace and agent controls in the titlebar, not the composer footer', () => {
    const app = readSource('../src/codex-app/CodexApp.vue');
    const composer = readSource('../src/components/codex/composer/Composer.vue');

    expect(app).toContain('class="toolbar-context"');
    expect(app).toContain('<WorkspacePicker');
    expect(app).toContain('<AgentPicker');
    expect(composer).not.toContain('<WorkspacePicker');
    expect(composer).not.toContain('<AgentPicker');
  });

  it('lets document click handlers close sibling context menus', () => {
    const workspacePicker = readSource('../src/components/codex/layout/WorkspacePicker.vue');

    expect(workspacePicker).not.toContain('@click.stop="open = !open"');
  });
});
