import type { HomeStore } from '../../data/store';
import type { Activity, ServiceEvent } from '../../data/types';
import { uid } from '../../data/ids';
import { isRealDate } from '../../lib/dates';

type EntryMatch = Pick<Activity, 'kind' | 'text' | 'href'>;

/** The activity entry a store.log() call just wrote: the first in `after` (newest first) that is not in `before` and matches. */
export function newEntryId(before: ReadonlySet<string>, after: readonly Activity[], match: EntryMatch): string | undefined {
  return after.find((a) => !before.has(a.id) && a.kind === match.kind && a.text === match.text && a.href === match.href)?.id;
}

/** The one way a "done" is written: a service event plus its "Done: X" entry. The undo removes both. */
export async function recordServiceEvent(store: HomeStore, event: ServiceEvent, href: string) {
  const before = new Set(store.getSnapshot().activity.map((a) => a.id));
  await store.put('serviceEvents', event);
  const text = `Done: ${event.title}`;
  try {
    await store.log('task-done', text, href);
  } catch (error) {
    await store.remove('serviceEvents', event.id).catch(() => {});
    throw error;
  }
  const activityId = newEntryId(before, store.getSnapshot().activity, { kind: 'task-done', text, href });
  return {
    event,
    activityId,
    undo: async () => {
      if (activityId) await store.remove('activity', activityId);
      await store.remove('serviceEvents', event.id);
    },
  };
}

export interface LogJobInput {
  title: string;
  date: string;
  cost: string;
  provider: string;
  notes: string;
  itemId: string;
}

export type LogJobErrors = Partial<Record<'title' | 'date' | 'cost', string>>;

/** Validates the Log sheet's fields and builds the event. A logged job has no task. */
export function buildLoggedEvent(input: LogJobInput, today: string, now: string): { event: ServiceEvent } | { errors: LogJobErrors } {
  const errors: LogJobErrors = {};
  const title = input.title.trim();
  if (!title) errors.title = 'Say what was done.';
  if (!(isRealDate(input.date) && input.date <= today)) errors.date = 'Pick today or a day in the past.';
  let cost: number | undefined;
  const rawCost = input.cost.trim();
  if (rawCost) {
    const value = Number(rawCost);
    if (Number.isFinite(value) && value >= 0) cost = value;
    else errors.cost = 'Enter an amount, like 120.';
  }
  if (Object.keys(errors).length) return { errors };
  return {
    event: {
      id: uid(),
      date: input.date,
      title,
      itemId: input.itemId || undefined,
      cost,
      provider: input.provider.trim() || undefined,
      notes: input.notes.trim() || undefined,
      createdAt: now,
    },
  };
}

/** Record a job that had no task. */
export async function logJob(store: HomeStore, event: ServiceEvent) {
  const { undo } = await recordServiceEvent(store, event, '/records/service-history');
  return { undo };
}
