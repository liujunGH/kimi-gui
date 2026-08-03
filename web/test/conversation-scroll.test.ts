import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../src/components/codex/chat/ConversationPane.vue', import.meta.url),
  'utf8',
);

describe('conversation scroll affordance', () => {
  it('offers a bottom jump only after the reader leaves the live edge', () => {
    expect(source).toContain('v-if="!nearBottom"');
    expect(source).toContain('aria-label="回到底部"');
    expect(source).toContain("el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })");
  });

  it('keeps streaming follow gated by the reader position', () => {
    expect(source).toContain('if (el && nearBottom.value) el.scrollTop = el.scrollHeight');
  });
});
