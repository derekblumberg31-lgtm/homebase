import type { HomeStore } from '../../data/store';
import type { ServiceEvent, Task } from '../../data/types';
import { uid } from '../../data/ids';
import { addDays, formatDate, parseDateInput, toDateInput } from '../../lib/dates';

export interface CompletionInput {
  date?: string;
  notes?: string;
  cost?: number;
  provider?: string;
}

/**
 * Mark a task done: recurring tasks start their next run from the given date; one-off repairs and
 * projects close. Either way the visit is kept in Service History and shown in recent activity.
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
    previousDoneAt: task.recurring ? task.lastDoneAt : undefined,
    cost: input.cost ?? task.cost,
    provider: input.provider,
    notes: input.notes?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  const updated: Task = task.recurring
    ? { ...task, lastDoneAt: date, updatedAt: new Date().toISOString() }
    : { ...task, status: 'done', lastDoneAt: date, updatedAt: new Date().toISOString() };

  await store.put('tasks', updated);
  await store.put('serviceEvents', event);
  await store.log('task-done', `Done: ${task.name}`, `/tasks/${task.id}`);

  const message = task.recurring
    ? `${task.name} done. Next ${formatDate(addDays(parseDateInput(date), task.intervalDays))}`
    : `${task.name} done`;

  return {
    message,
    undo: async () => {
      await store.put('tasks', task);
      await store.remove('serviceEvents', event.id);
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
