import type { HomeStore } from '../../data/store';
import type { ServiceEvent, Task } from '../../data/types';
import { uid } from '../../data/ids';
import { recordServiceEvent } from '../records/serviceLog';
import { dueDateOf, lastDoneKnown } from './taskMath';
import { addDays, formatDate, parseDateInput, toDateInput } from '../../lib/dates';

export interface CompletionInput {
  date?: string;
  notes?: string;
  cost?: number;
  provider?: string;
}

/**
 * Mark a task done: recurring tasks start their next run from the given date; one-off repairs and
 * projects close. Either way the visit is kept in Service history and shown in recent activity.
 * Returns an undo function and the confirmation text.
 */
export async function completeTask(store: HomeStore, task: Task, input: CompletionInput = {}) {
  const date = input.date ?? toDateInput();
  const event: ServiceEvent = {
    id: uid(),
    date,
    title: task.name,
    taskId: task.id,
    itemId: task.itemId,
    systemId: task.systemId,
    previousDoneAt: task.recurring && lastDoneKnown(task) ? task.lastDoneAt : undefined,
    cost: input.cost ?? task.cost,
    provider: input.provider,
    notes: input.notes?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  const updated: Task = task.recurring
    ? { ...task, lastDoneAt: date, dueDate: undefined, nextDue: undefined, updatedAt: new Date().toISOString() }
    : { ...task, status: 'done', lastDoneAt: date, nextDue: undefined, updatedAt: new Date().toISOString() };

  // History first, the task last: if anything fails, the worst leftover is an extra history line, never a task that moved on with no record.
  const recorded = await recordServiceEvent(store, event, `/tasks/${task.id}`);
  try {
    await store.put('tasks', updated);
  } catch (error) {
    await recorded.undo().catch(() => {});
    throw error;
  }

  const message = task.recurring
    ? `${task.name} done. Next ${formatDate(addDays(parseDateInput(date), task.intervalDays))}`
    : `${task.name} done`;

  return {
    message,
    undo: async () => {
      // The task goes back first, so a failure leaves it done with its history intact. A task removed since (deleted, or taken out by the starter Undo) stays removed.
      if (store.getSnapshot().tasks.some((t) => t.id === task.id)) await store.put('tasks', task);
      await recorded.undo();
    },
  };
}

export async function removeTask(store: HomeStore, task: Task) {
  const events = store.getSnapshot().serviceEvents.filter((event) => event.taskId === task.id);
  await store.remove('tasks', task.id);
  await store.log('task-removed', `Removed: ${task.name}`);
  return {
    undo: async () => {
      await store.put('tasks', task);
      await store.putMany('serviceEvents', events);
    },
  };
}

/**
 * Save a new task and note it in Activity. The task is what matters: if only the activity entry
 * fails the save still counts, because reporting "not saved" would make the user retry and
 * duplicate it. If the task itself fails the error propagates and no entry is written.
 */
export async function addTask(store: HomeStore, task: Task) {
  await store.put('tasks', task);
  try {
    await store.log('task-added', `Added: ${task.name}`, `/tasks/${task.id}`);
  } catch {
    // Activity is optional.
  }
}

/** Push a task back by some days from today (or from its due date if that's later). Undo restores it. */
export async function snoozeTask(store: HomeStore, task: Task, days: number, now = Date.now()) {
  const due = dueDateOf(task);
  const from = due.getTime() > now ? due : new Date(now);
  const nextDue = toDateInput(addDays(from, days));
  await store.put('tasks', { ...task, nextDue, updatedAt: new Date().toISOString() });
  return { nextDue, undo: () => store.put('tasks', task) };
}

/** Move a task to a specific date. One-off tasks change their due date; recurring ones keep their rhythm after this date. */
export async function rescheduleTask(store: HomeStore, task: Task, date: string) {
  const next: Task = task.recurring ? { ...task, nextDue: date } : { ...task, dueDate: date, nextDue: undefined };
  await store.put('tasks', { ...next, updatedAt: new Date().toISOString() });
  return { undo: () => store.put('tasks', task) };
}
