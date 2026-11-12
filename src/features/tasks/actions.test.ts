import { describe, expect, it, vi } from 'vitest';
import type { Task } from '../../data/types';
import { freshStore } from '../../test/freshStore';
import { addTask, completeTask, removeTask, rescheduleTask, snoozeTask } from './actions';

const task = (over: Partial<Task>): Task => ({
  id: 't1',
  kind: 'maintenance',
  name: 'Clean the gutters',
  typeId: 'custom',
  location: '',
  lastDoneAt: '2026-10-27',
  intervalDays: 365,
  recurring: true,
  status: 'open',
  createdAt: '2026-10-27T00:00:00.000Z',
  updatedAt: '2026-10-27T00:00:00.000Z',
  ...over,
});

describe('completeTask cost', () => {
  it('F6-T3: records no cost when none is entered, even if the task has an estimate', async () => {
    const store = await freshStore();
    const planned = task({ cost: 150 });
    await store.put('tasks', planned);
    await completeTask(store, planned, { date: '2026-11-10' });
    expect(store.getSnapshot().serviceEvents[0].cost).toBeUndefined();
  });

  it('F6-T4: records the cost that was typed', async () => {
    const store = await freshStore();
    const planned = task({ cost: 150 });
    await store.put('tasks', planned);
    await completeTask(store, planned, { date: '2026-11-10', cost: 90 });
    expect(store.getSnapshot().serviceEvents[0].cost).toBe(90);
  });

  it('keeps a zero cost (a free warranty repair)', async () => {
    const store = await freshStore();
    const planned = task({ cost: 150 });
    await store.put('tasks', planned);
    await completeTask(store, planned, { date: '2026-11-10', cost: 0 });
    expect(store.getSnapshot().serviceEvents[0].cost).toBe(0);
  });
});

describe('completeTask', () => {
  it('clears the first-due date and records no previous date when last done was unknown', async () => {
    const store = await freshStore();
    const planned = task({ dueDate: '2026-11-10' });
    await store.put('tasks', planned);

    const { undo } = await completeTask(store, planned, { date: '2026-10-27' });
    const saved = store.getSnapshot().tasks.find((t) => t.id === 't1')!;
    expect(saved.dueDate).toBeUndefined();
    expect(saved.lastDoneAt).toBe('2026-10-27');
    const event = store.getSnapshot().serviceEvents[0];
    expect(event.previousDoneAt).toBeUndefined();

    await undo();
    const restored = store.getSnapshot().tasks.find((t) => t.id === 't1')!;
    expect(restored.dueDate).toBe('2026-11-10');
    expect(store.getSnapshot().serviceEvents).toHaveLength(0);
  });

  it('keeps the previous date when last done was recorded', async () => {
    const store = await freshStore();
    const known = task({ lastDoneAt: '2026-06-01' });
    await store.put('tasks', known);
    await completeTask(store, known, { date: '2026-10-27' });
    expect(store.getSnapshot().serviceEvents[0].previousDoneAt).toBe('2026-06-01');
  });

  it('undo restores a recurring task and removes the event and the activity entry', async () => {
    const store = await freshStore();
    const original = task({});
    await store.put('tasks', original);
    const { undo } = await completeTask(store, original, { date: '2026-11-10' });
    expect(store.getSnapshot().activity.some((a) => a.text === 'Done: Clean the gutters')).toBe(true);
    await undo();
    expect(store.getSnapshot().tasks.find((t) => t.id === 't1')).toEqual(original);
    expect(store.getSnapshot().serviceEvents).toEqual([]);
    expect(store.getSnapshot().activity.some((a) => a.text === 'Done: Clean the gutters')).toBe(false);
  });

  it('closes a one-off task, and undo reopens it cleanly', async () => {
    const store = await freshStore();
    const original = task({ recurring: false, kind: 'repair' });
    await store.put('tasks', original);
    const { undo } = await completeTask(store, original, { date: '2026-11-10' });
    expect(store.getSnapshot().tasks.find((t) => t.id === 't1')!.status).toBe('done');
    await undo();
    expect(store.getSnapshot().tasks.find((t) => t.id === 't1')).toEqual(original);
    expect(store.getSnapshot().serviceEvents).toEqual([]);
    expect(store.getSnapshot().activity.some((a) => a.text === 'Done: Clean the gutters')).toBe(false);
  });

  it('removes the activity entry on undo when last done was unknown', async () => {
    const store = await freshStore();
    const planned = task({ dueDate: '2026-11-10' });
    await store.put('tasks', planned);
    const { undo } = await completeTask(store, planned, { date: '2026-10-27' });
    await undo();
    expect(store.getSnapshot().tasks.find((t) => t.id === 't1')!.dueDate).toBe('2026-11-10');
    expect(store.getSnapshot().activity.some((a) => a.text === 'Done: Clean the gutters')).toBe(false);
  });
});

describe('completeTask undo after the task is gone', () => {
  it('does not bring back a task deleted since it was done', async () => {
    const store = await freshStore();
    const original = task({});
    await store.put('tasks', original);
    const { undo } = await completeTask(store, original, { date: '2026-11-10' });
    await removeTask(store, store.getSnapshot().tasks[0]);
    await undo();
    expect(store.getSnapshot().tasks).toEqual([]);
    expect(store.getSnapshot().serviceEvents).toEqual([]);
    expect(store.getSnapshot().activity.some((a) => a.text === 'Done: Clean the gutters')).toBe(false);
  });
});

