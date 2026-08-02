import type { AppOAuthUsage, AppOAuthUsageBucket } from '../api/types';
import type { QuotaInfo } from '../types/codex';

function percentUsed(bucket: AppOAuthUsageBucket | undefined): number {
  if (!bucket || !Number.isFinite(bucket.used) || !Number.isFinite(bucket.limit) || bucket.limit <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round((bucket.used / bucket.limit) * 100)));
}

export function formatQuotaReset(resetAt: string | undefined, now = Date.now()): string {
  if (!resetAt) return '';
  const reset = Date.parse(resetAt);
  if (!Number.isFinite(reset)) return '';
  const minutes = Math.max(0, Math.ceil((reset - now) / 60_000));
  if (minutes === 0) return '即将';
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return `${hours} 小时${remainingMinutes ? ` ${remainingMinutes} 分钟` : ''}`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days} 天${remainingHours ? ` ${remainingHours} 小时` : ''}`;
}

export function quotaInfoFromOAuthUsage(
  usage: AppOAuthUsage | null | undefined,
  now = Date.now(),
): QuotaInfo | null {
  if (!usage || usage.kind !== 'ok' || !usage.summary) return null;
  const hourly = usage.limits?.find(
    (limit) => limit.window?.duration === 5 && /^hours?$/i.test(limit.window.unit),
  );
  return {
    q5h: percentUsed(hourly),
    q5hReset: formatQuotaReset(hourly?.reset_at, now),
    qWeek: percentUsed(usage.summary),
    qWeekReset: formatQuotaReset(usage.summary.reset_at, now),
  };
}
