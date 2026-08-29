// apps/kimi-web/src/lib/slashCommands.ts
// Pure TS — no Vue, no side effects. Slash-command presentation + parsers.

import { executableCommandMappings, resolveBuiltinCommand } from './commandRegistry';

export interface SlashCommand {
  name: string;
  /**
   * Description text. For built-in commands this is an i18n KEY (resolve with
   * t(desc)); for skills (`isSkill`) it is the skill's RAW description, rendered
   * verbatim.
   */
  desc: string;
  /**
   * True for a session skill (not a built-in command). Selecting one activates
   * the skill instead of running an app command, and its `desc` is raw text.
   */
  isSkill?: boolean;
  /**
   * Selecting the item should leave the command in the composer so the user can
   * type the message/argument that follows it.
   */
  acceptsInput?: boolean;
}

const DESCRIPTION_OVERRIDES: Readonly<Record<string, string>> = {
  clear: 'commands.clear.desc',
};

const MENU_ORDER = [
  'new', 'clear', 'login', 'settings', 'plan', 'swarm', 'goal', 'btw',
  'auto', 'yolo', 'thinking', 'reload', 'compact', 'undo', 'fork', 'title',
  'copy', 'export', 'status',
] as const;
const MENU_ORDER_INDEX = new Map<string, number>(MENU_ORDER.map((name, index) => [name, index]));

/**
 * GUI-presented commands are derived from the exhaustive upstream adapter.
 * Classification lives in commandRegistry.ts; this list is no longer an
 * independent allow-list that can silently drift away from Kimi Code.
 */
export const SLASH_COMMANDS: SlashCommand[] = executableCommandMappings()
  .flatMap((mapping) => mapping.menuNames.map((name) => ({
      name: `/${name}`,
      desc: DESCRIPTION_OVERRIDES[name] ?? mapping.descriptionKey,
      acceptsInput: mapping.acceptsInput,
    })))
  .sort((left, right) =>
    (MENU_ORDER_INDEX.get(left.name.slice(1)) ?? Number.MAX_SAFE_INTEGER) -
    (MENU_ORDER_INDEX.get(right.name.slice(1)) ?? Number.MAX_SAFE_INTEGER));

/**
 * Parse a slash command from the start of the input string.
 * Returns { cmd, arg } if input starts with `/` at line start (no leading whitespace),
 * otherwise returns null.
 *
 * Examples:
 *   "/help"         -> { cmd: "/help", arg: "" }
 *   "/new session"  -> { cmd: "/new", arg: "session" }
 *   "/goal\n目标"   -> { cmd: "/goal", arg: "目标" }
 *   "hello /help"   -> null (slash not at line start)
 *   "  /help"       -> null (leading whitespace)
 */
export function parseSlash(input: string): { cmd: string; arg: string } | null {
  if (!input.startsWith('/')) return null;
  // Must start exactly at position 0 (no leading spaces). Split on the FIRST
  // whitespace of any kind (space, tab, newline) so multi-line arguments like
  // "/goal\n目标" still parse instead of swallowing the whole input as the
  // command token.
  const ws = /\s/.exec(input);
  if (ws === null) {
    return { cmd: input, arg: '' };
  }
  return {
    cmd: input.slice(0, ws.index),
    arg: input.slice(ws.index + 1),
  };
}

/** True for every upstream built-in, including commands hidden from the menu. */
export function isBuiltinSlashCommand(command: string): boolean {
  return resolveBuiltinCommand(command) !== null;
}

/** The prefix marking a slash item as a skill activation (`/skill:<name>`). */
export const SKILL_COMMAND_PREFIX = 'skill:';

/**
 * Strip the `skill:` prefix from a slash-command name (with or without the
 * leading `/`), returning the bare skill name. Non-prefixed input is returned
 * unchanged.
 */
export function stripSkillPrefix(name: string): string {
  return name.startsWith(SKILL_COMMAND_PREFIX) ? name.slice(SKILL_COMMAND_PREFIX.length) : name;
}

/**
 * Build the full slash-item list: built-in commands followed by the session's
 * skills. Non-builtin skills are shown as `/skill:<skill-name>` so the user can
 * tell them apart from built-in commands (mirroring the TUI); builtin-sourced
 * skills keep the bare `/<skill-name>`. Skills carry their raw description and
 * an `isSkill` flag so the caller knows to activate rather than run a command.
 */
export function buildSlashItems(
  skills: ReadonlyArray<{ name: string; description: string; source?: string }> = [],
): SlashCommand[] {
  const skillItems: SlashCommand[] = skills.map((s) => ({
    name: s.source === 'builtin' ? `/${s.name}` : `/${SKILL_COMMAND_PREFIX}${s.name}`,
    desc: s.description,
    isSkill: true,
    // Keep the selected skill in the composer so arguments can be appended.
    acceptsInput: true,
  }));
  return [...SLASH_COMMANDS, ...skillItems];
}

/**
 * Filter slash items by a query string. Matches are ranked so exact and prefix
 * matches come before arbitrary substring matches. If query is empty or just
 * "/", returns all items. Defaults to the built-in commands; pass a merged list
 * (see buildSlashItems) to include skills.
 */
export function filterCommands(
  query: string,
  items: SlashCommand[] = SLASH_COMMANDS,
): SlashCommand[] {
  const q = query.toLowerCase().trim().replace(/^\//, '');
  if (q === '') return items;

  return items
    .map((item, index) => {
      const name = item.name.toLowerCase().replace(/^\//, '');
      let score = 0;
      if (name === q) score = 3;
      else if (name.startsWith(q)) score = 2;
      else if (name.includes(q)) score = 1;
      return { item, index, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}
