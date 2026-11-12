import type { HomeData } from '../../data/store';
import { uid } from '../../data/ids';
import type { Task, TaskCategory } from '../../data/types';
import { daysBetween, formatDateShort, formatInterval, startOfDay, toDateInput } from '../../lib/dates';
import { firstDueFor, type LastDoneChoice } from '../tasks/lastDone';
import { findType } from '../tasks/presets';
import { seasonalTipsFor, similar } from './insights';

export interface StarterJob {
  /** Stable while the list is on screen: the tip id for seasonal jobs, else the preset id. */
  key: string;
  name: string;
  intervalDays: number;
  category: TaskCategory;
  typeId: string;
  seasonal?: boolean;
  tipId?: string;
}

/** Year-round basics, offered in this order after this season's tips. Cost is never copied. */
const BASICS: { id: string; name?: string; typeId?: string }[] = [
  { id: 'hvac-1', name: 'Change the HVAC filter', typeId: 'custom' },
  { id: 'smoke-batteries' },
  { id: 'water-heater' },
  { id: 'co-alarm' },
  { id: 'gutters' },
];
const MAX_JOBS = 5;

/** Up to five common jobs for an empty home, this season's undecided tips first. */
export function starterJobsFor(data: HomeData, now: number): StarterJob[] {
  if (data.tasks.length > 0) return [];
  const tips = seasonalTipsFor(data, now).tips.filter((t) => !t.status);
  const jobs: StarterJob[] = tips.map((tip) => ({ key: tip.id, name: tip.taskName, intervalDays: 365, category: tip.category, typeId: 'custom', seasonal: true, tipId: tip.id }));
  const safetyTip = tips.some((t) => t.category === 'safety');
  for (const basic of BASICS) {
    if (jobs.length >= MAX_JOBS) break;
    const preset = findType(basic.id);
    const name = basic.name ?? preset.label;
    if (tips.some((t) => similar(name, t.taskName))) continue;
    if (safetyTip && (basic.id === 'smoke-batteries' || basic.id === 'co-alarm')) continue;
    jobs.push({ key: basic.id, name, intervalDays: preset.lifespanDays, category: preset.category, typeId: basic.typeId ?? basic.id });
  }
  return jobs.slice(0, MAX_JOBS);
}

/** A recurring task with no recorded last-done date: first due on the date the choice gives. */
export function buildStarterTask(job: StarterJob, choice: LastDoneChoice, now: number): Task {
  const stamp = new Date(now).toISOString();
  return {
    id: uid(),
    kind: 'maintenance',
    name: job.name,
    typeId: job.typeId,
    location: '',
    lastDoneAt: toDateInput(startOfDay(now)),
    dueDate: firstDueFor(choice, job.intervalDays, now),
    intervalDays: job.intervalDays,
    recurring: true,
    status: 'open',
    category: job.category,
    seasonal: job.seasonal || undefined,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

export type StarterPicks = Record<string, LastDoneChoice>;

export function toggleStarter(picks: StarterPicks, key: string): StarterPicks {
  if (key in picks) {
    const { [key]: _removed, ...rest } = picks;
    return rest;
  }
  return { ...picks, [key]: 'not-sure' };
}

export function chooseStarter(picks: StarterPicks, key: string, choice: LastDoneChoice): StarterPicks {
  return key in picks ? { ...picks, [key]: choice } : picks;
}

/** The row's second line: how often, then (once ticked) what the answer means for the first due date. */
export function starterSubLine(job: StarterJob, choice: LastDoneChoice | undefined, now: number): string {
  const every = `Every ${job.intervalDays === 365 ? 'year' : formatInterval(job.intervalDays)}`;
  if (!choice) return job.seasonal ? `${every} · Seasonal` : every;
  const due = firstDueFor(choice, job.intervalDays, now);
  if (daysBetween(toDateInput(startOfDay(now)), due) <= 7) return `${every} · Due within a week`;
  return `${every} · Next due ${formatDateShort(due, now)}`;
}
