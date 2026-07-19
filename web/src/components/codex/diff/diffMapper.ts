/**
 * diffMapper —— 官方 DiffViewLine → 契约 DiffHunk(带真实行号)
 *
 * DiffViewLine:{ type:'add'|'del'|'context'|'hunk', text, oldNo?, newNo? }
 * 分组规则:'hunk' 行(@@ 头)开启一个新块,content 行归属当前块;
 * 块起始行号取首个 content 行的 oldNo/newNo。
 */
import type { DiffViewLine } from '../../../types';
import type { DiffHunk } from '../../../types/codex';

export function toDiffHunks(lines: DiffViewLine[]): DiffHunk[] {
  const blocks: { header: string | null; items: DiffViewLine[] }[] = [];
  let cur: { header: string | null; items: DiffViewLine[] } = { header: null, items: [] };

  for (const l of lines) {
    if (l.type === 'hunk') {
      if (cur.header !== null || cur.items.length) blocks.push(cur);
      cur = { header: l.text, items: [] };
    } else {
      cur.items.push(l);
    }
  }
  if (cur.header !== null || cur.items.length) blocks.push(cur);

  return blocks.map((b) => {
    const first = b.items[0];
    const oldStart = first?.oldNo ?? 1;
    const newStart = first?.newNo ?? 1;
    return {
      oldStart,
      newStart,
      lines: [
        ...(b.header ? [{ kind: 'hunk' as const, text: b.header }] : []),
        ...b.items.map((l) => ({
          kind: l.type === 'add' ? ('add' as const) : l.type === 'del' ? ('del' as const) : ('context' as const),
          text: l.text,
        })),
      ],
    };
  });
}
