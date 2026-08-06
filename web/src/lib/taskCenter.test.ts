import { describe, expect, it } from 'vitest';
import type { AppSession } from '../api/types';
import { filterAndSortTaskSessions, sessionContextPercent } from './taskCenter';

const base = { createdAt: '', updatedAt: '', busy: false, archived: false, cwd: '/tmp', model: 'k3', usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalCostUsd: 0, contextTokens: 0, contextLimit: 0, turnCount: 0 }, messageCount: 1, lastSeq: 1 };
const session = (id: string, extra: Partial<AppSession> = {}): AppSession => ({ ...base, id, title: id, ...extra });

describe('task center helpers', () => {
  it('filters running and archived sessions', () => {
    const rows = [session('run', { busy: true }), session('old', { archived: true })];
    expect(filterAndSortTaskSessions(rows, '', 'running', '', 'updated').map((s) => s.id)).toEqual(['run']);
    expect(filterAndSortTaskSessions(rows, '', 'archived', '', 'updated').map((s) => s.id)).toEqual(['old']);
  });
  it('sorts by bounded context usage', () => {
    const rows = [session('low', { usage: { ...base.usage, contextTokens: 10, contextLimit: 100 } }), session('high', { usage: { ...base.usage, contextTokens: 200, contextLimit: 100 } })];
    expect(sessionContextPercent(rows[1]!)).toBe(100);
    expect(filterAndSortTaskSessions(rows, '', 'all', '', 'context')[0]?.id).toBe('high');
  });
});
