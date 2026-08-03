import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const snapshotUrl = new URL('../src/lib/upstreamSlashCommands.json', import.meta.url);
const snapshot = JSON.parse(await readFile(snapshotUrl, 'utf8'));
const args = new Set(process.argv.slice(2));
const useLatest = args.has('--latest');
const shouldWrite = args.has('--write');
let ref = useLatest ? 'main' : snapshot.source.ref;
if (useLatest && shouldWrite) {
  const commitResponse = await fetch(
    `https://api.github.com/repos/${snapshot.source.repository}/commits/main`,
    { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'kimi-gui-command-sync' } },
  );
  if (!commitResponse.ok) throw new Error(`Unable to resolve upstream main (${commitResponse.status})`);
  const commit = await commitResponse.json();
  if (typeof commit.sha !== 'string') throw new Error('Upstream commit response did not contain a SHA');
  ref = commit.sha;
}
const sourceUrl = `https://api.github.com/repos/${snapshot.source.repository}/contents/${snapshot.source.path}?ref=${encodeURIComponent(ref)}`;

const response = await fetch(sourceUrl, {
  headers: {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'kimi-gui-command-sync',
  },
});
if (!response.ok) {
  throw new Error(`Unable to fetch upstream command registry (${response.status}): ${sourceUrl}`);
}

const payload = await response.json();
if (typeof payload.content !== 'string' || payload.encoding !== 'base64') {
  throw new Error('Upstream registry response did not contain base64 file content');
}
const source = Buffer.from(payload.content.replaceAll('\n', ''), 'base64').toString('utf8');
const startMarker = 'export const BUILTIN_SLASH_COMMANDS = [';
const start = source.indexOf(startMarker);
const end = source.indexOf('] as const satisfies', start);
if (start < 0 || end < 0) throw new Error('Unable to locate BUILTIN_SLASH_COMMANDS in upstream source');
const block = source.slice(start + startMarker.length, end);

const commands = [];
const itemPattern = /\{\s*name:\s*'([^']+)',\s*aliases:\s*\[([^\]]*)\]/g;
for (const match of block.matchAll(itemPattern)) {
  const aliases = [...(match[2] ?? '').matchAll(/'([^']+)'/g)].map((item) => item[1]);
  commands.push({ name: match[1], aliases });
}
if (commands.length === 0) throw new Error('Parsed zero upstream commands');

const current = JSON.stringify(snapshot.commands);
const next = JSON.stringify(commands);
if (current === next) {
  console.log(`Command snapshot matches ${snapshot.source.repository}@${ref} (${commands.length} commands).`);
  process.exit(0);
}

const currentNames = new Set(snapshot.commands.map((item) => item.name));
const nextNames = new Set(commands.map((item) => item.name));
const added = [...nextNames].filter((name) => !currentNames.has(name));
const removed = [...currentNames].filter((name) => !nextNames.has(name));
console.error(`Command snapshot differs from ${snapshot.source.repository}@${ref}.`);
if (added.length > 0) console.error(`Added: ${added.map((name) => `/${name}`).join(', ')}`);
if (removed.length > 0) console.error(`Removed: ${removed.map((name) => `/${name}`).join(', ')}`);

if (!shouldWrite) {
  console.error('Run commands:sync-latest to update the snapshot, then classify every reported command.');
  process.exit(1);
}

snapshot.commands = commands;
if (useLatest) snapshot.source.ref = ref;
await writeFile(fileURLToPath(snapshotUrl), `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Updated ${fileURLToPath(snapshotUrl)} (${commands.length} commands).`);
