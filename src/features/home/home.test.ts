import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../data/db';
import { emptyData, HomeStore, type HomeData } from '../../data/store';
import type { HomeRecord, Task } from '../../data/types';
import { firstNameOf } from '../../session/session';
import { LocalGuideProvider } from '../assistant/provider';
import { taskCategory, taskMetaParts } from '../tasks/meta';
import { getTaskInfo } from '../tasks/taskMath';
import { alertsFor, arrangeAttention, attentionFor, endingSoon, healthCheckFor, homeStatusFor, seasonalTipsFor, snapshotFor, timelineFor } from './insights';
import { completeTip, hideTip, planDraftFor, snoozeTip } from './tipActions';

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

describe('backup nudge', () => {
  const household = (onboardedAt: string) => ({ id: 'household' as const, name: 'Home', members: [], createdAt: onboardedAt, onboardedAt });
  const hasNudge = (data: HomeData) => alertsFor(data, NOW).some((alert) => alert.id === 'backup');
  const settings = (lastBackupAt?: string) => ({ ...emptyData().settings, lastBackupAt });

  it('waits until there is data and a month has passed', () => {
    expect(hasNudge(home({ household: household('2026-01-01T00:00:00.000Z') }))).toBe(false);
    expect(hasNudge(home({ household: household('2026-10-20T00:00:00.000Z'), tasks: [task({})] }))).toBe(false);
    expect(hasNudge(home({ household: household('2026-01-01T00:00:00.000Z'), tasks: [task({})] }))).toBe(true);
  });

  it('goes quiet after a backup and returns a month later', () => {
    const base = { household: household('2026-01-01T00:00:00.000Z'), records: [record({})] };
    expect(hasNudge(home({ ...base, settings: settings('2026-10-20T00:00:00.000Z') }))).toBe(false);
    expect(hasNudge(home({ ...base, settings: settings('2026-08-01T00:00:00.000Z') }))).toBe(true);
  });
});

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

  it('gives no Health Check credit for "0 overdue" when there are no tasks', () => {
    const health = healthCheckFor(home(), NOW);
    expect(health.done).toBe(0);
    expect(health.score).toBe(0);
    expect(health.steps.find((s) => s.title === 'Keep your tasks on schedule')?.ok).toBe(false);
  });

  it('credits the schedule step once tasks exist and none is overdue', () => {
    const step = (data: HomeData) => healthCheckFor(data, NOW).steps.find((s) => s.title === 'Keep your tasks on schedule' || s.title.startsWith('Catch up'));
    expect(step(home({ tasks: [task({ lastDoneAt: '2026-10-20' })] }))).toMatchObject({ title: 'Keep your tasks on schedule', ok: true });
    expect(step(home({ tasks: [task({ lastDoneAt: '2026-01-01' })] }))).toMatchObject({ title: 'Catch up on 1 overdue task', ok: false });
  });
});

describe('seasonal plan draft', () => {
  it('is due in two weeks with no invented last-done date', () => {
    const draft = planDraftFor({ taskName: 'Swap the HVAC filter', category: 'air' }, NOW);
    expect(draft).toMatchObject({ dueDate: '2026-11-10', intervalDays: 365, seasonal: true, kind: 'maintenance' });
    expect('lastDoneAt' in draft).toBe(false);
  });
});

describe('what needs a look', () => {
  const household = { id: 'household' as const, name: 'Home', members: [], createdAt: '2026-01-01T00:00:00.000Z', onboardedAt: '2026-01-01T00:00:00.000Z' };
  const system = { id: 's1', kind: 'water-heater' as const, name: 'Water heater', installYear: 2010, createdAt: '', updatedAt: '' };
  const busy = home({
    household,
    records: [record({ id: 'r2', title: 'Roof warranty', expiresAt: '2026-12-01' }), record({ id: 'r1', expiresAt: '2026-11-05' })],
    systems: [system],
  });

  it('keeps one 60-day window: the end date is in, a day later is out', () => {
    const ids = (expiresAt: string) => endingSoon([record({ expiresAt })], NOW).length;
    expect(ids('2026-12-26')).toBe(1);
    expect(ids('2026-12-27')).toBe(0);
    expect(ids('2026-10-26')).toBe(0);
    expect(ids('2026-10-27')).toBe(1);
  });

  it('orders warranties soonest first, then systems, then the backup', () => {
    expect(attentionFor(busy, NOW).map((i) => i.id)).toEqual(['record-r1', 'record-r2', 'system-s1', 'backup']);
  });

  it('gives the backup a guaranteed slot and counts the rest', () => {
    const { rows, more, counted } = arrangeAttention(attentionFor(busy, NOW), new Set());
    expect(rows.map((i) => i.id)).toEqual(['record-r1', 'backup']);
    expect(more.map((i) => i.id)).toEqual(['record-r2', 'system-s1']);
    expect(counted).toHaveLength(3);

    const noBackup = arrangeAttention(attentionFor({ ...busy, household: undefined }, NOW), new Set());
    expect(noBackup.rows.map((i) => i.id)).toEqual(['record-r1', 'record-r2']);
    expect(noBackup.more.map((i) => i.id)).toEqual(['system-s1']);
  });

  it('hides a dismissed row until its end date changes', () => {
    const key = 'record-r1:2026-11-05';
    const hidden = arrangeAttention(attentionFor(busy, NOW), new Set([key]));
    expect(hidden.rows.map((i) => i.id)).not.toContain('record-r1');
    expect(hidden.counted.map((i) => i.id)).not.toContain('record-r1');

    const moved = home({ ...busy, records: [record({ id: 'r1', expiresAt: '2026-11-06' })] });
    expect(arrangeAttention(attentionFor(moved, NOW), new Set([key])).counted.map((i) => i.id)).toContain('record-r1');
  });

  it('keeps a hidden backup row away until a backup is saved after hiding it', () => {
    const data = home({ household, tasks: [task({})] });
    expect(attentionFor(data, NOW).map((i) => i.id)).toContain('backup');
    expect(attentionFor(data, NOW, '2026-10-20T00:00:00.000Z').map((i) => i.id)).not.toContain('backup');
    const saved = home({ ...data, settings: { ...emptyData().settings, lastBackupAt: '2026-10-21T00:00:00.000Z' } });
    expect(attentionFor(saved, NOW, '2026-10-20T00:00:00.000Z').map((i) => i.id)).not.toContain('backup');
  });
});

