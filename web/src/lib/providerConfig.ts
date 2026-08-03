import type { AppModel, AppProviderModelInput } from '../api/types';

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function stringField(value: UnknownRecord, camel: string, snake: string): string | undefined {
  const field = value[camel] ?? value[snake];
  return typeof field === 'string' && field.trim() ? field.trim() : undefined;
}

function numberField(value: UnknownRecord, camel: string, snake: string): number | undefined {
  const field = value[camel] ?? value[snake];
  return typeof field === 'number' && Number.isFinite(field) && field > 0 ? field : undefined;
}

function stringArrayField(value: UnknownRecord, camel: string, snake: string): string[] | undefined {
  const field = value[camel] ?? value[snake];
  if (!Array.isArray(field)) return undefined;
  const strings = field.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return strings.length > 0 ? strings : undefined;
}

export function providerModelName(providerId: string, aliasOrModel: string): string {
  const prefix = `${providerId}/`;
  return aliasOrModel.startsWith(prefix) ? aliasOrModel.slice(prefix.length) : aliasOrModel;
}

export function parseProviderModelNames(value: string): string[] {
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
}

/** Build the daemon's full replace payload without exposing credentials.
 * Metadata for unchanged models comes from GET /config; catalog data and the
 * user-selected default context are only fallbacks for newly added models. */
export function buildProviderWriteModels(
  providerId: string,
  requestedNames: string[],
  newModelContextSize: number,
  configModels: Record<string, unknown> | undefined,
  catalog: AppModel[],
): AppProviderModelInput[] {
  const existingByName = new Map<string, AppProviderModelInput>();
  for (const [alias, value] of Object.entries(configModels ?? {})) {
    const model = record(value);
    if (!model || stringField(model, 'provider', 'provider') !== providerId) continue;
    const name = stringField(model, 'model', 'model') ?? providerModelName(providerId, alias);
    const maxContextSize = numberField(model, 'maxContextSize', 'max_context_size');
    if (!maxContextSize) continue;
    const adaptive = model['adaptiveThinking'] ?? model['adaptive_thinking'];
    existingByName.set(name, {
      model: name,
      maxContextSize,
      displayName: stringField(model, 'displayName', 'display_name'),
      capabilities: stringArrayField(model, 'capabilities', 'capabilities'),
      maxOutputSize: numberField(model, 'maxOutputSize', 'max_output_size'),
      supportEfforts: stringArrayField(model, 'supportEfforts', 'support_efforts'),
      adaptiveThinking: typeof adaptive === 'boolean' ? adaptive : undefined,
    });
  }

  const catalogByName = new Map(
    catalog
      .filter((model) => model.provider === providerId)
      .map((model) => [model.model, model] as const),
  );
  const fallbackContext = Number.isFinite(newModelContextSize) && newModelContextSize > 0
    ? Math.floor(newModelContextSize)
    : 128_000;

  return [...new Set(requestedNames.map((name) => name.trim()).filter(Boolean))].map((name) => {
    const existing = existingByName.get(name);
    if (existing) return existing;
    const known = catalogByName.get(name);
    return {
      model: name,
      maxContextSize: known?.maxContextSize ?? fallbackContext,
      displayName: known?.displayName,
      capabilities: known?.capabilities,
      supportEfforts: known?.supportEfforts ? [...known.supportEfforts] : undefined,
    };
  });
}
