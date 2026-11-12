import { describe, expect, it } from 'vitest';
import type { Task } from '../data/types';
import { buildCalendar } from './calendar';

const NOW = new Date('2026-11-12T10:00:00');

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  kind: 'maintenance',
  name: 'Change the filter',
  typeId: 'custom',
  location: '',
  lastDoneAt: '2026-08-01',
  intervalDays: 90,
  recurring: true,
  dueDate: '2026-12-01',
  status: 'open',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

/** Joins folded lines back together and undoes the text escaping, the way a calendar app reads them. */
const unfold = (text: string) => text.replace(/\r\n /g, '');
const unescape = (text: string) => text.replace(/\\n/g, '\n').replace(/\\([,;\\])/g, '$1');

describe('buildCalendar', () => {
  it('T1: a recurring 90-day job in the future repeats monthly from its due date', () => {
    const ics = unfold(buildCalendar([task()], NOW));
    expect(ics).toContain('RRULE:FREQ=MONTHLY;INTERVAL=3');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261201');
    expect(ics).not.toContain('Was due');
  });

  it('maps yearly, weekly and odd intervals', () => {
    expect(buildCalendar([task({ intervalDays: 365 })], NOW)).toContain('RRULE:FREQ=YEARLY;INTERVAL=1');
    expect(buildCalendar([task({ intervalDays: 14 })], NOW)).toContain('RRULE:FREQ=WEEKLY;INTERVAL=2');
    expect(buildCalendar([task({ intervalDays: 10 })], NOW)).toContain('RRULE:FREQ=DAILY;INTERVAL=10');
  });

  it('T2: an overdue one-off starts today and says when it was due', () => {
    const ics = unfold(buildCalendar([task({ recurring: false, dueDate: '2026-09-10' })], NOW));
    expect(ics).toContain('DTSTART;VALUE=DATE:20261112');
    expect(ics).toContain('DTEND;VALUE=DATE:20261113');
    expect(ics).not.toContain('RRULE');
    const description = unescape(ics.split('\r\n').find((l) => l.startsWith('DESCRIPTION:From') || l.startsWith('DESCRIPTION:Was'))!);
    expect(description).toContain('Was due Sep 10, 2026');
    expect(ics).toContain('SUMMARY:Change the filter');
  });

  it('T3: leaves out done jobs, uses a snooze date, escapes text and folds long lines', () => {
    const long = task({ id: 'long', name: 'Seal, caulk; and “check” the windows — all of them, upstairs and down, including the sunroom and the porch', nextDue: '2026-12-05', dueDate: '2026-12-01' });
    const done = task({ id: 'done', status: 'done' });
    const text = buildCalendar([long, done], NOW);
    expect(text.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(text).not.toContain('done@homebase');
    expect(text).toContain('DTSTART;VALUE=DATE:20261205');
    expect(unfold(text)).toContain('SUMMARY:Seal\\, caulk\\; and');
    const encoder = new TextEncoder();
    for (const line of text.split('\r\n')) expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
  });

  it('T4: the UID is stable across builds', () => {
    const uids = (text: string) => text.split('\r\n').filter((l) => l.startsWith('UID:'));
    expect(uids(buildCalendar([task()], NOW))).toEqual(['UID:t1@homebase']);
    expect(uids(buildCalendar([task()], new Date('2027-01-01T00:00:00')))).toEqual(['UID:t1@homebase']);
  });
});

describe('buildCalendar with private: true (the subscription link)', () => {
  const detailed = task({ location: 'Behind the water heater', notes: 'Gate code 4417, ask the neighbour', name: 'Flush the water heater', dueDate: '2026-12-01' });

  it('drops where the job is and the notes, and keeps name, date, repeat, alarm and the source line', () => {
    const ics = unfold(buildCalendar([detailed], NOW, { private: true }));
    expect(ics).not.toContain('Where:');
    expect(ics).not.toContain('Behind the water heater');
    expect(ics).not.toContain('4417');
    expect(ics).toContain('SUMMARY:Flush the water heater');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261201');
    expect(ics).toContain('RRULE:FREQ=MONTHLY;INTERVAL=3');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('From Homebase.');
  });

  it('keeps "Was due" for an overdue job, and still leaves out done jobs', () => {
    const ics = unescape(unfold(buildCalendar([task({ recurring: false, dueDate: '2026-09-10', location: 'Garage' }), task({ id: 'done', status: 'done', name: 'Already done' })], NOW, { private: true })));
    expect(ics).toContain('Was due Sep 10, 2026');
    expect(ics).not.toContain('Garage');
    expect(ics).not.toContain('Already done');
  });

  it('the file download still carries the place and notes', () => {
    const ics = unfold(buildCalendar([detailed], NOW));
    expect(ics).toContain('Where: Behind the water heater');
    expect(ics).toContain('Gate code 4417');
  });
});