describe('completeTask when a write fails', () => {
  it('leaves the task alone and keeps no history when the task cannot be saved', async () => {
    const store = await freshStore();
    const original = task({});
    await store.put('tasks', original);
    const real = store.put.bind(store);
    vi.spyOn(store, 'put').mockImplementation(((table: string, row: unknown) => (table === 'tasks' ? Promise.reject(new Error('put failed')) : real(table as never, row as never))) as never);
    await expect(completeTask(store, original, { date: '2026-11-10' })).rejects.toThrow('put failed');
    expect(store.getSnapshot().tasks[0]).toEqual(original);
    expect(store.getSnapshot().serviceEvents).toEqual([]);
    expect(store.getSnapshot().activity.some((a) => a.text === 'Done: Clean the gutters')).toBe(false);
  });

  it('never moves the task on when the history cannot be written', async () => {
    const store = await freshStore();
    const original = task({});
    await store.put('tasks', original);
    vi.spyOn(store, 'log').mockRejectedValue(new Error('log failed'));
    await expect(completeTask(store, original, { date: '2026-11-10' })).rejects.toThrow('log failed');
    expect(store.getSnapshot().tasks[0]).toEqual(original);
    expect(store.getSnapshot().serviceEvents).toEqual([]);
  });

  it('a failed undo leaves the task done with its history, so a retry finishes the job', async () => {
    const store = await freshStore();
    const original = task({});
    await store.put('tasks', original);
    const { undo } = await completeTask(store, original, { date: '2026-11-10' });
    const done = store.getSnapshot().tasks[0];
    const put = vi.spyOn(store, 'put').mockRejectedValueOnce(new Error('put failed'));
    await expect(undo()).rejects.toThrow('put failed');
    expect(store.getSnapshot().tasks[0]).toEqual(done);
    expect(store.getSnapshot().serviceEvents).toHaveLength(1);
    put.mockRestore();
    await undo();
    expect(store.getSnapshot().tasks[0]).toEqual(original);
    expect(store.getSnapshot().serviceEvents).toEqual([]);
  });
});

describe('addTask', () => {
  it('resolves when the task is saved but the activity entry fails', async () => {
    const store = await freshStore();
    vi.spyOn(store, 'log').mockRejectedValue(new Error('log failed'));
    await expect(addTask(store, task({ id: 'new1' }))).resolves.toBeUndefined();
    expect(store.getSnapshot().tasks.some((t) => t.id === 'new1')).toBe(true);
  });

  it('rejects and writes no activity entry when the task cannot be saved', async () => {
    const store = await freshStore();
    vi.spyOn(store, 'put').mockRejectedValue(new Error('put failed'));
    const log = vi.spyOn(store, 'log');
    await expect(addTask(store, task({ id: 'new2' }))).rejects.toThrow('put failed');
    expect(log).not.toHaveBeenCalled();
  });
});

describe('dates that move a task', () => {
  it('clears both the first-due date and a snooze on done, and records no previous date', async () => {
    const store = await freshStore();
    const planned = task({ dueDate: '2026-11-10', nextDue: '2026-11-17' });
    await store.put('tasks', planned);
    await completeTask(store, planned, { date: '2026-11-11' });
    const saved = store.getSnapshot().tasks[0];
    expect(saved.dueDate).toBeUndefined();
    expect(saved.nextDue).toBeUndefined();
    expect(saved.lastDoneAt).toBe('2026-11-11');
    expect(store.getSnapshot().serviceEvents[0].previousDoneAt).toBeUndefined();
  });

  it('closes a snoozed one-off and clears the snooze', async () => {
    const store = await freshStore();
    const repair = task({ id: 'r1', recurring: false, kind: 'repair', dueDate: '2026-11-01', nextDue: '2026-11-08' });
    await store.put('tasks', repair);
    await completeTask(store, repair, { date: '2026-11-09' });
    expect(store.getSnapshot().tasks[0]).toMatchObject({ status: 'done', nextDue: undefined });
  });

  it('copies the home system to the history entry', async () => {
    const store = await freshStore();
    const forSystem = task({ systemId: 'sys-1' });
    await store.put('tasks', forSystem);
    await completeTask(store, forSystem, { date: '2026-11-11' });
    expect(store.getSnapshot().serviceEvents[0].systemId).toBe('sys-1');
    expect(store.getSnapshot().tasks[0].systemId).toBe('sys-1');
  });

  it('snoozes, and Undo puts the task back exactly as it was', async () => {
    const store = await freshStore();
    const planned = task({ dueDate: '2026-11-10' });
    await store.put('tasks', planned);
    const { nextDue, undo } = await snoozeTask(store, planned, 7, new Date('2026-11-11T12:00:00').getTime());
    expect(nextDue).toBe('2026-11-18');
    expect(store.getSnapshot().tasks[0].nextDue).toBe('2026-11-18');
    expect(store.getSnapshot().tasks[0].dueDate).toBe('2026-11-10');
    await undo();
    expect(store.getSnapshot().tasks[0]).toEqual(planned);
  });

  it('reschedules a one-off by its due date and a recurring task by a moved date, and Undo restores either', async () => {
    const store = await freshStore();
    const repair = task({ id: 'r1', recurring: false, kind: 'repair', dueDate: '2026-11-01' });
    const recurring = task({ id: 't2' });
    await store.putMany('tasks', [repair, recurring]);
    const a = await rescheduleTask(store, repair, '2026-11-20');
    const b = await rescheduleTask(store, recurring, '2026-12-01');
    const byId = (id: string) => store.getSnapshot().tasks.find((t) => t.id === id)!;
    expect(byId('r1')).toMatchObject({ dueDate: '2026-11-20', nextDue: undefined });
    expect(byId('t2')).toMatchObject({ nextDue: '2026-12-01' });
    await a.undo();
    await b.undo();
    expect(byId('r1')).toEqual(repair);
    expect(byId('t2')).toEqual(recurring);
  });
});
