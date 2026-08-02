import { describe, expect, it } from 'vitest';
import type { AppOAuthUsage } from '../src/api/types';
import { formatQuotaReset, quotaInfoFromOAuthUsage } from '../src/lib/quotaUsage';

const usage: AppOAuthUsage = {
  kind: 'ok',
  summary: {
    window: { duration: 1, unit: 'week' },
    used: 9,
    limit: 100,
    reset_at: '2026-08-08T14:00:00.000Z',
  },
  limits: [
    {
      window: { duration: 5, unit: 'hour' },
      used: 0,
      limit: 100,
      reset_at: '2026-08-02T15:30:00.000Z',
    },
  ],
  extra_usage: null,
};

describe('OAuth quota usage', () => {
  it('maps the daemon 0.31 window/reset_at schema', () => {
    expect(quotaInfoFromOAuthUsage(usage, Date.parse('2026-08-02T12:00:00.000Z'))).toEqual({
      q5h: 0,
      q5hReset: '3 小时 30 分钟',
      qWeek: 9,
      qWeekReset: '6 天 2 小时',
    });
  });

  it('normalizes non-100 limits into a bounded percentage', () => {
    expect(quotaInfoFromOAuthUsage({
      ...usage,
      summary: { ...usage.summary, used: 3, limit: 8 },
    }, Date.parse('2026-08-02T12:00:00.000Z'))?.qWeek).toBe(38);
  });

  it('formats immediate and invalid reset timestamps safely', () => {
    const now = Date.parse('2026-08-02T12:00:00.000Z');
    expect(formatQuotaReset('2026-08-02T11:59:00.000Z', now)).toBe('即将');
    expect(formatQuotaReset('not-a-date', now)).toBe('');
  });
});
