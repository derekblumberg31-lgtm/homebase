import { describe, expect, it } from 'vitest';
import { finishTimeline } from './finish';

describe('finishTimeline', () => {
  it('matches the table', () => {
    expect(finishTimeline('check', false)).toEqual({ fillMs: 160, collapseDelayMs: 180, collapseMs: 200, commitMs: 380 });
    expect(finishTimeline('check', true)).toEqual({ fillMs: 0, collapseDelayMs: 150, collapseMs: 150, commitMs: 300 });
    expect(finishTimeline('swipe', false)).toEqual({ fillMs: 0, collapseDelayMs: 0, collapseMs: 200, commitMs: 200 });
    expect(finishTimeline('swipe', true)).toEqual({ fillMs: 0, collapseDelayMs: 0, collapseMs: 150, commitMs: 150 });
  });

  it('commits after the delay plus the collapse, within 400 ms', () => {
    for (const trigger of ['check', 'swipe'] as const) {
      for (const reduced of [false, true]) {
        const t = finishTimeline(trigger, reduced);
        expect(t.commitMs).toBe(t.collapseDelayMs + t.collapseMs);
        expect(t.commitMs).toBeLessThanOrEqual(400);
      }
    }
  });
});
