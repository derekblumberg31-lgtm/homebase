import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../data/db';
import { emptyData, HomeStore, type HomeData } from '../../data/store';
import type { HomeRecord, Task } from '../../data/types';
import { firstNameOf } from '../../session/session';
import { LocalGuideProvider } from '../assistant/provider';
import { taskCategory, taskMetaParts } from '../tasks/meta';
import { getTaskInfo } from '../tasks/taskMath';
import { healthCheckFor, seasonalTipsFor, snapshotFor, timelineFor } from './insights';
import { completeTip, hideTip, snoozeTip } from './tipActions';

// A fixed autumn evening, so the seasonal list and dates are predictable.
const NOW = new Date('2026-10-27T19:00:00').getTime();

const task = (over: Partial<Task>): Task => ({
  id: 't1',
  kind: 'maintenance',
  name: 'Swap the HVAC filter',
  typeId: 'custom',
  location: 'Hallway',
  lastDoneAt: '2026-08-01',
  intervalDays: 90,
  recurring: true,
  status: 'open',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

const record = (over: Partial<HomeRecord>): HomeRecord => ({
  id: 'r1',
  kind: 'warranty',
  title: 'Water heater warranty',
  fileIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const home = (over: Partial<HomeData> = {}): HomeData => ({ ...emptyData(), ...over });

let n = 0;
async function freshStore() {
  n += 1;
  const store = new HomeStore(await createDatabase(`homebase-home-test-${n}`));
  await store.load();
  return store;
}

describe('greeting name', () => {
  it('uses a cleaned-up first name and falls back when there is none', () => {
    expect(firstNameOf('  sam rivera ')).toBe('Sam');
    expect(firstNameOf('')).toBeUndefined();
    expect(firstNameOf('   ')).toBeUndefined();
    expect(firstNameOf(undefined)).toBeUndefined();
    expect(firstNameOf('<b>')).toBe('B');
    expect(firstNameOf('a'.repeat(40))).toHaveLength(25);
  });
});

describe('task metadata', () => {
  it('takes the category from the preset when a task has none', () => {
    expect(taskCategory({ typeId: 'custom' })).toBe('other');
    expect(taskCategory({ typeId: 'custom', category: 'air' })).toBe('air');
  });

  it('describes where, when, cost and season in one line', () => {
    const t = task({ category: 'air', cost: 24, seasonal: true });
    expect(taskMetaParts(t, getTaskInfo(t, NOW))).toEqual(['Hallway', 'Air', 'Due Oct 30', '$24', 'Seasonal']);
  });
});

describe('seasonal recommendations', () => {
  it('keeps what the homeowner chose after a reload', async () => {
    const store = await freshStore();
    const [first, second, third] = seasonalTipsFor(store.getSnapshot(), NOW).tips;
    expect(first.title).toBe('Service the furnace');

    await snoozeTip(store, first);
    await completeTip(store, second);
    const undoHide = await hideTip(store, third);

    const reloaded = new HomeStore((store as unknown as { db: never }).db);
    await reloaded.load();
    const after = seasonalTipsFor(reloaded.getSnapshot(), Date.now());
    expect(after.snoozed).toBe(1);
    expect(after.tips.map((t) => [t.title, t.status?.state])).toEqual([[second.title, 'done']]);
    expect(reloaded.getSnapshot().serviceEvents).toHaveLength(1);

    await undoHide();
    expect(seasonalTipsFor(store.getSnapshot(), Date.now()).tips.map((t) => t.title)).toContain(third.title);
  });

  it('leaves out suggestions already planned as tasks', () => {
    const data = home({ tasks: [task({ id: 'f', name: 'Service the furnace before winter' })] });
    expect(seasonalTipsFor(data, NOW).tips.map((t) => t.title)).not.toContain('Service the furnace');
  });
});

describe('Home overview', () => {
  it('summarises the home in five facts', () => {
    const data = home({
      property: { id: 'property', nickname: 'Maple Street', yearBuilt: 1998, updatedAt: '' },
      systems: [{ id: 's', kind: 'heating', name: 'Furnace', installYear: 2010, createdAt: '', updatedAt: '' }],
      tasks: [task({})],
    });
    const facts = snapshotFor(data, NOW, healthCheckFor(data, NOW));
    expect(facts.map((f) => [f.id, f.value])).toEqual([
      ['age', '28 years'],
      ['rooms', '0'],
      ['hvac', 'Plan a replacement'],
      ['next', 'Oct 30'],
      ['health', '38%'],
    ]);
  });

  it('puts overdue work first on the timeline, then months, with warranties', () => {
    const data = home({
      tasks: [task({ id: 'late', lastDoneAt: '2026-06-01' }), task({ id: 'soon', name: 'Test smoke alarms', lastDoneAt: '2026-10-20', intervalDays: 30 })],
      records: [record({ expiresAt: '2026-12-12' })],
    });
    const months = timelineFor(data, NOW);
    expect(months.map((m) => m.label)).toEqual(['Overdue', 'November', 'December']);
    expect(months[2].entries[0]).toMatchObject({ kind: 'warranty', title: 'Water heater warranty ends' });
  });

  it('counts a home with no tasks as having nothing overdue', () => {
    const health = healthCheckFor(home(), NOW);
    expect(health.done).toBe(1);
    expect(health.steps.find((s) => s.title.startsWith('Catch up'))?.ok).toBe(true);
  });
});

describe('Assistant answers from home data', () => {
  const data = home({
    property: { id: 'property', nickname: 'Maple Street', yearBuilt: 1998, updatedAt: '' },
    tasks: [task({})],
    records: [record({ expiresAt: '2026-12-12', vendor: 'Rheem' }), record({ id: 'c', kind: 'contractor', title: 'Rivera Plumbing', vendor: 'Plumber', phone: '555 201 3344' })],
    serviceEvents: [{ id: 'e', date: '2026-08-01', title: 'Clean the gutters', provider: 'Me', createdAt: '' }],
  });
  const ask = (q: string) => LocalGuideProvider.answer(q, data, NOW);

  it('plans the month from tasks and the season', async () => {
    const answer = await ask('What should I maintain this month?');
    expect(answer.title).toBe('This month at home');
    expect(answer.steps?.[0]).toMatch(/^Swap the HVAC filter/);
    expect(answer.steps?.some((s) => s.includes('(seasonal)'))).toBe(true);
  });

  it('finds a warranty, a contractor and a past job', async () => {
    expect((await ask('Find the warranty for my water heater')).steps?.[0]).toMatch(/^Water heater warranty · ends Dec 12, 2026 · Rheem/);
    expect((await ask('Who is our plumber?')).title).toBe('Rivera Plumbing');
    expect((await ask('When were the gutters last cleaned?')).text).toMatch(/last done on Aug 1, 2026 by Me/);
    expect((await ask('How old is my house?')).text).toMatch(/built in 1998/);
  });

  it('still lists warranties that are ending', async () => {
    expect((await ask('Which warranties are ending soon?')).title).toBe('1 ending in the next 90 days');
  });
});
