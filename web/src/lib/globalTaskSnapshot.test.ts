import { describe, expect, it } from 'vitest';
import type { AppSession, AppTask } from '../api/types';
import { buildGlobalTaskSnapshot } from './globalTaskSnapshot';

const session = { id: 'session-1' } as AppSession;
const task = { id: 'task-1', sessionId: session.id, status: 'running' } as AppTask;

describe('buildGlobalTaskSnapshot', () => {
  it('drops sessions and tasks that disappeared from the latest busy poll', () => {
    const running = buildGlobalTaskSnapshot([{ session, items: [task] }]);
    expect(running.sessions.has(session.id)).toBe(true);
    expect(running.tasks.has(`${session.id}:${task.id}`)).toBe(true);

    const completed = buildGlobalTaskSnapshot([]);
    expect(completed.sessions.size).toBe(0);
    expect(completed.tasks.size).toBe(0);
  });
});
