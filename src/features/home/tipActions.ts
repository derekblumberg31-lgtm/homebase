import type { HomeStore } from '../../data/store';
import type { ServiceEvent, Task, TipState } from '../../data/types';
import { uid } from '../../data/ids';
import { addDays, toDateInput } from '../../lib/dates';
import { recordServiceEvent } from '../records/serviceLog';
import type { TaskDraft } from '../tasks/TaskForm';
import { SNOOZE_DAYS, type SeasonalTip } from './insights';

/**
 * What a homeowner can do with a seasonal recommendation. Every choice is saved in settings, so it
 * survives a reload, and each returns an undo that restores the previous state.
 */
async function setTipState(store: HomeStore, id: string, state: TipState | undefined) {
  const tipStates = { ...(store.getSnapshot().settings.tipStates ?? {}) };
  if (state) tipStates[id] = state;
  else delete tipStates[id];
  await store.updateSettings({ tipStates });
}

function undoTo(store: HomeStore, id: string) {
  const previous = store.getSnapshot().settings.tipStates?.[id];
  return () => setTipState(store, id, previous);
}

/** The draft for planning a seasonal job: yearly, first due in two weeks, with no invented last-done date. */
export function planDraftFor(tip: Pick<SeasonalTip, 'taskName' | 'category'>, now: number): TaskDraft {
  return { name: tip.taskName, kind: 'maintenance', category: tip.category, seasonal: true, intervalDays: 365, dueDate: toDateInput(addDays(new Date(now), 14)) };
}

export async function planTip(store: HomeStore, tip: SeasonalTip, task: Task) {
  await store.put('tasks', task);
  // The task is saved. Failing now would leave the form open, and a second Add would save it again.
  try {
    await store.log('task-added', `Planned: ${task.name}`, `/tasks/${task.id}`);
  } catch {
    // The activity entry is optional.
  }
  try {
    await setTipState(store, tip.id, { state: 'planned', taskId: task.id, at: new Date().toISOString() });
  } catch {
    // A tip with a similar open task is hidden anyway.
  }
}

export async function snoozeTip(store: HomeStore, tip: SeasonalTip) {
  const undo = undoTo(store, tip.id);
  const until = toDateInput(addDays(new Date(), SNOOZE_DAYS));
  await setTipState(store, tip.id, { state: 'snoozed', until, at: new Date().toISOString() });
  return { until, undo };
}

export async function hideTip(store: HomeStore, tip: SeasonalTip) {
  const undo = undoTo(store, tip.id);
  await setTipState(store, tip.id, { state: 'hidden', at: new Date().toISOString() });
  return undo;
}

/** Done already: logged in Service history like any other job. */
export async function completeTip(store: HomeStore, tip: SeasonalTip) {
  const undoState = undoTo(store, tip.id);
  const event: ServiceEvent = { id: uid(), date: toDateInput(), title: tip.taskName, notes: 'Seasonal recommendation', createdAt: new Date().toISOString() };
  const recorded = await recordServiceEvent(store, event, '/records/service-history');
  try {
    await setTipState(store, tip.id, { state: 'done', at: new Date().toISOString() });
  } catch (error) {
    // Take the event back so the retry logs one visit, not two.
    await recorded.undo().catch(() => {});
    throw error;
  }
  return async () => {
    await recorded.undo();
    await undoState();
  };
}

/** Back to a plain suggestion (the planned task, if any, is left alone). */
export async function resetTip(store: HomeStore, tip: SeasonalTip) {
  await setTipState(store, tip.id, undefined);
}

/** Bring every snoozed recommendation back now. */
export async function wakeSnoozedTips(store: HomeStore) {
  const tipStates = Object.fromEntries(Object.entries(store.getSnapshot().settings.tipStates ?? {}).filter(([, s]) => s.state !== 'snoozed'));
  await store.updateSettings({ tipStates });
}
