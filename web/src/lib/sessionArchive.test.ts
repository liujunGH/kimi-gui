import { describe, expect, it } from 'vitest';
import { DaemonApiError } from '../api/errors';
import { isMissingWorkspaceArchiveError } from './sessionArchive';

describe('isMissingWorkspaceArchiveError', () => {
  it('recognizes the Kimi 0.33 orphan-worktree archive failure', () => {
    expect(
      isMissingWorkspaceArchiveError(
        new DaemonApiError({
          code: 40409,
          msg: 'workspace root /private/tmp/project/worktrees/agent-123 does not exist',
          requestId: 'req-1',
        }),
      ),
    ).toBe(true);
  });

  it('does not hide unrelated daemon failures', () => {
    expect(
      isMissingWorkspaceArchiveError(
        new DaemonApiError({
          code: 40409,
          msg: 'session does not exist',
          requestId: 'req-2',
        }),
      ),
    ).toBe(false);
    expect(
      isMissingWorkspaceArchiveError(
        new DaemonApiError({
          code: 50001,
          msg: 'workspace root /tmp/missing does not exist',
          requestId: 'req-3',
        }),
      ),
    ).toBe(false);
  });
});
