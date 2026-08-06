import type { AppSession, AppTask } from '../api/types';

export interface GlobalTaskSnapshotSource {
  session: AppSession;
  items: AppTask[];
}

/**
 * Build one authoritative polling snapshot for the global task panel.
 *
 * The daemon's `busy=true` session page is a point-in-time result. Keeping
 * entries from the previous poll makes completed/cancelled jobs look active
 * until the panel is closed, so deliberately start from empty maps each time.
 */
export function buildGlobalTaskSnapshot(sources: GlobalTaskSnapshotSource[]): {
  sessions: Map<string, AppSession>;
  tasks: Map<string, AppTask>;
} {
  const sessions = new Map<string, AppSession>();
  const tasks = new Map<string, AppTask>();
  for (const { session, items } of sources) {
    sessions.set(session.id, session);
    for (const task of items) tasks.set(`${session.id}:${task.id}`, task);
  }
  return { sessions, tasks };
}
