// GUI command adapter for the upstream Kimi Code slash-command catalog.
//
// Upstream owns command names and aliases. This file owns the desktop/Web
// presentation and executor mapping that upstream currently does not expose.
// Every upstream command must have exactly one mapping; the invariant below and
// commandRegistry.test.ts make new upstream commands fail loudly instead of
// disappearing from the GUI's hand-maintained allow-list.

import upstreamCatalog from './upstreamSlashCommands.json';

export type CommandSurface = 'shared' | 'gui' | 'tui';
export type CommandAvailability = 'always' | 'idle-only' | 'contextual';
export type GuiCommandAction =
  | 'addDir'
  | 'auto'
  | 'btw'
  | 'compact'
  | 'copy'
  | 'exportDebugZip'
  | 'fork'
  | 'feedback'
  | 'goal'
  | 'help'
  | 'init'
  | 'login'
  | 'new'
  | 'plan'
  | 'reload'
  | 'settings'
  | 'status'
  | 'swarm'
  | 'thinking'
  | 'title'
  | 'undo'
  | 'exportMarkdown'
  | 'yolo';

interface CommandMappingBase {
  surface: CommandSurface;
  availability: CommandAvailability;
}

export interface ExecutableCommandMapping extends CommandMappingBase {
  kind: 'command';
  action: GuiCommandAction;
  /** Tokens intentionally presented in the GUI menu, without the leading /. */
  menuNames: readonly string[];
  descriptionKey: string;
  acceptsInput?: boolean;
}

export interface NativeUiCommandMapping extends CommandMappingBase {
  kind: 'native-ui';
  /** i18n key for the location shown when somebody types the hidden command. */
  locationKey: string;
}

export interface TuiOnlyCommandMapping extends CommandMappingBase {
  kind: 'tui-only';
}

export interface UnavailableCommandMapping extends CommandMappingBase {
  kind: 'unavailable';
  reason: 'daemon-api' | 'not-implemented';
}

export type CommandMapping =
  | ExecutableCommandMapping
  | NativeUiCommandMapping
  | TuiOnlyCommandMapping
  | UnavailableCommandMapping;

/**
 * Explicit classification of the complete Kimi Code 0.33.0 TUI catalog.
 *
 * `native-ui` means the capability already has a first-class GUI location and
 * should not duplicate the menu. `tui-only` has terminal-specific semantics.
 * `unavailable` is a real cross-surface gap that the current Web daemon API
 * cannot execute yet. `command` is wired through the GUI command dispatcher.
 */
export const GUI_COMMAND_MAPPINGS: Readonly<Record<string, CommandMapping>> = {
  yolo: command('shared', 'always', 'yolo', ['yolo'], 'commands.yolo.desc'),
  auto: command('shared', 'always', 'auto', ['auto'], 'commands.auto.desc'),
  permission: nativeUi('gui', 'always', 'commands.locations.permission'),
  settings: command('gui', 'always', 'settings', ['settings'], 'commands.settings.desc'),
  plan: command('shared', 'contextual', 'plan', ['plan'], 'commands.plan.desc'),
  swarm: command('shared', 'idle-only', 'swarm', ['swarm'], 'commands.swarm.desc', true),
  model: nativeUi('gui', 'always', 'commands.locations.model'),
  secondary_model: nativeUi('gui', 'always', 'commands.locations.secondaryModel'),
  effort: command('shared', 'always', 'thinking', ['thinking'], 'commands.thinking.desc'),
  provider: nativeUi('gui', 'always', 'commands.locations.provider'),
  btw: command('shared', 'always', 'btw', ['btw'], 'commands.btw.desc', true),
  help: command('gui', 'always', 'help', ['help'], 'commands.help.desc'),
  new: command('shared', 'idle-only', 'new', ['new', 'clear'], 'commands.new.desc'),
  sessions: nativeUi('gui', 'idle-only', 'commands.locations.sessions'),
  tasks: nativeUi('gui', 'always', 'commands.locations.tasks'),
  mcp: nativeUi('gui', 'always', 'commands.locations.mcp'),
  plugins: nativeUi('gui', 'always', 'commands.locations.plugins'),
  'add-dir': command('shared', 'idle-only', 'addDir', ['add-dir'], 'commands.addDir.desc', true),
  experiments: nativeUi('gui', 'idle-only', 'commands.locations.experiments'),
  reload: command('shared', 'idle-only', 'reload', ['reload'], 'commands.reload.desc'),
  'reload-tui': tuiOnly('always'),
  compact: command('shared', 'idle-only', 'compact', ['compact'], 'commands.compact.desc', true),
  goal: command('shared', 'contextual', 'goal', ['goal'], 'commands.goal.desc', true),
  init: command('shared', 'idle-only', 'init', ['init'], 'commands.init.desc'),
  fork: command('shared', 'idle-only', 'fork', ['fork'], 'commands.fork.desc'),
  title: command('shared', 'always', 'title', ['title'], 'commands.title.desc', true),
  usage: nativeUi('gui', 'always', 'commands.locations.usage'),
  status: command('shared', 'always', 'status', ['status'], 'commands.status.desc'),
  feedback: command('gui', 'always', 'feedback', ['feedback'], 'commands.feedback.desc'),
  undo: command('shared', 'idle-only', 'undo', ['undo'], 'commands.undo.desc'),
  editor: tuiOnly('always'),
  theme: nativeUi('gui', 'always', 'commands.locations.theme'),
  logout: nativeUi('gui', 'idle-only', 'commands.locations.account'),
  login: command('shared', 'idle-only', 'login', ['login'], 'commands.login.desc'),
  'export-md': command('shared', 'idle-only', 'exportMarkdown', ['export-md'], 'commands.exportMarkdown.desc'),
  // `/export` was already public in kimi-gui as the debug ZIP action before
  // upstream added the `/export` alias for export-md. Keep the installed GUI's
  // behavior stable and make the divergence explicit here.
  'export-debug-zip': command(
    'shared',
    'idle-only',
    'exportDebugZip',
    ['export'],
    'commands.export.desc',
  ),
  copy: command('shared', 'always', 'copy', ['copy'], 'commands.copy.desc'),
  web: tuiOnly('always'),
  exit: nativeUi('gui', 'idle-only', 'commands.locations.exit'),
  version: nativeUi('gui', 'always', 'commands.locations.about'),
};

