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

  it('lets the Tauri drag region own double-click zoom exactly once', () => {
    const app = readProjectFile('../src/codex-app/CodexApp.vue');
    const sidebar = readProjectFile('../src/components/codex/sidebar/Sidebar.vue');
    const tauriBridge = readProjectFile('../src/composables/codex/useTauriDaemon.ts');
    const rustCommands = readProjectFile('../../src-tauri/src/lib.rs');

    // Tauri's injected drag-region listener already toggles maximization on a
    // double click. A Vue dblclick handler or a second Rust toggle immediately
    // reverses that native action (maximize → restore, or restore → maximize).
    expect(app).not.toContain('@dblclick="onTitlebarDblClick"');
    expect(sidebar).not.toContain('@dblclick="onBrandDblclick"');
    expect(tauriBridge).not.toContain('toggleWindowZoom');
    expect(rustCommands).not.toContain('toggle_window_zoom');
  });
});
