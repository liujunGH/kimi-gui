import type { Session } from '../../../types';
import type { ThreadStatus } from '../../../types/codex';

/**
 * 把官方 Session 字段推导为侧栏状态点(prototype v2 的 dot 体系)。
 * busy → running;pendingInteraction → needs_input;lastTurnReason → failed;其余 done。
 */
export function sessionToThreadStatus(s: Session): ThreadStatus {
  if (s.busy) return 'running';
  if (s.pendingInteraction === 'approval' || s.pendingInteraction === 'question') return 'needs_input';
  if (s.lastTurnReason === 'failed' || s.lastTurnReason === 'cancelled') return 'failed';
  return 'done';
}

/** needs_input 的 meta 文案(approval → 待批准,question → 待输入)。 */
export function threadMetaOf(s: Session): string {
  if (s.pendingInteraction === 'approval') return '待批准';
  if (s.pendingInteraction === 'question') return '待输入';
  return s.time;
}
