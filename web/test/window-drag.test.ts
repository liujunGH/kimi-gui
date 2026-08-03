import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readProjectFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

describe('desktop window drag contract', () => {
  it('grants Tauri permission to start native window dragging', () => {
    const capability = JSON.parse(
      readProjectFile('../../src-tauri/capabilities/default.json'),
    ) as { permissions?: string[] };

    expect(capability.permissions).toContain('core:window:allow-start-dragging');
  });

  it('makes both product titlebar surfaces deep drag regions', () => {
    const app = readProjectFile('../src/codex-app/CodexApp.vue');
    const sidebar = readProjectFile('../src/components/codex/sidebar/Sidebar.vue');

    expect(app.match(/class="app-toolbar"\s+data-tauri-drag-region="deep"/g)).toHaveLength(2);
    expect(sidebar).toMatch(/class="sidebar-brand"\s+data-tauri-drag-region="deep"/);
  });

  it('keeps an explicit native fallback for macOS WebView hit testing', () => {
    const app = readProjectFile('../src/codex-app/CodexApp.vue');
    const sidebar = readProjectFile('../src/components/codex/sidebar/Sidebar.vue');
    const tauriBridge = readProjectFile('../src/composables/codex/useTauriDaemon.ts');

    expect(tauriBridge).toContain('getCurrentWindow().startDragging()');
    expect(tauriBridge).toContain('event.preventDefault()');
    expect(app).toContain('@mousedown="tauriDaemon.startWindowDragging"');
    expect(sidebar).toContain('@mousedown="startWindowDragging"');
  });
});
