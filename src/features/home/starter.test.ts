import { describe, expect, it } from 'vitest';
import { buildBackup, parseHomebaseBackup, readBackup } from '../../data/backup';
import { emptyData, type HomeData } from '../../data/store';
import type { Task } from '../../data/types';
import { buildCalendar } from '../../lib/calendar';
import { toDateInput } from '../../lib/dates';
import { createRepairTask, resolveIssue } from '../assistant/issueActions';
import { GUIDES } from '../assistant/guides';
import { LocalGuideProvider } from '../assistant/provider';
import { freshStore } from '../../test/freshStore';
import { rescheduleTask, snoozeTask, completeTask } from '../tasks/actions';
import { inferTask, guessForJob } from '../tasks/infer';
import { getTaskInfo, lastDoneKnown } from '../tasks/taskMath';
import { guessFields } from '../tasks/infer';
import { healthDoneText, healthPageSummary, healthRowText, savedLocation, starterCheckFor, STARTER_STEPS } from './starter';
import { markNotApplicable, markTested, reopenStep, saveLocation } from './starterActions';

const home = (over: Partial<HomeData> = {}): HomeData => ({ ...emptyData(), ...over });

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  kind: 'maintenance',
  name: 'Swap the HVAC filter',
  typeId: 'custom',
  location: '',
  lastDoneAt: '2026-08-01',
  intervalDays: 90,
  recurring: true,
  status: 'open',
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('starter Home Health Check', () => {
  it('gives a brand-new home eight concrete steps with time, priority and an action', () => {
    const check = starterCheckFor(home());
    expect(check.steps).toHaveLength(8);
    expect(check.done).toBe(0);
    expect(check.next?.id).toBe('water-shutoff');
    expect(check.minutesLeft).toBeGreaterThan(30);
    for (const step of check.steps) {
      expect(step.why.length).toBeGreaterThan(20);
      expect(step.minutes).toBeGreaterThan(0);
      expect(step.action.label).toBeTruthy();
    }
  });

  it('drops the gas step for homes without gas and finishes data steps on its own', () => {
    const now = new Date().toISOString();
    const check = starterCheckFor(
      home({
        settings: { ...emptyData().settings, hasGas: false },
        systems: [{ id: 's', kind: 'water-heater', name: 'Water heater', createdAt: now, updatedAt: now }],
      }),
    );
    expect(check.total).toBe(7);
    expect(check.steps.find((s) => s.id === 'gas-shutoff')?.status).toBe('not-applicable');
    expect(check.steps.find((s) => s.id === 'water-heater')).toMatchObject({ status: 'done', auto: true });
  });

  it('saves a shutoff location as a household note the Assistant can quote, with undo', async () => {
    const store = await freshStore();
    const undo = await saveLocation(store, 'water-shutoff', 'Basement by the meter');
    const data = store.getSnapshot();
    expect(data.records[0]).toMatchObject({ kind: 'note', title: 'Main water shutoff', notes: 'Basement by the meter' });
    expect(savedLocation(data, 'water-shutoff')).toBe('Basement by the meter');
    expect(starterCheckFor(data).done).toBe(1);
    await undo();
    expect(store.getSnapshot().records).toHaveLength(0);
    expect(starterCheckFor(store.getSnapshot()).done).toBe(0);
  });

  it('logs an alarm test and sets up a monthly reminder', async () => {
    const store = await freshStore();
    await markTested(store, 'smoke-alarms');
    const data = store.getSnapshot();
    expect(data.serviceEvents[0].title).toBe('Test smoke alarms');
    expect(data.tasks[0]).toMatchObject({ name: 'Test smoke alarms', recurring: true, intervalDays: 30, priority: 'high', category: 'safety' });
    expect(data.activity[0].text).toMatch(/Health Check/);
    await markNotApplicable(store, 'gas-shutoff');
    expect(starterCheckFor(store.getSnapshot()).total).toBe(7);
    await reopenStep(store, 'gas-shutoff');
    expect(starterCheckFor(store.getSnapshot()).total).toBe(8);
  });

  it('saves no provider the homeowner never gave', async () => {
    const store = await freshStore();
    await markTested(store, 'smoke-alarms');
    expect(store.getSnapshot().serviceEvents[0].provider).toBeUndefined();
  });

  it('tests an existing "Not sure" smoke task in place: its first-due date and snooze are cleared and the last-done date becomes known', async () => {
    const store = await freshStore();
    const added = task({ id: 'smoke', name: 'Smoke alarm batteries', intervalDays: 365, lastDoneAt: '2026-11-01', dueDate: '2026-11-20', nextDue: '2026-11-27' });
    expect(lastDoneKnown(added)).toBe(false);
    await store.put('tasks', added);
    await markTested(store, 'smoke-alarms');
    const tasks = store.getSnapshot().tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].dueDate).toBeUndefined();
    expect(tasks[0].nextDue).toBeUndefined();
    expect(tasks[0].lastDoneAt).toBe(toDateInput());
    expect(lastDoneKnown(tasks[0])).toBe(true);
  });
});

