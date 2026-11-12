import type { Task } from '../data/types';
import { dueDateOf } from '../features/tasks/taskMath';
import { formatDate, toDateInput } from './dates';

/**
 * Calendar export (.ics). Browsers can't wake Homebase to send a reminder while it's closed, and
 * there's no server, so the dependable way to be reminded is the calendar the homeowner already
 * has. Each task becomes an all-day event with an alert at 9 a.m.; recurring tasks repeat.
 */

const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/\r\n?|\n/g, '\\n').replace(/([,;])/g, '\\$1');

const encoder = new TextEncoder();

/** Lines over 75 octets fold onto continuation lines (each begins with a space), as RFC 5545 asks. Never splits a character. */
function fold(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    // Continuation lines start with a space, so they hold one octet less.
    const limit = parts.length ? 74 : 75;
    if (size + bytes > limit) {
      parts.push(parts.length ? ` ${current}` : current);
      current = '';
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(parts.length ? ` ${current}` : current);
  return parts.join('\r\n');
}

const compact = (date: string) => date.replace(/-/g, '');

function stamp(now: Date) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Homebase's repeat is whole days. Calendars repeat by year, month or week, so months here are a 30-day approximation of Homebase's own.
 * `start` is the first date (YYYY-MM-DD). A calendar skips a month that has no 29th, 30th or 31st rather than using its last day,
 * so for those start days the rule picks the last valid day from 28 up to the start day (BYMONTHDAY with BYSETPOS=-1):
 * a 31st lands on the last day of every month, a 30th on the 30th or Feb's last day, a 29th on the 29th or Feb's last day.
 * The result depends only on the start date, not on the day it was exported.
 */
function rrule(days: number, start: string): string {
  const month = Number(start.slice(5, 7));
  const day = Number(start.slice(8, 10));
  const upTo = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i).join(',');
  if (days % 365 === 0) {
    const base = `FREQ=YEARLY;INTERVAL=${days / 365}`;
    return month === 2 && day === 29 ? `${base};BYMONTH=2;BYMONTHDAY=${upTo(28, 29)};BYSETPOS=-1` : base;
  }
  if (days % 30 === 0) {
    const base = `FREQ=MONTHLY;INTERVAL=${days / 30}`;
    return day > 28 ? `${base};BYMONTHDAY=${upTo(28, day)};BYSETPOS=-1` : base;
  }
  if (days % 7 === 0) return `FREQ=WEEKLY;INTERVAL=${days / 7}`;
  return `FREQ=DAILY;INTERVAL=${days}`;
}

export interface CalendarOptions {
  /**
   * For the subscription link, which anyone holding the URL can read: drops the place and the notes,
   * leaving the job name, its date, how it repeats, the alarm and a line saying where it came from.
   */
  private?: boolean;
}

export function taskEvent(task: Task, now = new Date(), options: CalendarOptions = {}): string[] {
  const dueDate = toDateInput(dueDateOf(task));
  const today = toDateInput(now);
  // A job that is already overdue starts today, so its alert still fires and the series isn't planted in the past.
  const overdue = dueDate < today;
  const due = overdue ? today : dueDate;
  const next = new Date(`${due}T12:00:00`);
  next.setDate(next.getDate() + 1);
  const description = [
    overdue ? `Was due ${formatDate(dueDate)}.` : null,
    !options.private && task.location ? `Where: ${task.location}` : null,
    !options.private ? (task.notes ?? null) : null,
    options.private ? 'From Homebase. This calendar updates when your jobs change.' : 'From Homebase. This entry doesn’t move when you mark the job done; export again after big changes.',
  ]
    .filter(Boolean)
    .join('\n');
  return [
    'BEGIN:VEVENT',
    `UID:${task.id}@homebase`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;VALUE=DATE:${compact(due)}`,
    `DTEND;VALUE=DATE:${compact(toDateInput(next))}`,
    `SUMMARY:${escape(task.name)}`,
    `DESCRIPTION:${escape(description)}`,
    ...(task.recurring ? [`RRULE:${rrule(task.intervalDays, due)}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escape(task.name)}`,
    'TRIGGER;RELATED=START:PT9H',
    'END:VALARM',
    'END:VEVENT',
  ].map(fold);
}

export function buildCalendar(tasks: Task[], now = new Date(), options: CalendarOptions = {}): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Homebase//Home maintenance//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Homebase'];
  // A subscribed calendar is re-read by the calendar app; ask it to look about hourly.
  if (options.private) lines.push('REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H');
  for (const task of tasks.filter((t) => t.status === 'open')) lines.push(...taskEvent(task, now, options));
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/** Saves the file on this device. Nothing is uploaded anywhere. */
export function downloadCalendar(tasks: Task[], name = `homebase-tasks-${toDateInput()}.ics`) {
  const blob = new Blob([buildCalendar(tasks)], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Every open job in one file, named for the day it was made. */
export function exportSchedule(tasks: Task[]) {
  downloadCalendar(tasks, `homebase-schedule-${toDateInput()}.ics`);
}
