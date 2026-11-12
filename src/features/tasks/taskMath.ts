import type { Task } from '../../data/types';
import { addDays, DAY_MS, parseDateInput, startOfDay } from '../../lib/dates';

export type TaskStatus = 'healthy' | 'due' | 'overdue' | 'done';

export interface TaskInfo {
  dueDate: Date;
  /** Whole days until due; negative once overdue. */
  daysLeft: number;
  status: TaskStatus;
  /** For recurring tasks: how far through the interval we are, 0–100+. */
  percentUsed: number;
}

export interface TaskItem {
  task: Task;
  info: TaskInfo;
}

const DUE_SOON_DAYS = 7;
const DUE_SOON_PERCENT = 85;

/**
 * A recurring task with a `dueDate` means "last done is not recorded; first due on `dueDate`".
 * Its `lastDoneAt` is only the day it was added and is never shown as a last-done date.
 */
export function lastDoneKnown(task: Pick<Task, 'recurring' | 'dueDate'>): boolean {
  return !(task.recurring && task.dueDate);
}

/**
 * When a task is due, in order: a snoozed or rescheduled date (`nextDue`), then `dueDate`
 * (a one-off's due date, or a recurring task's first due date when last done is unknown),
 * then the last done date plus the interval.
 */
export function dueDateOf(task: Pick<Task, 'recurring' | 'lastDoneAt' | 'intervalDays' | 'dueDate' | 'nextDue'>): Date {
  if (task.nextDue) return parseDateInput(task.nextDue);
  if (task.dueDate) return parseDateInput(task.dueDate);
  return addDays(parseDateInput(task.lastDoneAt), task.intervalDays);
}

export function getTaskInfo(task: Task, nowMs: number): TaskInfo {
  const dueDate = dueDateOf(task);
  const today = startOfDay(nowMs);
  const daysLeft = Math.round((dueDate.getTime() - today.getTime()) / DAY_MS);
  const elapsed = nowMs - parseDateInput(task.lastDoneAt).getTime();
  const percentUsed = task.recurring && lastDoneKnown(task) ? Math.max(0, (elapsed / (task.intervalDays * DAY_MS)) * 100) : 0;

  let status: TaskStatus;
  if (task.status === 'done') status = 'done';
  else if (daysLeft < 0) status = 'overdue';
  else if (daysLeft <= DUE_SOON_DAYS || (task.recurring && percentUsed >= DUE_SOON_PERCENT)) status = 'due';
  else status = 'healthy';

  return { dueDate, daysLeft, status, percentUsed };
}

const RANK: Record<TaskStatus, number> = { overdue: 0, due: 1, healthy: 2, done: 3 };

export function compareUrgency(a: TaskItem, b: TaskItem): number {
  if (RANK[a.info.status] !== RANK[b.info.status]) return RANK[a.info.status] - RANK[b.info.status];
  return a.info.daysLeft - b.info.daysLeft;
}

export interface CountdownParts {
  /** The number to set large, or null for "Today" / "Tomorrow" / "Done". */
  value: number | null;
  unit: string;
  overdue: boolean;
  /** Full phrase for screen readers and plain-text spots. */
  label: string;
}

function largestUnit(days: number): { value: number; unit: string } {
  if (days >= 30) {
    const months = Math.floor(days / 30);
    return { value: months, unit: months === 1 ? 'month' : 'months' };
  }
  if (days >= 7) {
    const weeks = Math.floor(days / 7);
    return { value: weeks, unit: weeks === 1 ? 'week' : 'weeks' };
  }
  return { value: days, unit: days === 1 ? 'day' : 'days' };
}

/** Countdown in the largest whole unit: "3 months", "2 weeks", "5 days", "Today", "2 days over". */
export function countdownParts(info: TaskInfo): CountdownParts {
  if (info.status === 'done') return { value: null, unit: 'Done', overdue: false, label: 'Done' };
  if (info.status === 'overdue') {
    const { value, unit } = largestUnit(Math.max(1, -info.daysLeft));
    return { value, unit: `${unit} over`, overdue: true, label: `${value} ${unit} overdue` };
  }
  if (info.daysLeft <= 0) return { value: null, unit: 'Today', overdue: false, label: 'Due today' };
  if (info.daysLeft === 1) return { value: null, unit: 'Tomorrow', overdue: false, label: 'Due tomorrow' };
  const { value, unit } = largestUnit(info.daysLeft);
  return { value, unit, overdue: false, label: `${value} ${unit} left` };
}

export function countdownText(info: TaskInfo): string {
  const { value, unit } = countdownParts(info);
  return value === null ? unit : `${value} ${unit}`;
}

/** Estimated yearly spend on a task. One-off tasks count once. */
export function annualCost(task: Pick<Task, 'cost' | 'intervalDays' | 'recurring'>): number {
  if (!task.cost) return 0;
  return task.recurring ? (task.cost * 365) / task.intervalDays : 0;
}

export function withInfo(tasks: Task[], now: number): TaskItem[] {
  return tasks.map((task) => ({ task, info: getTaskInfo(task, now) }));
}
