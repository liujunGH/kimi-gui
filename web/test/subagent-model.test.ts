import { describe, expect, it } from 'vitest';
import { resolveSubagentModel } from '../src/lib/subagentModel';

describe('resolveSubagentModel', () => {
  it('uses the configured secondary model by default', () => {
    expect(resolveSubagentModel({ primaryModelId: 'main', secondaryModelId: 'fast' })).toEqual({
      route: 'secondary',
      modelId: 'fast',
      basis: 'default',
      inferred: true,
    });
  });

  it('honours an explicit primary model choice', () => {
    expect(resolveSubagentModel({
      parentTool: { arg: JSON.stringify({ model: 'primary' }) },
      primaryModelId: 'main',
      secondaryModelId: 'fast',
    })).toMatchObject({ route: 'primary', modelId: 'main', basis: 'tool' });
  });

  it('resolves a per-member AgentSwarm model choice', () => {
    expect(resolveSubagentModel({
      parentTool: { arg: JSON.stringify({ items: [{ model: 'primary' }, { model: 'secondary' }] }) },
      swarmIndex: 1,
      primaryModelId: 'main',
      secondaryModelId: 'fast',
    })).toMatchObject({ route: 'secondary', modelId: 'fast', basis: 'tool' });
  });

  it('uses the agent profile before the runtime default', () => {
    expect(resolveSubagentModel({
      subagentType: 'reviewer',
      profiles: [{ name: 'reviewer', modelPreference: 'primary' }],
      primaryModelId: 'main',
      secondaryModelId: 'fast',
    })).toMatchObject({ route: 'primary', modelId: 'main', basis: 'profile' });
  });

  it('falls back to the main model when secondary is requested but unconfigured', () => {
    expect(resolveSubagentModel({
      parentTool: { arg: JSON.stringify({ model: 'secondary' }) },
      primaryModelId: 'main',
    })).toMatchObject({ route: 'primary', modelId: 'main', basis: 'fallback' });
  });
});
