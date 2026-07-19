/**
 * approvalMapper —— api/types 的 AppApprovalRequest → 组件契约 ApprovalRequestSummary
 *
 * 转换逻辑对齐 useKimiWebClient 私有的 buildApprovalBlock(shell/diff/plan 主路径,
 * 其余 kind 退化为 generic)。官方 diff 行是 { kind:'ctx'|'add'|'rem', gutter, text },
 * 行号从首行 gutter 解析做近似(准确行号待轮次 4 让 DiffHunk 直接带 gutter)。
 */
import type { AppApprovalRequest } from '../../../api/types';
import type { ApprovalBlock } from '../../../types';
import type { ApprovalRequestSummary, DiffHunk } from '../../../types/codex';

interface OfficialDiffLine {
  kind: 'ctx' | 'add' | 'rem';
  gutter: string;
  text: string;
}

interface DisplayDict {
  kind?: string;
  path?: string;
  diff?: OfficialDiffLine[];
  command?: string;
  cwd?: string;
  danger?: string;
  plan?: string;
  content?: string;
  summary?: string;
  language?: string;
}

export function toApprovalSummary(a: AppApprovalRequest): ApprovalRequestSummary {
  const d = (a.display ?? {}) as DisplayDict;
  const kind = typeof d.kind === 'string' ? d.kind : '';

  if (kind === 'diff') {
    return {
      approvalId: a.approvalId,
      kind: 'diff',
      title: '应用修改?',
      path: d.path ?? '',
      diff: toHunks(Array.isArray(d.diff) ? d.diff : []),
    };
  }
  if (kind === 'shell' || kind === 'command') {
    const command = typeof d.command === 'string' ? d.command : a.action;
    return {
      approvalId: a.approvalId,
      kind: 'shell',
      title: '运行命令?',
      command,
      path: command,
    };
  }
  if (kind === 'plan_review' || kind === 'plan') {
    return {
      approvalId: a.approvalId,
      kind: 'plan_review',
      title: '审查计划?',
      plan: d.plan ?? d.content ?? '',
      path: d.path,
    };
  }
  return {
    approvalId: a.approvalId,
    kind: 'generic',
    title: d.summary ?? a.action ?? '需要审批?',
  };
}

function toHunks(lines: OfficialDiffLine[]): DiffHunk[] {
  if (!lines.length) return [];
  // 从首行 gutter 解析近似起始行号(ctx "old new" / rem "old" / add "new")
  const first = lines[0];
  let oldStart = 1;
  let newStart = 1;
  if (first) {
    const parts = first.gutter.trim().split(/\s+/).map((s) => parseInt(s, 10));
    if (first.kind === 'rem') {
      oldStart = parts[0] || 1;
      newStart = Math.max(1, oldStart - 1);
    } else if (first.kind === 'add') {
      newStart = parts[0] || 1;
      oldStart = Math.max(1, newStart - 1);
    } else {
      oldStart = parts[0] || 1;
      newStart = parts[1] ?? parts[0] ?? 1;
    }
  }
  return [
    {
      oldStart,
      newStart,
      lines: lines.map((l) => ({
        kind: l.kind === 'add' ? 'add' : l.kind === 'rem' ? 'del' : 'context',
        text: l.text,
      })),
    },
  ];
}

/** ChatTurn.approval(官方 ApprovalBlock)→ ApprovalRequestSummary(turn 内联渲染用) */
export function fromApprovalBlock(block: ApprovalBlock, approvalId: string): ApprovalRequestSummary {
  switch (block.kind) {
    case 'shell':
      return { approvalId, kind: 'shell', title: '运行命令?', command: block.command, path: block.command };
    case 'diff':
      return {
        approvalId,
        kind: 'diff',
        title: '应用修改?',
        path: block.path,
        diff: toHunks(block.diff as OfficialDiffLine[]),
      };
    case 'plan_review':
      return { approvalId, kind: 'plan_review', title: '审查计划?', plan: block.plan, path: block.path };
    case 'file':
      return { approvalId, kind: 'file', title: '应用修改?', path: block.path };
    case 'fileop':
      return { approvalId, kind: 'fileop', title: '应用修改?', path: block.path };
    case 'url':
      return { approvalId, kind: 'url', title: '访问 URL?', path: block.url };
    case 'search':
      return { approvalId, kind: 'search', title: '搜索?', path: block.query };
    case 'invocation':
      return { approvalId, kind: 'invocation', title: '运行命令?', command: block.name, path: block.name };
    case 'todo':
      return { approvalId, kind: 'todo', title: '更新任务清单?', plan: block.items.map((i) => i.title).join('\n') };
    default:
      return { approvalId, kind: 'generic', title: block.summary ?? '需要审批?' };
  }
}
