import { describe, expect, it } from 'vitest';
import { decideCacheExpiryHint, normalizeCacheModelId } from './cacheHint';

describe('cache expiry hint', () => {
  it('normalizes provider-prefixed model ids', () => {
    expect(normalizeCacheModelId('kimi/k3-256k')).toBe('k3-256k');
  });

  it('shows only after both the idle and token thresholds are crossed', () => {
    const now = Date.parse('2026-08-06T12:00:00Z');
    expect(decideCacheExpiryHint({
      enabled: true,
      modelId: 'kimi/k3',
      lastActiveAt: '2026-08-06T11:49:00Z',
      totalTokens: 210_000,
      now,
    }).shouldHint).toBe(true);
    expect(decideCacheExpiryHint({
      enabled: true,
      modelId: 'k3',
      lastActiveAt: '2026-08-06T11:59:00Z',
      totalTokens: 210_000,
      now,
    }).shouldHint).toBe(false);
    expect(decideCacheExpiryHint({
      enabled: true,
      modelId: 'k3',
      lastActiveAt: '2026-08-06T11:49:00Z',
      totalTokens: 199_999,
      now,
    }).shouldHint).toBe(false);
  });

  it('prefers false negatives for unknown models and disabled hints', () => {
    expect(decideCacheExpiryHint({ enabled: true, modelId: 'custom/model', lastActiveAt: 1, totalTokens: 999_999 }).shouldHint).toBe(false);
    expect(decideCacheExpiryHint({ enabled: false, modelId: 'k3', lastActiveAt: 1, totalTokens: 999_999 }).shouldHint).toBe(false);
  });
});
