import type { TurnBlock } from '../types';

export type WorkTurnBlock = Exclude<TurnBlock, { kind: 'text' }>;

export interface IndexedWorkBlock {
  block: WorkTurnBlock;
  sourceIndex: number;
}

export type AssistantDisplayUnit =
  | {
      kind: 'text';
      block: Extract<TurnBlock, { kind: 'text' }>;
      sourceIndex: number;
    }
  | {
      kind: 'work';
      entries: IndexedWorkBlock[];
      sourceIndex: number;
    };

/**
 * Collapse consecutive thinking/tool blocks into one visual work unit while
 * preserving the transcript order around text. Approval/question surfaces are
 * not TurnBlocks and remain outside these groups, so action-required UI can
 * never be hidden by the summary.
 */
export function groupAssistantWork(blocks: TurnBlock[]): AssistantDisplayUnit[] {
  const units: AssistantDisplayUnit[] = [];
  let pending: IndexedWorkBlock[] = [];

  const flush = (): void => {
    const first = pending[0];
    if (!first) return;
    units.push({ kind: 'work', entries: pending, sourceIndex: first.sourceIndex });
    pending = [];
  };

  blocks.forEach((block, sourceIndex) => {
    if (block.kind === 'text') {
      flush();
      if (block.text) units.push({ kind: 'text', block, sourceIndex });
      return;
    }
    pending.push({ block, sourceIndex });
  });
  flush();
  return units;
}

export function workStats(entries: IndexedWorkBlock[]): {
  tools: number;
  thinking: number;
  errors: number;
  running: number;
} {
  let tools = 0;
  let thinking = 0;
  let errors = 0;
  let running = 0;
  for (const { block } of entries) {
    if (block.kind === 'thinking') {
      thinking += 1;
      continue;
    }
    tools += 1;
    if (block.tool.status === 'error') errors += 1;
    if (block.tool.status === 'running') running += 1;
  }
  return { tools, thinking, errors, running };
}
