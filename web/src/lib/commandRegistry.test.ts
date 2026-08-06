import { describe, expect, it } from 'vitest';
import {
  commandMappingIssues,
  executableCommandMappings,
  GUI_COMMAND_MAPPINGS,
  resolveBuiltinCommand,
  UPSTREAM_COMMANDS,
} from './commandRegistry';

describe('GUI slash-command registry', () => {
  it('classifies every upstream command exactly once', () => {
    expect(UPSTREAM_COMMANDS).toHaveLength(40);
    expect(commandMappingIssues()).toEqual([]);
    expect(Object.keys(GUI_COMMAND_MAPPINGS)).toHaveLength(UPSTREAM_COMMANDS.length);
  });

  it('keeps upstream aliases resolvable even when they are hidden from the GUI menu', () => {
    expect(resolveBuiltinCommand('/config')?.canonicalName).toBe('settings');
    expect(resolveBuiltinCommand('/thinking')?.canonicalName).toBe('effort');
    expect(resolveBuiltinCommand('/clear')?.canonicalName).toBe('new');
    expect(resolveBuiltinCommand('/bug')?.canonicalName).toBe('feedback');
  });

  it('records the intentional legacy /export override explicitly', () => {
    expect(resolveBuiltinCommand('/export')?.canonicalName).toBe('export-debug-zip');
    expect(resolveBuiltinCommand('/export-md')?.canonicalName).toBe('export-md');
  });

  it('exposes reload as a mapped GUI command instead of silently dropping it', () => {
    const reload = resolveBuiltinCommand('/reload');
    expect(reload?.mapping.kind).toBe('command');
    expect(reload?.mapping.surface).toBe('shared');
    expect(executableCommandMappings().some((item) => item.action === 'reload')).toBe(true);
  });
});
