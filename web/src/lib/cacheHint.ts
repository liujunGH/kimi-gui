export const CACHE_EXPIRY_HINT_KEY = 'kimi-gui.cache-expiry-hint';

export interface CacheExpiryRule {
  durationSeconds: number;
  minimumTokens: number;
}

/**
 * Snapshot of the official client_configs response (2026-08-06). The upstream
 * intentionally prefers false negatives: unknown models never show a hint.
 */
export const OFFICIAL_CACHE_EXPIRY_RULES: Readonly<Record<string, CacheExpiryRule>> = {
  k3: { durationSeconds: 600, minimumTokens: 200_000 },
  'k3-256k': { durationSeconds: 600, minimumTokens: 200_000 },
  'kimi-for-coding': { durationSeconds: 3_600, minimumTokens: 200_000 },
  'kimi-for-coding-highspeed': { durationSeconds: 3_600, minimumTokens: 200_000 },
};

export interface CacheExpiryHintInput {
  enabled: boolean;
  modelId?: string;
  lastActiveAt?: string | number | Date;
  totalTokens?: number;
  now?: number;
}

export interface CacheExpiryHintDecision {
  shouldHint: boolean;
  modelId?: string;
  idleSeconds?: number;
  rule?: CacheExpiryRule;
}

export function normalizeCacheModelId(modelId?: string): string {
  const value = modelId?.trim().toLowerCase() ?? '';
  return value.split('/').filter(Boolean).at(-1) ?? value;
}

export function decideCacheExpiryHint(input: CacheExpiryHintInput): CacheExpiryHintDecision {
  if (!input.enabled) return { shouldHint: false };
  const modelId = normalizeCacheModelId(input.modelId);
  const rule = OFFICIAL_CACHE_EXPIRY_RULES[modelId];
  if (!rule || !input.lastActiveAt || !Number.isFinite(input.totalTokens)) {
    return { shouldHint: false, modelId: modelId || undefined };
  }
  const lastActiveMs = input.lastActiveAt instanceof Date
    ? input.lastActiveAt.getTime()
    : typeof input.lastActiveAt === 'number'
      ? input.lastActiveAt
      : Date.parse(input.lastActiveAt);
  if (!Number.isFinite(lastActiveMs)) return { shouldHint: false, modelId, rule };
  const idleSeconds = Math.max(0, Math.floor(((input.now ?? Date.now()) - lastActiveMs) / 1_000));
  return {
    shouldHint: idleSeconds > rule.durationSeconds && (input.totalTokens ?? 0) >= rule.minimumTokens,
    modelId,
    idleSeconds,
    rule,
  };
}

export function readCacheExpiryHintEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(CACHE_EXPIRY_HINT_KEY) !== 'false';
}

export function writeCacheExpiryHintEnabled(enabled: boolean): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(CACHE_EXPIRY_HINT_KEY, String(enabled));
}