describe('task inference', () => {
  it('knows a typical cost but never offers it as a field to fill in', () => {
    expect(guessForJob('hvac-filter')?.cost).toBe(14);
    expect(inferTask('clean gutters')?.cost).toBe(25);
    for (const text of ['hvac filter', 'clean gutters', 'flush water heater', 'service the furnace', 'fire extinguisher', 'change the furnace filter']) {
      const guess = inferTask(text)!;
      expect(guess).toBeTruthy();
      expect(guessFields(guess, new Set())).not.toHaveProperty('cost');
    }
  });

  it('leaves fields the homeowner already set alone', () => {
    const guess = guessForJob('hvac-filter')!;
    const fields = guessFields(guess, new Set(['interval', 'priority']));
    expect(fields).not.toHaveProperty('intervalDays');
    expect(fields).not.toHaveProperty('priority');
    expect(fields.category).toBe('air');
  });

  it('fills sensible defaults for common jobs', () => {
    expect(guessForJob('hvac-filter')).toMatchObject({ kind: 'maintenance', category: 'air', intervalDays: 90, typeId: 'hvac-1' });
    expect(inferTask('change the furnace filter')).toMatchObject({ category: 'air', intervalDays: 90 });
    expect(inferTask('clean gutters')).toMatchObject({ seasonal: true, category: 'outdoor' });
    expect(inferTask('Fix the leak under the bathroom sink')).toMatchObject({ kind: 'repair', priority: 'high', category: 'water' });
    expect(inferTask('Repaint the guest room')).toMatchObject({ kind: 'project' });
    expect(inferTask('ab')).toBeNull();
  });
});

describe('snooze, reschedule and calendar', () => {
  it('moves the due date, then returns to the normal rhythm once done', async () => {
    const store = await freshStore();
    const t = task({ lastDoneAt: '2026-01-01' });
    await store.put('tasks', t);
    const now = new Date('2026-06-01T12:00:00').getTime();
    expect(getTaskInfo(t, now).status).toBe('overdue');
    const { nextDue } = await snoozeTask(store, t, 7, now);
    expect(nextDue).toBe('2026-06-08');
    const snoozed = store.getSnapshot().tasks[0];
    expect(getTaskInfo(snoozed, now).status).toBe('due');
    await completeTask(store, snoozed, { date: '2026-06-02' });
    const done = store.getSnapshot().tasks[0];
    expect(done.nextDue).toBeUndefined();
    expect(getTaskInfo(done, now).dueDate.getMonth()).toBe(7); // Aug 31
    await rescheduleTask(store, task({ id: 'r', recurring: false, kind: 'repair', dueDate: '2026-06-01' }), '2026-07-04');
    expect(store.getSnapshot().tasks.find((x) => x.id === 'r')?.dueDate).toBe('2026-07-04');
  });

  it('exports open tasks as calendar events, recurring ones with a repeat rule', () => {
    const ics = buildCalendar([task({ name: 'Swap, the filter' }), task({ id: 'x', status: 'done' })], new Date('2026-01-01T00:00:00Z'));
    expect(ics).toMatch(/^BEGIN:VCALENDAR/);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261030');
    expect(ics).toContain('RRULE:FREQ=MONTHLY;INTERVAL=3');
    expect(ics).toContain('SUMMARY:Swap\\, the filter');
  });
});

