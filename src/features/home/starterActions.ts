import { uid } from '../../data/ids';
import type { HomeStore } from '../../data/store';
import type { HealthStepState, HomeRecord, ServiceEvent, Task } from '../../data/types';
import { toDateInput } from '../../lib/dates';
import { STARTER_STEPS, type StarterStepId } from './starter';

/**
 * What the starter Health Check's buttons do. Each saves real data (a household note, a Service
 * History entry, a recurring task) so the step is useful later, not just ticked. Each returns undo.
 */

async function setStep(store: HomeStore, id: StarterStepId, state: HealthStepState | undefined) {
  const healthSteps = { ...(store.getSnapshot().settings.healthSteps ?? {}) };
  if (state) healthSteps[id] = state;
  else delete healthSteps[id];
  await store.updateSettings({ healthSteps });
}

function previous(store: HomeStore, id: StarterStepId) {
  return store.getSnapshot().settings.healthSteps?.[id];
}

/** "The main water shutoff is in the basement": saved as a household note and on the step. */
export async function saveLocation(store: HomeStore, id: StarterStepId, where: string) {
  const def = STARTER_STEPS.find((s) => s.id === id);
  if (def?.action.type !== 'locate') throw new Error('Not a location step');
  const before = previous(store, id);
  const now = new Date().toISOString();
  const title = def.action.noteTitle.toLowerCase();
  const existing = store.getSnapshot().records.find((r) => r.kind === 'note' && r.title.toLowerCase().startsWith(title));
  const note: HomeRecord = existing
    ? { ...existing, notes: where, updatedAt: now }
    : { id: uid(), kind: 'note', title: def.action.noteTitle, notes: where, fileIds: [], createdAt: now, updatedAt: now };
  await store.put('records', note);
  await setStep(store, id, { state: 'done', at: now, note: where });
  await store.log('record-added', `Health Check: ${def.action.noteTitle.toLowerCase()} saved`, `/records/${note.id}`);
  return async () => {
    if (existing) await store.put('records', existing);
    else await store.remove('records', note.id);
    await setStep(store, id, before);
  };
}

/**
 * Alarms tested: logged in Service History, and a monthly reminder is added unless one exists.
 * Returns the reminder (new or existing) so the screen can link to it.
 */
export async function markTested(store: HomeStore, id: StarterStepId) {
  const def = STARTER_STEPS.find((s) => s.id === id);
  if (def?.action.type !== 'test') throw new Error('Not a test step');
  const before = previous(store, id);
  const now = new Date().toISOString();
  const today = toDateInput();
  const { taskName, intervalDays } = def.action;
  const event: ServiceEvent = { id: uid(), date: today, title: taskName, provider: 'Me', notes: 'Home Health Check', createdAt: now };
  await store.put('serviceEvents', event);

  const words = taskName.toLowerCase().includes('carbon') ? /(carbon|\bco\b)/ : /smoke/;
  const existing = store.getSnapshot().tasks.find((t) => t.status === 'open' && t.recurring && words.test(t.name.toLowerCase()));
  let created: Task | undefined;
  if (existing) {
    await store.put('tasks', { ...existing, lastDoneAt: today, nextDue: undefined, updatedAt: now });
  } else {
    created = {
      id: uid(),
      kind: 'maintenance',
      name: taskName,
      typeId: 'custom',
      location: 'Every level',
      lastDoneAt: today,
      intervalDays,
      recurring: true,
      status: 'open',
      priority: 'high',
      category: 'safety',
      notes: def.action.type === 'test' ? def.action.how.join('\n') : undefined,
      createdAt: now,
      updatedAt: now,
    };
    await store.put('tasks', created);
  }
  await setStep(store, id, { state: 'done', at: now });
  await store.log('task-done', `Health Check: ${taskName.toLowerCase()}`, '/records/service-history');
  return {
    task: created ?? existing!,
    undo: async () => {
      await store.remove('serviceEvents', event.id);
      if (created) await store.remove('tasks', created.id);
      else if (existing) await store.put('tasks', existing);
      await setStep(store, id, before);
    },
  };
}

/** Gas shutoff in a home without gas. */
export async function markNotApplicable(store: HomeStore, id: StarterStepId) {
  const before = previous(store, id);
  await setStep(store, id, { state: 'not-applicable', at: new Date().toISOString() });
  if (id === 'gas-shutoff') await store.updateSettings({ hasGas: false });
  return async () => {
    await setStep(store, id, before);
    if (id === 'gas-shutoff') await store.updateSettings({ hasGas: undefined });
  };
}

/** Tick a step done without extra details (used after a system or contact is saved elsewhere). */
export async function markDone(store: HomeStore, id: StarterStepId) {
  const before = previous(store, id);
  await setStep(store, id, { state: 'done', at: new Date().toISOString() });
  return () => setStep(store, id, before);
}

/** Back to not done. Notes, tasks and history it created stay. */
export async function reopenStep(store: HomeStore, id: StarterStepId) {
  const before = previous(store, id);
  await setStep(store, id, undefined);
  if (id === 'gas-shutoff' && store.getSnapshot().settings.hasGas === false) await store.updateSettings({ hasGas: undefined });
  return () => setStep(store, id, before);
}
