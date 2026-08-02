import { describe, expect, it } from 'vitest';
import { markdownRenderPlan, needsRichMarkdown } from '../src/lib/markdownPerformance';

describe('markdown performance routing', () => {
  it('keeps plain historical replies on the lightweight renderer', () => {
    expect(needsRichMarkdown('完成了。\n现在可以继续下一步。')).toBe(false);
  });

  it.each([
    '# 标题',
    '- 列表项',
    '**强调**',
    '`command`',
    '[文档](https://example.com)',
    'https://example.com',
    '| A | B |\n| - | - |',
    '请查看 /tmp/example.ts:12',
    '```ts\nconst ok = true\n```',
  ])('keeps rich content on the full renderer: %s', (text) => {
    expect(needsRichMarkdown(text)).toBe(true);
  });

  it('uses the plain code renderer for very large fenced blocks', () => {
    const plan = markdownRenderPlan(`\`\`\`txt\n${'x'.repeat(30_001)}\n\`\`\``);
    expect(plan.codeRenderer).toBe('pre');
  });
});
