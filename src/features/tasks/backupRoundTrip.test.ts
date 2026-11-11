import { describe, expect, it } from 'vitest';
import { buildBackup, parseHomebaseBackup, readBackup } from '../../data/backup';
import type { HomeStore } from '../../data/store';
import type { Task } from '../../data/types';
import { freshStore } from '../../test/freshStore';
import { planDraftFor, planTip } from '../home/tipActions';
import { seasonalTipsFor } from '../home/insights';
import { starterJobsFor } from '../home/starter';
import { addStarterJobs } from '../home/starterActions';
import { completeTask } from './actions';
import { LAST_DONE_OPTIONS } from './lastDone';
import { TASK_PRESETS } from './presets';

/** Exports a backup of the store and runs it through the real reader and validator. */
async function roundTrip(store: HomeStore) {
  const text = await buildBackup(store.getSnapshot(), await store.allFiles());
  const parsed = readBackup(text);
  expect(parsed).not.toBeNull();
  return parseHomebaseBackup(parsed!);
}

const at = (month: number) => new Date(2026, month, 15, 12).getTime();

/** What TaskForm saves for a one-off repair or project: `initial?.intervalDays ?? 30`, recurring false. */
const oneOff = (over: Partial<Task> = {}): Task => ({
  id: 'repair-1',
  kind: 'repair',
  name: 'Fix the porch light',
  typeId: 'custom',
  location: '',
  lastDoneAt: '2026-11-10',
  intervalDays: 30,
  recurring: false,
  dueDate: '2026-11-20',
  status: 'open',
  createdAt: '2026-11-10T00:00:00.000Z',
  updatedAt: '2026-11-10T00:00:00.000Z',
  ...over,
});

describe('every task this build can save passes backup validation (intervalDays above zero)', () => {
  it('starter jobs, in every month and with every last-done answer', async () => {
    for (let month = 0; month < 12; month += 1) {
      const store = await freshStore();
      const jobs = starterJobsFor(store.getSnapshot(), at(month));
      expect(jobs.length).toBeGreaterThan(0);
      const picks = jobs.map((job, i) => ({ job, choice: LAST_DONE_OPTIONS[i % LAST_DONE_OPTIONS.length].value }));
      await addStarterJobs(store, picks, at(month));
      const { data } = await roundTrip(store);
      expect(data.tasks).toHaveLength(jobs.length);
      expect(data.tasks.every((t) => t.intervalDays > 0)).toBe(true);
    }
  });

  it('a seasonal job planned from a tip', async () => {
    const store = await freshStore();
    const now = at(9);
    const [tip] = seasonalTipsFor(store.getSnapshot(), now).tips;
    const draft = planDraftFor(tip, now);
    const task = oneOff({ kind: 'maintenance', recurring: true, name: draft.name!, intervalDays: draft.intervalDays!, dueDate: draft.dueDate, seasonal: true });
    await planTip(store, tip, task);
    expect((await roundTrip(store)).data.tasks[0].intervalDays).toBe(365);
  });

  it('a one-off repair, open and after it is marked done', async () => {
    const store = await freshStore();
    const repair = oneOff();
    await store.put('tasks', repair);
    expect((await roundTrip(store)).data.tasks[0].intervalDays).toBe(30);
    await completeTask(store, repair, { date: '2026-11-11' });
    const { data } = await roundTrip(store);
    expect(data.tasks[0].status).toBe('done');
    expect(data.tasks[0].intervalDays).toBe(30);
  });

  it('a recurring job from the form, when it is marked done', async () => {
    const store = await freshStore();
    const task = oneOff({ kind: 'maintenance', recurring: true, intervalDays: 90, dueDate: undefined });
    await store.put('tasks', task);
    await completeTask(store, task, { date: '2026-11-11' });
    expect((await roundTrip(store)).data.tasks[0].intervalDays).toBe(90);
  });

  it('every preset the form or the starter block can pick has a positive interval', () => {
    for (const preset of TASK_PRESETS) expect(preset.lifespanDays, preset.id).toBeGreaterThan(0);
  });

  it('the validator still refuses a task whose interval is zero (a hand-made file), which no screen can produce', async () => {
    const store = await freshStore();
    await store.put('tasks', oneOff({ intervalDays: 0 }));
    const text = await buildBackup(store.getSnapshot(), []);
    expect(() => parseHomebaseBackup(readBackup(text)!)).toThrow(/damaged/);
  });
});
