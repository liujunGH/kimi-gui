import { isDaemonApiError } from '../api/errors';

export type ArchiveSessionOutcome = 'archived' | 'orphaned' | 'failed';

/**
 * Kimi daemon 0.33 resolves a session's workspace before archiving it. A
 * short-lived worktree can therefore disappear while its session history is
 * still valid. Keep this check deliberately narrow so unrelated 40409 errors
 * continue through the normal diagnostic path.
 */
export function isMissingWorkspaceArchiveError(error: unknown): boolean {
  return (
    isDaemonApiError(error) &&
    error.code === 40409 &&
    /workspace root\s+.+\s+does not exist/i.test(error.message)
  );
}
