import type { AppSession } from '../api/types';

export type TaskCenterStatus = 'all' | 'running' | 'attention' | 'idle' | 'archived';
export type TaskCenterSort = 'updated' | 'context' | 'title';

export function sessionContextPercent(session: AppSession): number {
  return session.usage.contextLimit > 0
    ? Math.min(100, Math.round(session.usage.contextTokens / session.usage.contextLimit * 100))
    : 0;
}

export function filterAndSortTaskSessions(
  sessions: AppSession[],
  query: string,
  status: TaskCenterStatus,
  model: string,
  sort: TaskCenterSort,
): AppSession[] {
  const needle = query.trim().toLowerCase();
  return sessions
    .filter((session) => {
      if (needle && ![session.title, session.id, session.cwd, session.model, session.lastPrompt]
        .some((value) => value?.toLowerCase().includes(needle))) return false;
      if (model && session.model !== model) return false;
      if (status === 'running' && !session.busy) return false;
      if (status === 'attention' && session.pendingInteraction === 'none') return false;
      if (status === 'idle' && (session.busy || session.archived)) return false;
      if (status === 'archived' && !session.archived) return false;
      return true;
    })
    .toSorted((a, b) => {
      if (sort === 'context') return sessionContextPercent(b) - sessionContextPercent(a);
      if (sort === 'title') return a.title.localeCompare(b.title, 'zh-CN');
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
}