function command(
  surface: CommandSurface,
  availability: CommandAvailability,
  action: GuiCommandAction,
  menuNames: readonly string[],
  descriptionKey: string,
  acceptsInput = false,
): ExecutableCommandMapping {
  return { kind: 'command', surface, availability, action, menuNames, descriptionKey, acceptsInput };
}

function nativeUi(
  surface: CommandSurface,
  availability: CommandAvailability,
  locationKey: string,
): NativeUiCommandMapping {
  return { kind: 'native-ui', surface, availability, locationKey };
}

function tuiOnly(availability: CommandAvailability): TuiOnlyCommandMapping {
  return { kind: 'tui-only', surface: 'tui', availability };
}

export interface UpstreamCommandDescriptor {
  name: string;
  aliases: readonly string[];
}

export const UPSTREAM_COMMAND_SOURCE = upstreamCatalog.source;
export const UPSTREAM_COMMANDS = upstreamCatalog.commands as readonly UpstreamCommandDescriptor[];

export function commandMappingIssues(
  commands: readonly UpstreamCommandDescriptor[] = UPSTREAM_COMMANDS,
  mappings: Readonly<Record<string, CommandMapping>> = GUI_COMMAND_MAPPINGS,
): string[] {
  const upstreamNames = new Set(commands.map((item) => item.name));
  const missing = [...upstreamNames].filter((name) => mappings[name] === undefined);
  const stale = Object.keys(mappings).filter((name) => !upstreamNames.has(name));
  const duplicateMenuNames: string[] = [];
  const seenMenuNames = new Map<string, string>();
  for (const [canonicalName, mapping] of Object.entries(mappings)) {
    if (mapping.kind !== 'command') continue;
    for (const menuName of mapping.menuNames) {
      const previous = seenMenuNames.get(menuName);
      if (previous !== undefined) duplicateMenuNames.push(`${menuName} (${previous}, ${canonicalName})`);
      else seenMenuNames.set(menuName, canonicalName);
    }
  }
  return [
    ...missing.map((name) => `missing mapping: /${name}`),
    ...stale.map((name) => `stale mapping: /${name}`),
    ...duplicateMenuNames.map((name) => `duplicate GUI menu token: /${name}`),
  ];
}

const mappingIssues = commandMappingIssues();
if (mappingIssues.length > 0) {
  throw new Error(`Invalid GUI slash-command mapping:\n${mappingIssues.join('\n')}`);
}

// Upstream owns `/export` as an alias of export-md, while kimi-gui has long
// exposed it as export-debug-zip. This explicit override is preferable to
// depending on insertion order in the upstream aliases array.
const TOKEN_OVERRIDES: Readonly<Record<string, string>> = {
  export: 'export-debug-zip',
};

const canonicalByToken = new Map<string, string>();
for (const descriptor of UPSTREAM_COMMANDS) {
  canonicalByToken.set(descriptor.name, descriptor.name);
  for (const alias of descriptor.aliases) canonicalByToken.set(alias, descriptor.name);
}
for (const [token, canonicalName] of Object.entries(TOKEN_OVERRIDES)) {
  canonicalByToken.set(token, canonicalName);
}

export interface ResolvedBuiltinCommand {
  canonicalName: string;
  token: string;
  mapping: CommandMapping;
}

export function resolveBuiltinCommand(tokenWithSlash: string): ResolvedBuiltinCommand | null {
  const token = tokenWithSlash.replace(/^\//, '').toLowerCase();
  const canonicalName = canonicalByToken.get(token);
  if (canonicalName === undefined) return null;
  const mapping = GUI_COMMAND_MAPPINGS[canonicalName];
  return mapping === undefined ? null : { canonicalName, token, mapping };
}

export function executableCommandMappings(): ExecutableCommandMapping[] {
  return Object.values(GUI_COMMAND_MAPPINGS).filter(
    (mapping): mapping is ExecutableCommandMapping => mapping.kind === 'command',
  );
}
