import type { Task } from '../data/types';
import { dueDateOf } from '../features/tasks/taskMath';
import { toDateInput } from './dates';

/**
 * Calendar export (.ics). Browsers can't wake Homebase to send a reminder while it's closed, and
 * there's no server, so the dependable way to be reminded is the calendar the homeowner already
 * has. Each task becomes an all-day event with an alert at 9 a.m.; recurring tasks repeat.
 */

const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** Lines over 75 octets fold onto continuation lines, as RFC 5545 asks. */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += 73) parts.push((i ? ' ' : '') + line.slice(i, i + 73));
  return parts.join('\r\n');
}

const compact = (date: string) => date.replace(/-/g, '');

function stamp(now: Date) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function rrule(days: number): string {
  if (days % 365 === 0) return `FREQ=YEARLY;INTERVAL=${days / 365}`;
  if (days % 30 === 0) return `FREQ=MONTHLY;INTERVAL=${days / 30}`;
  if (days % 7 === 0) return `FREQ=WEEKLY;INTERVAL=${days / 7}`;
  return `FREQ=DAILY;INTERVAL=${days}`;
}

export function taskEvent(task: Task, now = new Date()): string[] {
  const due = toDateInput(dueDateOf(task));
  const next = new Date(`${due}T12:00:00`);
  next.setDate(next.getDate() + 1);
  const description = [task.location ? `Where: ${task.location}` : null, task.notes ?? null, 'From Homebase. Mark it done in the app so the next date moves.'].filter(Boolean).join('\n');
  return [
    'BEGIN:VEVENT',
    `UID:${task.id}@homebase`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;VALUE=DATE:${compact(due)}`,
    `DTEND;VALUE=DATE:${compact(toDateInput(next))}`,
    `SUMMARY:${escape(task.name)}`,
    `DESCRIPTION:${escape(description)}`,
    ...(task.recurring ? [`RRULE:${rrule(task.intervalDays)}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escape(task.name)}`,
    'TRIGGER;RELATED=START:PT9H',
    'END:VALARM',
    'END:VEVENT',
  ].map(fold);
}

export function buildCalendar(tasks: Task[], now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Homebase//Home maintenance//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Homebase'];
  for (const task of tasks.filter((t) => t.status === 'open')) lines.push(...taskEvent(task, now));
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
