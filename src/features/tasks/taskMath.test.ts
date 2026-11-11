import { describe, expect, it } from 'vitest';
import type { Task } from '../../data/types';
import { toDateInput } from '../../lib/dates';
import { presetCostHint } from './presets';
import { annualCost, compareUrgency, countdownText, getTaskInfo, lastDoneKnown, withInfo } from './taskMath';

const now = new Date(2026, 9, 27, 12).getTime();
const daysAgo = (n: number) => toDateInput(new Date(2026, 9, 27 - n));

function task(partial: Partial<Task>): Task {
  return {
    id: partial.id ?? 't',
    kind: 'maintenance',
    name: 'Swap HVAC filter',
    typeId: 'custom',
    location: 'Hallway',
    lastDoneAt: daysAgo(0),
    intervalDays: 90,
    recurring: true,
    status: 'open',
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

describe('getTaskInfo', () => {
  it('counts down to the next repeat of a recurring task', () => {
    const info = getTaskInfo(task({ lastDoneAt: daysAgo(80), intervalDays: 90 }), now);
    expect(info.daysLeft).toBe(10);
    expect(info.status).toBe('due');
  });

  it('marks a task overdue the day after it was due', () => {
    expect(getTaskInfo(task({ lastDoneAt: daysAgo(91), intervalDays: 90 }), now).status).toBe('overdue');
  });

  it('uses the due date for one-off repairs', () => {
    const info = getTaskInfo(task({ recurring: false, kind: 'repair', dueDate: toDateInput(new Date(2026, 10, 30)) }), now);
    expect(info.daysLeft).toBe(34);
    expect(info.status).toBe('healthy');
  });

  it('reports finished one-offs as done', () => {
    expect(getTaskInfo(task({ recurring: false, status: 'done', dueDate: daysAgo(3) }), now).status).toBe('done');
  });
});

describe('countdownText', () => {
  it('uses the largest whole unit', () => {
    expect(countdownText(getTaskInfo(task({ lastDoneAt: daysAgo(0), intervalDays: 120 }), now))).toBe('4 months');
    expect(countdownText(getTaskInfo(task({ lastDoneAt: daysAgo(0), intervalDays: 15 }), now))).toBe('2 weeks');
    expect(countdownText(getTaskInfo(task({ lastDoneAt: daysAgo(0), intervalDays: 5 }), now))).toBe('5 days');
    expect(countdownText(getTaskInfo(task({ lastDoneAt: daysAgo(1), intervalDays: 2 }), now))).toBe('Tomorrow');
    expect(countdownText(getTaskInfo(task({ lastDoneAt: daysAgo(3), intervalDays: 3 }), now))).toBe('Today');
    expect(countdownText(getTaskInfo(task({ lastDoneAt: daysAgo(12), intervalDays: 10 }), now))).toBe('2 days over');
  });
});

describe('ordering and cost', () => {
  it('sorts overdue first, then soonest', () => {
    const items = withInfo(
      [
        task({ id: 'later', lastDoneAt: daysAgo(0), intervalDays: 200 }),
        task({ id: 'over', lastDoneAt: daysAgo(100), intervalDays: 90 }),
        task({ id: 'soon', lastDoneAt: daysAgo(85), intervalDays: 90 }),
      ],
      now,
    ).sort(compareUrgency);
    expect(items.map((item) => item.task.id)).toEqual(['over', 'soon', 'later']);
  });

  it('annualises recurring costs and ignores one-offs', () => {
    expect(annualCost(task({ cost: 24, intervalDays: 90 }))).toBeCloseTo(97.33, 1);
    expect(annualCost(task({ cost: 500, recurring: false }))).toBe(0);
  });
});

describe('a recurring job whose last-done date is unknown', () => {
  const unknown = (dueDate: string) => task({ lastDoneAt: '2026-10-27', dueDate, intervalDays: 365 });

  it('is first due on its due date, not counted from the day it was added', () => {
    const info = getTaskInfo(unknown('2026-11-10'), now);
    expect(info.daysLeft).toBe(14);
    expect(info.status).toBe('healthy');
    expect(info.percentUsed).toBe(0);
  });

  it('is due, in neutral terms, on and just before its due date', () => {
    const info = getTaskInfo(unknown('2026-10-27'), now);
    expect(info.status).toBe('due');
    expect(countdownText(info)).toBe('Today');
    expect(getTaskInfo(unknown('2026-11-03'), now).status).toBe('due');
  });

  it('is overdue once its due date has passed', () => {
    expect(getTaskInfo(unknown('2026-10-24'), now).status).toBe('overdue');
  });

  it('knows when last done is recorded', () => {
    expect(lastDoneKnown({ recurring: true, dueDate: '2026-11-10' })).toBe(false);
    expect(lastDoneKnown({ recurring: true, dueDate: undefined })).toBe(true);
    expect(lastDoneKnown({ recurring: false, dueDate: '2026-11-10' })).toBe(true);
  });
});

describe('presetCostHint', () => {
  it('shows a typical cost as a hint only while the cost is empty', () => {
    expect(presetCostHint('gutters', '')).toBe('Often about $25');
    expect(presetCostHint('gutters', '40')).toBeUndefined();
    expect(presetCostHint('custom', '')).toBeUndefined();
  });
});
