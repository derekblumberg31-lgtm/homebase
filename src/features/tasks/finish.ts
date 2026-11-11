export interface FinishTimeline {
  fillMs: number;
  collapseDelayMs: number;
  collapseMs: number;
  commitMs: number;
}

/**
 * How long each part of the finish takes. The check fills, then the row folds away, then the write
 * happens (writing first would re-render the list mid-collapse). Reduced motion fades only.
 */
export function finishTimeline(trigger: 'check' | 'swipe', reduced: boolean): FinishTimeline {
  const fillMs = trigger === 'check' && !reduced ? 160 : 0;
  const collapseDelayMs = trigger === 'check' ? (reduced ? 150 : 180) : 0;
  const collapseMs = reduced ? 150 : 200;
  return { fillMs, collapseDelayMs, collapseMs, commitMs: collapseDelayMs + collapseMs };
}
