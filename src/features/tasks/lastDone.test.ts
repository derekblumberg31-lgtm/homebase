import { describe, expect, it } from 'vitest';
import type { Task } from '../../data/types';
import { firstDueFor, resolveLastDone, type LastDoneChoice } from './lastDone';
import { getTaskInfo, lastDoneKnown } from './taskMath';

const NOW = new Date('2026-10-27T19:00:00').getTime();

const task = (over: Partial<Task>): Task => ({
  id: 't1',
  kind: 'maintenance',
  name: 'Swap the HVAC filter',
  typeId: 'custom',
  location: '',
  lastDoneAt: '2026-09-01',
  intervalDays: 90,
  recurring: true,
  status: 'open',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

describe('firstDueFor', () => {
  it.each([
    ['this-month', 90, '2027-01-10'],
    ['few-months', 90, '2026-11-03'],
    ['few-months', 365, '2027-07-29'],
    ['over-a-year', 365, '2026-11-03'],
    ['over-a-year', 730, '2027-10-27'],
    ['not-sure', 180, '2026-11-03'],
    ['not-sure', 90, '2026-11-03'],
    ['this-month', 30, '2026-11-11'],
    ['this-month', 7, '2026-11-03'],
    ['not-sure', 7, '2026-11-03'],
    ['not-sure', 1, '2026-10-28'],
  ] as [LastDoneChoice, number, string][])('%s with a %i-day interval is first due %s', (choice, days, expected) => {
    expect(firstDueFor(choice, days, NOW)).toBe(expected);
  });

  it('never makes a job overdue, nor later than its own interval allows', () => {
    for (const choice of ['this-month', 'few-months', 'over-a-year', 'not-sure'] as LastDoneChoice[]) {
      for (const days of [1, 7, 14, 30, 90, 180, 365, 730, 3650]) {
        const stored = task({ lastDoneAt: '2026-10-27', intervalDays: days, dueDate: firstDueFor(choice, days, NOW) });
        const info = getTaskInfo(stored, NOW);
        expect(info.status).not.toBe('overdue');
        expect(info.daysLeft).toBeGreaterThanOrEqual(Math.min(7, days));
        expect(lastDoneKnown(stored)).toBe(false);
      }
    }
  });
});

describe('resolveLastDone', () => {
  const base = { intervalDays: 90, now: NOW };

  it('asks for a choice when nothing is given', () => {
    expect(resolveLastDone(base)).toEqual({ error: 'Choose when it was last done.' });
  });

  it('keeps an edited recurring task exactly as it was', () => {
    expect(resolveLastDone({ ...base, initial: task({ lastDoneAt: '2026-09-01' }) })).toEqual({ lastDoneAt: '2026-09-01', dueDate: undefined });
    expect(resolveLastDone({ ...base, initial: task({ lastDoneAt: '2026-10-01', dueDate: '2026-11-03' }) })).toEqual({ lastDoneAt: '2026-10-01', dueDate: '2026-11-03' });
  });

  it('keeps a seasonal draft first due date', () => {
    expect(resolveLastDone({ ...base, draftDueDate: '2026-11-10' })).toEqual({ lastDoneAt: '2026-10-27', dueDate: '2026-11-10' });
  });

  it('stores a typed date as the last-done date with no dueDate', () => {
    expect(resolveLastDone({ ...base, choice: 'date', date: '2026-09-01' })).toEqual({ lastDoneAt: '2026-09-01', dueDate: undefined });
  });

  it('refuses a future or impossible date', () => {
    expect(resolveLastDone({ ...base, choice: 'date', date: '2026-11-01' })).toEqual({ error: 'Pick today or an earlier date.' });
    expect(resolveLastDone({ ...base, choice: 'date', date: '2026-02-30' })).toEqual({ error: 'Pick the date it was last done.' });
    expect(resolveLastDone({ ...base, choice: 'date' })).toEqual({ error: 'Pick the date it was last done.' });
  });

  it('turns a chip into a first due date, never a last-done estimate', () => {
    expect(resolveLastDone({ ...base, choice: 'not-sure' })).toEqual({ lastDoneAt: '2026-10-27', dueDate: '2026-11-03' });
  });

  it('keeps the original added-on date when an unknown task gets a new chip', () => {
    expect(resolveLastDone({ ...base, choice: 'not-sure', initial: task({ lastDoneAt: '2026-10-01', dueDate: '2026-11-03' }) })).toEqual({ lastDoneAt: '2026-10-01', dueDate: '2026-11-03' });
  });
});
