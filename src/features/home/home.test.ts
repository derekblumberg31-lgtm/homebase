import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../data/db';
import { emptyData, HomeStore, type HomeData } from '../../data/store';
import type { HomeRecord, Task } from '../../data/types';
import { firstNameOf } from '../../session/session';
import { LocalGuideProvider } from '../assistant/provider';
import { taskCategory, taskMetaParts } from '../tasks/meta';
import { getTaskInfo } from '../tasks/taskMath';
import { alertsFor, comingUpSub, arrangeAttention, attentionFor, endingSoon, homeStatusFor, seasonalTipsFor, snapshotFor, timelineFor } from './insights';
import { completeTip, hideTip, planDraftFor, planTip, snoozeTip } from './tipActions';
import { buildStarterTask, chooseStarter, starterJobsFor, starterSubLine, toggleStarter } from './firstJobs';
import { addStarterJobs } from './firstJobActions';
import { completeTask } from '../tasks/actions';

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

  it('nudges once there are 3 entries, whatever the onboarding date', () => {
    const three = [task({ id: 'a' }), task({ id: 'b' }), task({ id: 'c' })];
    expect(hasNudge(home({ household: household('2026-01-01T00:00:00.000Z') }))).toBe(false);
    expect(hasNudge(home({ household: household('2026-01-01T00:00:00.000Z'), tasks: [task({})] }))).toBe(false);
    expect(hasNudge(home({ household: household('2026-10-26T00:00:00.000Z'), tasks: three }))).toBe(true);
    expect(hasNudge(home({ tasks: three }))).toBe(true);
  });

  it('goes quiet after a backup and returns a month later', () => {
    const changed = [{ id: 'x', at: '2026-09-01T00:00:00.000Z', kind: 'task-added' as const, text: 'Added' }];
    const base = { household: household('2026-01-01T00:00:00.000Z'), records: [record({})], activity: changed };
    expect(hasNudge(home({ ...base, settings: settings('2026-10-20T00:00:00.000Z') }))).toBe(false);
    expect(hasNudge(home({ ...base, settings: settings('2026-08-01T00:00:00.000Z') }))).toBe(true);
    expect(hasNudge(home({ ...base, activity: [], settings: settings('2026-08-01T00:00:00.000Z') }))).toBe(false);
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

describe('comingUpSub', () => {
  it('counts warranties with the right noun', () => {
    expect(comingUpSub(5, 0)).toBe('5 in the next three months');
    expect(comingUpSub(5, 1)).toBe('5 in the next three months · 1 warranty ending');
    expect(comingUpSub(5, 3)).toBe('5 in the next three months · 3 warranties ending');
    expect(comingUpSub(0, 0)).toBe('Nothing in the next three months');
  });
});

describe('task metadata', () => {
  it('takes the category from the preset when a task has none', () => {
    expect(taskCategory({ typeId: 'custom' })).toBe('other');
    expect(taskCategory({ typeId: 'custom', category: 'air' })).toBe('air');
  });

  it('describes the kind and the date in one short line', () => {
    const t = task({ category: 'air', cost: 24, seasonal: true });
    expect(taskMetaParts(t, getTaskInfo(t, NOW))).toEqual(['Air', 'Due Oct 30']);
  });
});

describe('seasonal recommendations, when a later write fails', () => {
  it('planTip resolves once the task is saved, so a retry cannot save it twice', async () => {
    const store = await freshStore();
    const [tip] = seasonalTipsFor(store.getSnapshot(), NOW).tips;
    store.log = () => Promise.reject(new Error('no'));
    store.updateSettings = () => Promise.reject(new Error('no'));
    await expect(planTip(store, tip, task({ id: 'p1', name: tip.taskName }))).resolves.toBeUndefined();
    expect(store.getSnapshot().tasks.map((t) => t.id)).toEqual(['p1']);
  });

  it('planTip throws and saves nothing when the task cannot be saved', async () => {
    const store = await freshStore();
    const [tip] = seasonalTipsFor(store.getSnapshot(), NOW).tips;
    store.put = () => Promise.reject(new Error('no'));
    await expect(planTip(store, tip, task({ id: 'p1' }))).rejects.toThrow();
    expect(store.getSnapshot().tasks).toHaveLength(0);
  });

  it('completeTip takes its event back when the tip state cannot be saved, so a retry logs one', async () => {
    const store = await freshStore();
    const [tip] = seasonalTipsFor(store.getSnapshot(), NOW).tips;
    const real = store.updateSettings.bind(store);
    store.updateSettings = () => Promise.reject(new Error('no'));
    await expect(completeTip(store, tip)).rejects.toThrow();
    expect(store.getSnapshot().serviceEvents).toHaveLength(0);
    store.updateSettings = real;
    await completeTip(store, tip);
    expect(store.getSnapshot().serviceEvents).toHaveLength(1);
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
    expect(seasonalTipsFor(data, NOW).tips.filter((t) => !t.status).map((t) => t.title)).not.toContain('Service the furnace');
  });
});

describe('Home overview', () => {
  it('summarises the home in four facts', () => {
    const data = home({
      property: { id: 'property', nickname: 'Maple Street', yearBuilt: 1998, updatedAt: '' },
      systems: [{ id: 's', kind: 'heating', name: 'Furnace', installYear: 2010, createdAt: '', updatedAt: '' }],
      tasks: [task({})],
    });
    const facts = snapshotFor(data, NOW);
    expect(facts.map((f) => [f.id, f.value])).toEqual([
      ['age', '28 years'],
      ['rooms', '0'],
      ['hvac', 'Plan a replacement'],
      ['next', 'Oct 30'],
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

    const noBackup = arrangeAttention(attentionFor({ ...busy, settings: { ...busy.settings, lastBackupAt: '2026-10-20T00:00:00.000Z' } }, NOW), new Set());
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
    const data = home({ household, tasks: [task({ id: 'a' }), task({ id: 'b' }), task({ id: 'c' })] });
    expect(attentionFor(data, NOW).map((i) => i.id)).toContain('backup');
    expect(attentionFor(data, NOW, '2026-10-20T00:00:00.000Z').map((i) => i.id)).not.toContain('backup');
    const saved = home({ ...data, settings: { ...emptyData().settings, lastBackupAt: '2026-10-21T00:00:00.000Z' } });
    expect(attentionFor(saved, NOW, '2026-10-20T00:00:00.000Z').map((i) => i.id)).not.toContain('backup');
  });
});

describe('a home system\'s warranty', () => {
  // NOW is Oct 27, so Nov 16 is 20 days out and Nov 5 is 9 days out.
  const sys = { id: 's9', kind: 'heating' as const, name: 'Furnace', warrantyExpires: '2026-11-16', createdAt: '', updatedAt: '' };
  const data = home({ systems: [sys], records: [record({ id: 'r1', expiresAt: '2026-11-05' }), record({ id: 'r2', title: 'Roof warranty', expiresAt: '2026-12-01' })] });

  it('is a warranty row, sorted with record warranties soonest first', () => {
    const items = attentionFor(data, NOW).filter((i) => i.kind !== 'backup');
    expect(items.map((i) => i.id)).toEqual(['record-r1', 'system-warranty-s9', 'record-r2']);
    expect(items[1]).toMatchObject({ kind: 'warranty', title: 'Furnace warranty', href: '/property/systems/s9', dismissKey: 'system-warranty-s9:2026-11-16' });
  });

  it('reads as one warranty ending soon in the status sentence', () => {
    const only = home({ systems: [sys] });
    const counted = arrangeAttention(attentionFor(only, NOW), new Set()).counted;
    expect(homeStatusFor(only, NOW, counted).text).toBe('1 warranty ends soon');
  });

  it('is hidden by its dismiss key and comes back when the end date changes', () => {
    const only = home({ systems: [sys] });
    const key = 'system-warranty-s9:2026-11-16';
    expect(arrangeAttention(attentionFor(only, NOW), new Set([key])).counted).toHaveLength(0);
    const moved = home({ systems: [{ ...sys, warrantyExpires: '2026-11-20' }] });
    expect(arrangeAttention(attentionFor(moved, NOW), new Set([key])).counted).toHaveLength(1);
  });

  it('keeps out warranties that are over or far off', () => {
    expect(attentionFor(home({ systems: [{ ...sys, warrantyExpires: '2026-10-26' }] }), NOW)).toHaveLength(0);
    expect(attentionFor(home({ systems: [{ ...sys, warrantyExpires: '2027-03-01' }] }), NOW)).toHaveLength(0);
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

describe('starter jobs', () => {
  const names = (now: number, data = home()) => starterJobsFor(data, now).map((j) => j.name);

  it('offers three fall tips, then basics, up to five', () => {
    const jobs = starterJobsFor(home(), NOW);
    expect(jobs.map((j) => j.name)).toEqual(['Service the furnace', 'Drain and store garden hoses', 'Seal drafts around doors and windows', 'Change the HVAC filter', 'Smoke alarm batteries']);
    expect(jobs.map((j) => j.intervalDays)).toEqual([365, 365, 365, 90, 180]);
    expect(jobs.map((j) => j.seasonal)).toEqual([true, true, true, undefined, undefined]);
  });

  it('is empty once there is any task', () => {
    expect(starterJobsFor(home({ tasks: [task({})] }), NOW)).toEqual([]);
  });

  it('skips a basic that a tip already covers', () => {
    expect(names(new Date('2027-01-15T10:00:00').getTime())).toEqual(['Find and label the main water shut-off', 'Test the sump pump', 'Swap the HVAC filter', 'Smoke alarm batteries', 'Flush the water heater']);
    expect(names(new Date('2027-04-10T10:00:00').getTime())).toEqual(['Service the air conditioning', 'Clean the gutters', 'Test smoke and CO alarms', 'Change the HVAC filter', 'Flush the water heater']);
  });

  it('falls back to the basics when every tip is hidden', () => {
    const tipStates = Object.fromEntries(seasonalTipsFor(home(), NOW).tips.map((t) => [t.id, { state: 'hidden' as const, at: '2026-10-01T00:00:00.000Z' }]));
    const data = home({ settings: { ...emptyData().settings, tipStates } });
    expect(names(NOW, data)).toEqual(['Change the HVAC filter', 'Smoke alarm batteries', 'Flush the water heater', 'Check CO alarms', 'Clean the gutters']);
  });

  it('builds a recurring task first due on the chosen date, with no cost and no estimated last-done', () => {
    const [furnace, , , hvac] = starterJobsFor(home(), NOW);
    const built = buildStarterTask(furnace, 'not-sure', NOW);
    expect(built).toMatchObject({ kind: 'maintenance', recurring: true, status: 'open', intervalDays: 365, seasonal: true, location: '', lastDoneAt: '2026-10-27', dueDate: '2026-11-03' });
    expect(built.cost).toBeUndefined();
    expect(buildStarterTask(hvac, 'this-month', NOW)).toMatchObject({ typeId: 'custom', dueDate: '2027-01-10' });
  });

  it('ticks, unticks and answers rows as pure steps', () => {
    expect(toggleStarter({}, 'a')).toEqual({ a: 'not-sure' });
    expect(toggleStarter({ a: 'this-month' }, 'a')).toEqual({});
    expect(toggleStarter(toggleStarter({ a: 'this-month' }, 'a'), 'a')).toEqual({ a: 'not-sure' });
    expect(chooseStarter({ a: 'not-sure' }, 'a', 'few-months')).toEqual({ a: 'few-months' });
    expect(chooseStarter({}, 'a', 'few-months')).toEqual({});
  });

  it('describes each row before and after it is ticked', () => {
    const [furnace, , , hvac] = starterJobsFor(home(), NOW);
    expect(starterSubLine(furnace, undefined, NOW)).toBe('Every year · Seasonal');
    expect(starterSubLine(hvac, undefined, NOW)).toBe('Every 3 months');
    expect(starterSubLine(hvac, 'this-month', NOW)).toBe('Every 3 months · Next due Jan 10, 2027');
    expect(starterSubLine(furnace, 'not-sure', NOW)).toBe('Every year · Due within a week');
  });

  it('adds one ticked job and Home reads "1 job is due this week", not "All clear"', async () => {
    const store = await freshStore();
    const [furnace] = starterJobsFor(store.getSnapshot(), NOW);
    await addStarterJobs(store, [{ job: furnace, choice: 'not-sure' }], NOW);
    const data = store.getSnapshot();
    expect(data.tasks).toHaveLength(1);
    expect(data.tasks[0].dueDate).toBe('2026-11-03');
    expect(homeStatusFor(data, NOW, []).text).toBe('1 job is due this week');
  });

  it('adds two jobs, marks the tip planned, logs both, and Undo puts it all back', async () => {
    const store = await freshStore();
    const [furnace, , , hvac] = starterJobsFor(store.getSnapshot(), NOW);
    const { count, undo } = await addStarterJobs(store, [{ job: furnace, choice: 'not-sure' }, { job: hvac, choice: 'this-month' }], NOW);
    const data = store.getSnapshot();
    expect(count).toBe(2);
    expect(data.tasks).toHaveLength(2);
    expect(data.settings.tipStates?.['fall-2026:Service the furnace']).toMatchObject({ state: 'planned', taskId: data.tasks.find((t) => t.name === 'Service the furnace')?.id });
    expect(data.activity.filter((a) => a.kind === 'task-added').map((a) => a.text).sort()).toEqual(['Added: Change the HVAC filter', 'Planned: Service the furnace']);
    expect(seasonalTipsFor(data, NOW).tips.filter((t) => !t.status).map((t) => t.title)).not.toContain('Service the furnace');

    await undo();
    const after = store.getSnapshot();
    expect(after.tasks).toHaveLength(0);
    expect(after.activity.filter((a) => a.kind === 'task-added')).toHaveLength(0);
    expect(after.settings.tipStates ?? {}).toEqual({});
  });

  it('Undo of the starter add leaves a task that was done since, and a later Undo of the Done keeps it', async () => {
    const store = await freshStore();
    const [furnace, , , hvac] = starterJobsFor(store.getSnapshot(), NOW);
    const added = await addStarterJobs(store, [{ job: furnace, choice: 'not-sure' }, { job: hvac, choice: 'this-month' }], NOW);
    const furnaceTask = store.getSnapshot().tasks.find((t) => t.name === 'Service the furnace')!;
    const done = await completeTask(store, furnaceTask, { date: '2026-10-27' });

    await added.undo();
    expect(store.getSnapshot().tasks.map((t) => t.name)).toEqual(['Service the furnace']);
    expect(store.getSnapshot().activity.some((a) => a.text === 'Planned: Service the furnace')).toBe(true);
    expect(store.getSnapshot().settings.tipStates?.['fall-2026:Service the furnace']).toMatchObject({ state: 'planned' });

    await done.undo();
    expect(store.getSnapshot().tasks.map((t) => t.name)).toEqual(['Service the furnace']);
    expect(store.getSnapshot().serviceEvents).toEqual([]);
  });

  it('Undoing the Done first, then the starter add, leaves nothing behind', async () => {
    const store = await freshStore();
    const [furnace, , , hvac] = starterJobsFor(store.getSnapshot(), NOW);
    const added = await addStarterJobs(store, [{ job: furnace, choice: 'not-sure' }, { job: hvac, choice: 'this-month' }], NOW);
    const furnaceTask = store.getSnapshot().tasks.find((t) => t.name === 'Service the furnace')!;
    const done = await completeTask(store, furnaceTask, { date: '2026-10-27' });

    await done.undo();
    expect(store.getSnapshot().tasks.find((t) => t.name === 'Service the furnace')).toEqual(furnaceTask);
    await added.undo();
    const after = store.getSnapshot();
    expect(after.tasks).toEqual([]);
    expect(after.serviceEvents).toEqual([]);
    expect(after.activity.filter((a) => a.kind === 'task-added' || a.kind === 'task-done')).toEqual([]);
    expect(after.settings.tipStates ?? {}).toEqual({});
  });

  it('Undo of the starter add keeps a tip choice made in the meantime', async () => {
    const store = await freshStore();
    const [furnace, other] = starterJobsFor(store.getSnapshot(), NOW);
    const added = await addStarterJobs(store, [{ job: furnace, choice: 'not-sure' }], NOW);
    await store.updateSettings({ tipStates: { ...store.getSnapshot().settings.tipStates, [other.tipId!]: { state: 'hidden', at: '2026-10-27T20:00:00.000Z' } } });
    await added.undo();
    expect(store.getSnapshot().settings.tipStates).toEqual({ [other.tipId!]: { state: 'hidden', at: '2026-10-27T20:00:00.000Z' } });
  });

  it('keeps the tasks when only the extras fail', async () => {
    const store = await freshStore();
    const [furnace] = starterJobsFor(store.getSnapshot(), NOW);
    store.updateSettings = () => Promise.reject(new Error('no'));
    store.log = () => Promise.reject(new Error('no'));
    await expect(addStarterJobs(store, [{ job: furnace, choice: 'not-sure' }], NOW)).resolves.toMatchObject({ count: 1 });
    expect(store.getSnapshot().tasks).toHaveLength(1);
  });

  it('adds nothing and throws when the write fails', async () => {
    const store = await freshStore();
    const [furnace] = starterJobsFor(store.getSnapshot(), NOW);
    store.putMany = () => Promise.reject(new Error('no'));
    await expect(addStarterJobs(store, [{ job: furnace, choice: 'not-sure' }], NOW)).rejects.toThrow();
    expect(store.getSnapshot().tasks).toHaveLength(0);
  });
});
