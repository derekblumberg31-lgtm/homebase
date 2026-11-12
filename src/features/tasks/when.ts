import { addDays, toDateInput } from '../../lib/dates';

/** The quick "When" choices on a one-off task. */
export type When = 'today' | 'week' | 'month' | 'date';

export const WHEN_OPTIONS: { value: When; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'In a week' },
  { value: 'month', label: 'This month' },
  { value: 'date', label: 'Pick a date' },
];

/** Today; seven days from today; the last day of this calendar month (today, if it is the last day); or the picked date. */
export function whenToDate(when: When, picked: string, now: Date = new Date()): string {
  if (when === 'today') return toDateInput(now);
  if (when === 'week') return toDateInput(addDays(now, 7));
  if (when === 'month') return toDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  return picked;
}
