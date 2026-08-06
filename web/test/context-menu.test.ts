import { describe, expect, it } from 'vitest';
import { clampContextMenuPosition } from '../src/lib/contextMenu';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

describe('context menu positioning', () => {
  it('keeps the requested pointer position when there is enough room', () => {
    expect(clampContextMenuPosition(
      { x: 120, y: 80 },
      { width: 190, height: 220 },
      { width: 1200, height: 800 },
    )).toEqual({ x: 120, y: 80 });
  });

  it('flips the menu inward at the bottom-right edge', () => {
    expect(clampContextMenuPosition(
      { x: 1180, y: 790 },
      { width: 190, height: 220 },
      { width: 1200, height: 800 },
    )).toEqual({ x: 1002, y: 572 });
  });

  it('keeps a viewport margin at the top-left edge', () => {
    expect(clampContextMenuPosition(
      { x: -12, y: 0 },
      { width: 190, height: 220 },
      { width: 1200, height: 800 },
    )).toEqual({ x: 8, y: 8 });
  });
});

describe('context menu integration', () => {
  it('uses an opaque project surface token instead of an unresolved variable', () => {
    const source = fs.readFileSync(
      path.join(root, 'src/components/codex/layout/ContextMenu.vue'),
      'utf8',
    );
    expect(source).toContain('background: var(--color-surface-raised, var(--bg));');
    expect(source).not.toContain('background: var(--surface);');
  });

  it.each([
    'components/codex/sidebar/ThreadRow.vue',
    'components/codex/chat/MessageUser.vue',
    'components/codex/chat/MessageAssistant.vue',
    'components/codex/chat/ToolCallCard.vue',
  ])('uses the shared menu in %s', (relative) => {
    const source = fs.readFileSync(path.join(root, 'src', relative), 'utf8');
    expect(source).toContain("import ContextMenu from '../layout/ContextMenu.vue'");
    expect(source).toContain('@contextmenu.prevent');
  });
});
