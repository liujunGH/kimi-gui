import { describe, expect, it } from 'vitest';
import { buildProviderWriteModels, parseProviderModelNames, providerModelName } from './providerConfig';

describe('provider config helpers', () => {
  it('normalizes aliases and deduplicates model input', () => {
    expect(providerModelName('local', 'local/model-a')).toBe('model-a');
    expect(parseProviderModelNames('model-a\nmodel-b, model-a')).toEqual(['model-a', 'model-b']);
  });

  it('preserves hidden model metadata while assigning context to new models', () => {
    const result = buildProviderWriteModels(
      'local',
      ['model-a', 'model-new'],
      64_000,
      {
        'local/model-a': {
          provider: 'local',
          model: 'model-a',
          maxContextSize: 256_000,
          maxOutputSize: 16_000,
          capabilities: ['vision'],
          supportEfforts: ['low', 'high'],
          adaptiveThinking: true,
        },
      },
      [],
    );

    expect(result).toEqual([
      {
        model: 'model-a',
        maxContextSize: 256_000,
        displayName: undefined,
        capabilities: ['vision'],
        maxOutputSize: 16_000,
        supportEfforts: ['low', 'high'],
        adaptiveThinking: true,
      },
      {
        model: 'model-new',
        maxContextSize: 64_000,
        displayName: undefined,
        capabilities: undefined,
        supportEfforts: undefined,
      },
    ]);
  });
});
