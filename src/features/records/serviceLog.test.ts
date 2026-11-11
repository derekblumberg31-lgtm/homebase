import { describe, expect, it } from 'vitest';
import type { Activity, ServiceEvent } from '../../data/types';
import { freshStore } from '../../test/freshStore';
import { completeTip } from '../home/tipActions';
import { buildLoggedEvent, logJob, newEntryId, recordServiceEvent } from './serviceLog';

const entry = (id: string, text = 'Done: Fixed tap'): Activity => ({ id, at: '2026-11-01T00:00:00.000Z', kind: 'task-done', text, href: '/records/service-history' });
const match = { kind: 'task-done' as const, text: 'Done: Fixed tap', href: '/records/service-history' };
const eventOf = (over: Partial<ServiceEvent> = {}): ServiceEvent => ({ id: 'e1', date: '2026-11-01', title: 'Fixed tap', createdAt: '2026-11-01T00:00:00.000Z', ...over });

describe('newEntryId', () => {
  it('finds the new matching entry only', () => {
    expect(newEntryId(new Set(['a']), [entry('b'), entry('a')], match)).toBe('b');
    expect(newEntryId(new Set(['a']), [entry('b', 'Done: Other'), entry('a')], match)).toBeUndefined();
    expect(newEntryId(new Set(['a', 'b']), [entry('b'), entry('a')], match)).toBeUndefined();
  });
});

describe('recordServiceEvent', () => {
  it('adds an event and an entry, and undo removes both', async () => {
    const store = await freshStore();
    const { undo, activityId } = await recordServiceEvent(store, eventOf(), '/records/service-history');
    expect(store.getSnapshot().serviceEvents).toHaveLength(1);
    expect(store.getSnapshot().activity.map((a) => a.text)).toEqual(['Done: Fixed tap']);
    expect(activityId).toBe(store.getSnapshot().activity[0].id);
    await undo();
    expect(store.getSnapshot().serviceEvents).toHaveLength(0);
    expect(store.getSnapshot().activity).toHaveLength(0);
  });
});

describe('completeTip', () => {
  it('leaves no event or entry after undo', async () => {
    const store = await freshStore();
    const undo = await completeTip(store, { id: 'tip1', taskName: 'Flush the water heater' } as never);
    expect(store.getSnapshot().activity.some((a) => a.text === 'Done: Flush the water heater')).toBe(true);
    await undo();
    expect(store.getSnapshot().serviceEvents).toHaveLength(0);
    expect(store.getSnapshot().activity.some((a) => a.text === 'Done: Flush the water heater')).toBe(false);
  });
});

describe('buildLoggedEvent', () => {
  const today = '2026-11-11';
  const now = '2026-11-11T10:00:00.000Z';
  const base = { title: 'Fixed tap', date: today, cost: '', provider: '', notes: '', itemId: '' };
  it('trims and leaves blanks undefined', () => {
    const result = buildLoggedEvent({ ...base, title: '  Fixed tap ', provider: ' ' }, today, now);
    expect('event' in result).toBe(true);
    if ('event' in result) {
      expect(result.event.title).toBe('Fixed tap');
      for (const key of ['cost', 'provider', 'notes', 'itemId', 'taskId'] as const) expect(result.event[key]).toBeUndefined();
    }
  });
  it('reports errors', () => {
    const errors = (over: object) => ('errors' in buildLoggedEvent({ ...base, ...over }, today, now) ? (buildLoggedEvent({ ...base, ...over }, today, now) as { errors: object }).errors : {});
    expect(errors({ title: '  ' })).toHaveProperty('title');
    expect(errors({ date: '2026-11-12' })).toHaveProperty('date');
    expect(errors({ date: '2026-02-30' })).toHaveProperty('date');
    expect(errors({ cost: 'abc' })).toHaveProperty('cost');
    expect(errors({ cost: '-5' })).toHaveProperty('cost');
    const ok = buildLoggedEvent({ ...base, cost: '120.50' }, today, now);
    expect('event' in ok && ok.event.cost).toBe(120.5);
  });
});

describe('logJob', () => {
  it('undo leaves the store as before', async () => {
    const store = await freshStore();
    const result = buildLoggedEvent({ title: 'Fixed tap', date: '2026-11-01', cost: '', provider: '', notes: '', itemId: '' }, '2026-11-11', '2026-11-11T00:00:00.000Z');
    if (!('event' in result)) throw new Error('invalid');
    const { undo } = await logJob(store, result.event);
    expect(store.getSnapshot().serviceEvents).toHaveLength(1);
    await undo();
    expect(store.getSnapshot().serviceEvents).toHaveLength(0);
    expect(store.getSnapshot().activity).toHaveLength(0);
  });
});