describe('the status sentence', () => {
  const household = { id: 'household' as const, name: 'Home', members: [], createdAt: '2026-01-01T00:00:00.000Z', onboardedAt: '2026-01-01T00:00:00.000Z' };
  const status = (data: HomeData) => homeStatusFor(data, NOW, arrangeAttention(attentionFor(data, NOW), new Set()).counted);
  const late = (id: string) => task({ id, lastDoneAt: '2026-06-01' });
  const dueNov3 = (id: string) => task({ id, lastDoneAt: '2026-08-05' });
  const hvacNov30 = task({ id: 'next', lastDoneAt: '2026-09-01' });
  const warranty = (id: string, expiresAt: string) => record({ id, expiresAt });
  const oldSystem = { id: 's1', kind: 'water-heater' as const, name: 'Water heater', installYear: 2010, createdAt: '', updatedAt: '' };

  it('says what to do on an empty home', () => {
    expect(status(home())).toMatchObject({ tone: 'empty', text: 'Add the jobs your home needs' });
  });

  it('names overdue jobs first and keeps to two clauses', () => {
    const two = status(home({ tasks: [late('a'), late('b')], records: [warranty('r1', '2026-11-05')] }));
    expect(two.text).toBe('2 jobs are overdue, and 1 warranty ends soon');
    expect(two.clauses).toHaveLength(2);
    expect(two.tone).toBe('overdue');
    expect(status(home({ tasks: [late('a')], records: [warranty('r1', '2026-11-05')], systems: [oldSystem] })).text).toBe('1 job is overdue, and 2 other things need a look');
  });

  it('describes systems and end dates', () => {
    expect(status(home({ tasks: [hvacNov30], systems: [oldSystem] })).text).toBe('Nothing is overdue, and 1 system is past its usual life');
    expect(status(home({ tasks: [hvacNov30], records: [warranty('r1', '2026-11-05'), warranty('r2', '2026-11-06')] })).text).toBe('Nothing is overdue, and 2 warranties end soon');
    expect(status(home({ tasks: [hvacNov30], records: [record({ id: 'c', kind: 'insurance', expiresAt: '2026-11-05' })] })).text).toBe('Nothing is overdue, and 1 end date is coming up');
    expect(status(home({ records: [warranty('r1', '2026-11-05')] })).text).toBe('1 warranty ends soon');
  });

  it('is all clear only when nothing is overdue, due this week, or alerting', () => {
    const clear = status(home({ tasks: [{ ...hvacNov30, name: 'Swap the HVAC filter' }] }));
    expect(clear).toMatchObject({ tone: 'clear', text: 'All clear. Next up on Nov 30: Swap the HVAC filter' });
    // A stale backup is about this device, not the home.
    expect(status(home({ household, tasks: [hvacNov30] })).tone).toBe('clear');
    expect(status(home({ tasks: [task({ id: 'x', lastDoneAt: '2026-08-06' })] })).tone).toBe('clear');
    expect(status(home({ tasks: [{ ...hvacNov30, status: 'done' }] })).text).toBe('All clear. Nothing else is planned');
  });

  it('counts jobs due within seven days', () => {
    expect(status(home({ tasks: [dueNov3('a'), dueNov3('b')] }))).toMatchObject({ tone: 'attention', text: '2 jobs are due this week' });
    expect(status(home({ tasks: [task({ lastDoneAt: '2026-07-29' })] })).text).toBe('1 job is due this week');
    expect(status(home({ tasks: [late('a'), dueNov3('b'), dueNov3('c')] })).text).toBe('1 job is overdue, and 2 more are due this week');
    expect(status(home({ tasks: [dueNov3('a')], records: [warranty('r1', '2026-11-05')] })).text).toBe('1 job is due this week, and 1 warranty ends soon');
  });

  it('reads "N jobs are due this week" for freshly added not-sure starter jobs', () => {
    const starters = ['a', 'b', 'c'].map((id) => task({ id, lastDoneAt: '2026-10-27', dueDate: '2026-11-03', intervalDays: 365 }));
    expect(status(home({ tasks: starters })).text).toBe('3 jobs are due this week');
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
