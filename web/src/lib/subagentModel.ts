import type { ToolCall } from '../types';

export type SubagentModelRoute = 'primary' | 'secondary';
export type SubagentModelBasis = 'tool' | 'profile' | 'default' | 'fallback';

export interface SubagentModelProfile {
  name: string;
  modelPreference?: SubagentModelRoute;
}

export interface SubagentModelResolution {
  route: SubagentModelRoute;
  modelId?: string;
  basis: SubagentModelBasis;
  /** The daemon's subagent lifecycle events do not currently carry a model.
   *  This value is reconstructed from the spawn argument/profile/config. */
  inferred: true;
}

interface ResolveSubagentModelInput {
  parentTool?: Pick<ToolCall, 'arg'>;
  swarmIndex?: number;
  subagentType?: string;
  profiles?: readonly SubagentModelProfile[];
  primaryModelId?: string;
  secondaryModelId?: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function route(value: unknown): SubagentModelRoute | undefined {
  return value === 'primary' || value === 'secondary' ? value : undefined;
}

function parseToolArg(arg: string | undefined): Record<string, unknown> | undefined {
  if (!arg) return undefined;
  try {
    return record(JSON.parse(arg));
  } catch {
    return undefined;
  }
}

/** Resolve the spawn-time model route used by Kimi Code 0.31+.
 *
 * The lifecycle event does not include the bound model, so this intentionally
 * returns an `inferred` result. The order mirrors the runtime: an explicit
 * Agent/AgentSwarm `model` choice, then the selected agent profile, then the
 * configured secondary model (the runtime default), otherwise the main model.
 */
export function resolveSubagentModel(input: ResolveSubagentModelInput): SubagentModelResolution {
  const args = parseToolArg(input.parentTool?.arg);
  let requested = route(args?.['model']);

  if (!requested && input.swarmIndex !== undefined) {
    for (const key of ['items', 'tasks', 'subagents'] as const) {
      const entries = args?.[key];
      if (!Array.isArray(entries)) continue;
      requested = route(record(entries[input.swarmIndex])?.['model']);
      if (requested) break;
    }
  }

  let basis: SubagentModelBasis = 'tool';
  if (!requested && input.subagentType) {
    requested = input.profiles?.find((profile) => profile.name === input.subagentType)?.modelPreference;
    if (requested) basis = 'profile';
  }

  if (!requested) {
    requested = input.secondaryModelId ? 'secondary' : 'primary';
    basis = 'default';
  }

  // Asking for secondary without a configured recipe falls back to the
  // caller's own model in the runtime resolver.
  if (requested === 'secondary' && !input.secondaryModelId) {
    return {
      route: 'primary',
      modelId: input.primaryModelId,
      basis: 'fallback',
      inferred: true,
    };
  }

  return {
    route: requested,
    modelId: requested === 'secondary' ? input.secondaryModelId : input.primaryModelId,
    basis,
    inferred: true,
  };
}
