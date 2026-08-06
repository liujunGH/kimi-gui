import { describe, expect, it } from 'vitest';
import { compareKimiVersions, supportsKimiContract } from './kimiVersion';

describe('Kimi Code contract version gate', () => {
  it('accepts 0.33+ on the v2 backend', () => {
    expect(supportsKimiContract('0.33.0', 'v2')).toBe(true);
    expect(supportsKimiContract('kimi 0.34.1', 'v2')).toBe(true);
  });

  it('rejects older versions and the legacy backend', () => {
    expect(supportsKimiContract('0.32.9', 'v2')).toBe(false);
    expect(supportsKimiContract('0.33.0', 'v1')).toBe(false);
    expect(supportsKimiContract('unknown', 'v2')).toBe(false);
  });

  it('compares semantic triples without lexical ordering bugs', () => {
    expect(compareKimiVersions('0.33.10', '0.33.2')).toBeGreaterThan(0);
  });
});