describe('action-oriented Assistant', () => {
  const now = new Date('2026-11-05T19:00:00').getTime();
  const stamp = new Date().toISOString();
  const data = home({
    settings: { ...emptyData().settings, healthSteps: { 'water-shutoff': { state: 'done', at: stamp, note: 'Garage left wall' } } },
    systems: [{ id: 'h', kind: 'heating', name: 'Furnace', brand: 'Carrier', installYear: 2005, warrantyExpires: '2027-01-01', createdAt: stamp, updatedAt: stamp }],
    records: [{ id: 'c', kind: 'contractor', title: 'Rivera Plumbing', vendor: 'Plumber', phone: '555', fileIds: [], createdAt: stamp, updatedAt: stamp }],
  });

  it('answers a leak with emergency limits, questions, saved shutoff and contractor', async () => {
    const answer = await LocalGuideProvider.answer('There’s water leaking under the sink', data, now);
    expect(answer.issue?.guide.id).toBe('water-leak');
    expect(answer.issue?.guide.emergency).toMatch(/911/);
    expect(answer.issue?.guide.questions?.length).toBeGreaterThanOrEqual(2);
    expect(answer.issue?.guide.proOnly?.length).toBeGreaterThan(0);
    const facts = answer.issue!.context.facts.map((f) => `${f.label}: ${f.text}`);
    expect(facts).toContain('Main water shutoff: Garage left wall');
    expect(answer.issue?.context.contractor?.title).toBe('Rivera Plumbing');
  });

  it('uses the home’s heating system, age and warranty for no heat', async () => {
    const answer = await LocalGuideProvider.answer('The heat isn’t working', data, now);
    expect(answer.issue?.guide.id).toBe('no-heat');
    expect(answer.issue?.context.subject).toMatchObject({ kind: 'system', id: 'h' });
    const text = answer.issue!.context.facts.map((f) => f.text).join(' ');
    expect(text).toMatch(/Carrier/);
    expect(text).toMatch(/21 years old/);
    expect(text).toMatch(/Covered until/);
  });

  it('covers chirping alarms, power outages and appliances', async () => {
    expect((await LocalGuideProvider.answer('My smoke alarm keeps chirping', data, now)).issue?.guide.id).toBe('smoke-alarm');
    expect((await LocalGuideProvider.answer('The power is out in part of the house', data, now)).issue?.guide.id).toBe('power-out');
    expect((await LocalGuideProvider.answer('My dishwasher stopped working', data, now)).issue?.guide.id).toBe('appliance');
    expect((await LocalGuideProvider.answer('Problem with my furnace', data, now)).issue?.guide.id).toBe('no-heat');
  });

  it('turns an answer into a repair task and a resolved Service History entry', async () => {
    const store = await freshStore();
    const guide = GUIDES.find((g) => g.id === 'water-leak')!;
    const issue = { guide, question: 'Leak under the sink', answers: ['Is water still coming out? Stopped after closing a valve'] };
    const repair = await createRepairTask(store, issue, false);
    expect(repair).toMatchObject({ kind: 'repair', name: 'Fix the water leak', category: 'water' });
    expect(repair.notes).toMatch(/Leak under the sink/);
    expect(repair.notes).toMatch(/Stopped after closing a valve/);
    await resolveIssue(store, issue, { provider: 'Me', notes: 'New supply line' });
    const event = store.getSnapshot().serviceEvents[0];
    expect(event).toMatchObject({ title: 'Resolved: Water leak', provider: 'Me' });
    expect(store.getSnapshot().activity[0].text).toBe('Resolved: Water leak');
  });
});

describe('backup compatibility', () => {
  it('restores an older backup without the newer optional fields', () => {
    const old = JSON.stringify({ app: 'Homebase', version: 1, exportedAt: '2026-01-01T00:00:00Z', data: { settings: { id: 'settings', theme: 'light', reminders: false, dismissedTips: [], keyDebug: false }, tasks: [task()] }, files: [] });
    const { data } = parseHomebaseBackup(readBackup(old)!);
    expect(data.settings.healthSteps).toBeUndefined();
    expect(starterCheckFor(data).steps).toHaveLength(8);
    expect(getTaskInfo(data.tasks[0], Date.now()).dueDate).toBeInstanceOf(Date);
  });

  it('keeps the new fields through a backup round trip', async () => {
    const stamp = new Date().toISOString();
    const data = home({
      settings: { ...emptyData().settings, healthSteps: { 'water-shutoff': { state: 'done', at: stamp, note: 'Basement' } }, hasGas: false },
      systems: [{ id: 's', kind: 'heating', name: 'Furnace', serial: 'SN1', warrantyExpires: '2027-01-01', createdAt: stamp, updatedAt: stamp }],
      tasks: [task({ nextDue: '2026-12-01', systemId: 's' })],
    });
    const { data: back } = parseHomebaseBackup(readBackup(await buildBackup(data, []))!);
    expect(back.settings.healthSteps?.['water-shutoff']?.note).toBe('Basement');
    expect(back.systems[0]).toMatchObject({ serial: 'SN1', warrantyExpires: '2027-01-01' });
    expect(back.tasks[0]).toMatchObject({ nextDue: '2026-12-01', systemId: 's' });
  });
});

describe('Health Check progress figures agree', () => {
  const withDone = (n: number) =>
    home({ settings: { ...emptyData().settings, healthSteps: Object.fromEntries(STARTER_STEPS.slice(0, n).map((s) => [s.id, { state: 'done', at: '2026-11-01' }])) } as HomeData['settings'] });

  it.each([0, 3, 8])('shows the same "N of 8 done" on the Home row and the page at %i done', (n) => {
    const check = starterCheckFor(withDone(n));
    expect(check.done).toBe(n);
    const figure = `${n} of 8 done`;
    expect(healthDoneText(check)).toBe(figure);
    expect(healthRowText(check).startsWith(figure)).toBe(true);
    expect(healthPageSummary(check).startsWith(figure)).toBe(true);
    for (const text of [healthRowText(check), healthPageSummary(check)]) expect(text).not.toMatch(/%|set up/);
  });

  it('drops the minutes at 8 of 8 and pluralises steps left', () => {
    expect(healthRowText(starterCheckFor(withDone(8)))).toBe('8 of 8 done');
    expect(healthRowText(starterCheckFor(withDone(3)))).toMatch(/^3 of 8 done · about \d+ min$/);
    expect(healthPageSummary(starterCheckFor(withDone(7)))).toMatch(/1 step left/);
    expect(healthPageSummary(starterCheckFor(withDone(3)))).toMatch(/5 steps left/);
  });
});
