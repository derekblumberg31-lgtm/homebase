import type { DateString } from '../data/types';

export const DAY_MS = 86_400_000;

export function parseDateInput(value: DateString): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year ?? 2000, (month ?? 1) - 1, day ?? 1);
}

export function toDateInput(date: Date = new Date()): DateString {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isRealDate(value: unknown): value is DateString {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function startOfDay(ms: number): Date {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function daysBetween(from: DateString, to: DateString): number {
  return Math.round((parseDateInput(to).getTime() - parseDateInput(from).getTime()) / DAY_MS);
}

export function formatDate(value: DateString | Date, withYear = true): string {
  const date = typeof value === 'string' ? parseDateInput(value) : value;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

/** "Oct 26" this year, "Oct 26, 2027" otherwise. */
export function formatDateShort(value: DateString | Date, now = Date.now()): string {
  const date = typeof value === 'string' ? parseDateInput(value) : value;
  return formatDate(date, date.getFullYear() !== new Date(now).getFullYear());
}

export function formatRelativeTime(at: string, now = Date.now()): string {
  const diff = now - new Date(at).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDateShort(new Date(at), now);
}

export function formatCurrency(value: number, precise = false): string {
  const hasCents = Math.round(value * 100) % 100 !== 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: precise || hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatInterval(days: number): string {
  if (days % 365 === 0) return days === 365 ? '1 year' : `${days / 365} years`;
  if (days % 30 === 0) return days === 30 ? '1 month' : `${days / 30} months`;
  if (days % 7 === 0) return days === 7 ? '1 week' : `${days / 7} weeks`;
  return days === 1 ? '1 day' : `${days} days`;
}
