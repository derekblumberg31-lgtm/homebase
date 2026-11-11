import type { DateString, Task } from '../../data/types';
import { addDays, isRealDate, startOfDay, toDateInput } from '../../lib/dates';
import { lastDoneKnown } from './taskMath';

export type LastDoneChoice = 'this-month' | 'few-months' | 'over-a-year' | 'not-sure';

export const LAST_DONE_OPTIONS: { value: LastDoneChoice; label: string }[] = [
  { value: 'this-month', label: 'This month' },
  { value: 'few-months', label: 'A few months ago' },
  { value: 'over-a-year', label: 'Over a year ago' },
  { value: 'not-sure', label: 'Not sure' },
];

// "Last done about k days ago", as a number of days.
const AGO: Record<Exclude<LastDoneChoice, 'not-sure'>, number> = { 'this-month': 15, 'few-months': 90, 'over-a-year': 365 };

/**
 * The first due date a rough answer gives: today + max(D − k, min(7, D)). A coarse guess never
 * makes a job overdue the day it is added, and never pushes a short job past its own interval.
 * "Not sure" is the floor itself.
 */
export function firstDueFor(choice: LastDoneChoice, intervalDays: number, now: number): DateString {
  const floor = Math.min(7, intervalDays);
  const offset = choice === 'not-sure' ? floor : Math.max(intervalDays - AGO[choice], floor);
  return toDateInput(addDays(startOfDay(now), offset));
}

interface ResolveInput {
  choice?: LastDoneChoice | 'date';
  date?: string;
  intervalDays: number;
  now: number;
  initial?: Task;
  draftDueDate?: DateString;
}

/**
 * What a recurring task stores from the "Last done" field. A real date is the last-done date with
 * no `dueDate`. A rough answer stores a first due date; `lastDoneAt` is then only the day the task
 * was added and is never shown. Nothing chosen keeps an edited task as it was, or a draft's due date.
 */
export function resolveLastDone(input: ResolveInput): { lastDoneAt: DateString; dueDate?: DateString } | { error: string } {
  const { choice, date, intervalDays, now, initial, draftDueDate } = input;
  const today = toDateInput(new Date(now));
  if (choice === 'date') {
    if (!date || !isRealDate(date)) return { error: 'Pick the date it was last done.' };
    if (date > today) return { error: 'Pick today or an earlier date.' };
    return { lastDoneAt: date, dueDate: undefined };
  }
  if (choice) {
    const addedOn = initial && !lastDoneKnown(initial) ? initial.lastDoneAt : today;
    return { lastDoneAt: addedOn, dueDate: firstDueFor(choice, intervalDays, now) };
  }
  if (initial?.recurring) return { lastDoneAt: initial.lastDoneAt, dueDate: initial.dueDate };
  if (draftDueDate) return { lastDoneAt: today, dueDate: draftDueDate };
  return { error: 'Choose when it was last done.' };
}
