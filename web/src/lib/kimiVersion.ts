export const MINIMUM_KIMI_CODE_VERSION = '0.33.0';

function parts(version: string): [number, number, number] | null {
  const match = version.match(/(?:^|\s|v)(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareKimiVersions(left: string, right: string): number | null {
  const a = parts(left);
  const b = parts(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

export function supportsKimiContract(version: string, backend: 'v1' | 'v2'): boolean {
  const relation = compareKimiVersions(version, MINIMUM_KIMI_CODE_VERSION);
  return relation !== null && relation >= 0 && backend === 'v2';
}
