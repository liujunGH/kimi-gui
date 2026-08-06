import { describe, expect, it } from 'vitest';
import type { ToolCall, TurnBlock } from '../src/types';
import { groupAssistantWork, workStats } from '../src/lib/workSummary';

function tool(id: string, status: ToolCall['status'] = 'ok'): Extract<TurnBlock, { kind: 'tool' }> {
  return { kind: 'tool', tool: { id, name: 'Bash', arg: id, status } };
}

describe('groupAssistantWork', () => {
  it('groups consecutive thinking and tools while preserving surrounding text', () => {
    const units = groupAssistantWork([
      { kind: 'thinking', thinking: 'plan' },
      tool('a'),
      tool('b'),
      { kind: 'text', text: 'answer' },
      tool('c'),
    ]);

    expect(units.map((unit) => unit.kind)).toEqual(['work', 'text', 'work']);
    expect(units[0]).toMatchObject({ sourceIndex: 0 });
    expect(units[1]).toMatchObject({ sourceIndex: 3 });
    expect(units[2]).toMatchObject({ sourceIndex: 4 });
  });

  it('drops empty text blocks without joining work across them out of order', () => {
    const units = groupAssistantWork([tool('a'), { kind: 'text', text: '' }, tool('b')]);
    expect(units).toHaveLength(2);
    expect(units.every((unit) => unit.kind === 'work')).toBe(true);
  });
});

describe('workStats', () => {
  it('counts tool, thinking, running, and error states', () => {
    const unit = groupAssistantWork([
      { kind: 'thinking', thinking: 'plan' },
      tool('a', 'running'),
      tool('b', 'error'),
    ])[0];
    expect(unit?.kind).toBe('work');
    if (unit?.kind === 'work') {
      expect(workStats(unit.entries)).toEqual({ tools: 2, thinking: 1, errors: 1, running: 1 });
    }
  });
});
