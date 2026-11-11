export interface FinishTimeline {
  fillMs: number;
  collapseDelayMs: number;
  collapseMs: number;
  commitMs: number;
}

/** How long each part of the finish takes: fill, fold, then write. Reduced motion fades only. */
export function finishTimeline(trigger: 'check' | 'swipe', reduced: boolean): FinishTimeline {
  const fillMs = trigger === 'check' && !reduced ? 160 : 0;
  const collapseDelayMs = trigger === 'check' ? (reduced ? 150 : 180) : 0;
  const collapseMs = reduced ? 150 : 200;
  return { fillMs, collapseDelayMs, collapseMs, commitMs: collapseDelayMs + collapseMs };
}
