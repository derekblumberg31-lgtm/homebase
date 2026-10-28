import type { HomeData } from '../../data/store';
import type { TaskCategory, TipState } from '../../data/types';
import { addDays, formatCurrency, formatDate, formatDateShort, toDateInput } from '../../lib/dates';
import { SYSTEM_LIFESPAN } from '../property/labels';
import { EXPIRY_WARNING_DAYS } from '../records/labels';
import { taskCategory } from '../tasks/meta';
import { compareUrgency, countdownText, withInfo, type TaskItem } from '../tasks/taskMath';

/**
 * The rules behind Home: what needs attention now, what to do this season, and how complete the
 * home's record is. Plain rules today; the same shapes can be filled by smarter suggestions later
 * (home age, system install years and usage are already in the data).
 */

export interface Alert {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: 'overdue' | 'soon';
}

export interface Recommendation {
  id: string;
  title: string;
  why: string;
  /** Opens a prefilled task. */
  taskName: string;
  category: TaskCategory;
  intervalHint?: string;
}

export interface SeasonalTip extends Recommendation {
  /** Undefined while it's still a suggestion. */
  status?: TipState;
}

export interface HealthStep {
  title: string;
  why: string;
  href: string;
  ok: boolean;
}

export interface HealthCheck {
  score: number;
  done: number;
  total: number;
  steps: HealthStep[];
  next: HealthStep[];
}

export function alertsFor(data: HomeData, now: number): Alert[] {
  const alerts: Alert[] = [];
  const open = withInfo(data.tasks.filter((t) => t.status === 'open'), now).sort(compareUrgency);
  for (const { task, info } of open.filter((i) => i.info.status === 'overdue')) {
    alerts.push({ id: `task-${task.id}`, title: task.name, detail: countdownText(info), href: `/tasks/${task.id}`, tone: 'overdue' });
  }
  const today = toDateInput(new Date(now));
  const soon = toDateInput(addDays(new Date(now), EXPIRY_WARNING_DAYS));
  for (const record of data.records) {
    if (record.expiresAt && record.expiresAt >= today && record.expiresAt <= soon) {
      alerts.push({ id: `record-${record.id}`, title: record.title, detail: `Ends ${formatDate(record.expiresAt)}`, href: `/records/${record.id}`, tone: 'soon' });
    }
  }
  const year = new Date(now).getFullYear();
  for (const system of data.systems) {
    const life = SYSTEM_LIFESPAN[system.kind];
    if (!life || !system.installYear) continue;
    const age = year - system.installYear;
    if (age >= life) {
      alerts.push({ id: `system-${system.id}`, title: system.name, detail: `${age} years old, past its usual ${life}. Worth an inspection.`, href: '/property/systems', tone: 'soon' });
    }
  }
  return alerts;
}

type Season = 'spring' | 'summer' | 'fall' | 'winter';

export const currentSeason = (now: number): Season => seasonOf(new Date(now).getMonth());

function seasonOf(month: number): Season {
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

const SEASONAL: Record<Season, Omit<Recommendation, 'id'>[]> = {
  spring: [
    { title: 'Service the air conditioning', why: 'Before the first hot week, when technicians get busy.', taskName: 'Service the air conditioning', category: 'air' },
    { title: 'Clean the gutters', why: 'Spring rain finds every clog.', taskName: 'Clean the gutters', category: 'outdoor' },
    { title: 'Test smoke and CO alarms', why: 'A good habit at each time change.', taskName: 'Test smoke and CO alarms', category: 'safety' },
  ],
  summer: [
    { title: 'Check outdoor faucets and hoses', why: 'Small leaks waste a lot of water in summer.', taskName: 'Check outdoor faucets and hoses', category: 'water' },
    { title: 'Clean the dryer vent', why: 'Lint build-up is a common cause of house fires.', taskName: 'Clean out the dryer vent', category: 'appliance' },
    { title: 'Inspect the deck or patio', why: 'Loose boards and peeling sealant are easier to fix in dry weather.', taskName: 'Inspect the deck or patio', category: 'outdoor' },
  ],
  fall: [
    { title: 'Service the furnace', why: 'Before the first cold night.', taskName: 'Service the furnace', category: 'air' },
    { title: 'Drain and store garden hoses', why: 'Prevents frozen and burst outdoor pipes.', taskName: 'Drain and store garden hoses', category: 'outdoor' },
    { title: 'Seal drafts around doors and windows', why: 'Cuts heating bills all winter.', taskName: 'Seal drafts around doors and windows', category: 'maintenance' },
  ],
  winter: [
    { title: 'Know where the water shut-off is', why: 'Minutes matter if a pipe bursts.', taskName: 'Find and label the main water shut-off', category: 'water' },
    { title: 'Test the sump pump', why: 'Snowmelt is when it’s needed most.', taskName: 'Test the sump pump', category: 'water' },
    { title: 'Swap the HVAC filter', why: 'The heating runs hardest now.', taskName: 'Swap the HVAC filter', category: 'air' },
  ],
};

const similar = (a: string, b: string) => {
  const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3));
  const wa = words(a);
  let shared = 0;
  for (const w of words(b)) if (wa.has(w)) shared += 1;
  return shared >= 2;
};

export const SNOOZE_DAYS = 14;

/**
 * This season's suggestions with what the homeowner did about each: planned, done or snoozed ones
 * stay visible with their status; hidden ones and anything already in Tasks are left out.
 */
export function seasonalTipsFor(data: HomeData, now: number): { tips: SeasonalTip[]; snoozed: number } {
  const date = new Date(now);
  const season = seasonOf(date.getMonth());
  const tag = `${season}-${date.getFullYear()}`;
  const today = toDateInput(date);
  const states = data.settings.tipStates ?? {};
  let snoozed = 0;
  const tips: SeasonalTip[] = [];
  for (const r of SEASONAL[season]) {
    const id = `${tag}:${r.taskName}`;
    const status = states[id];
    if (data.settings.dismissedTips.includes(id) || status?.state === 'hidden') continue;
    if (status?.state === 'snoozed' && status.until && status.until > today) {
      snoozed += 1;
      continue;
    }
    const active = !status || status.state === 'snoozed';
    if (active && data.tasks.some((t) => t.status === 'open' && similar(t.name, r.taskName))) continue;
    tips.push({ ...r, id, status: active ? undefined : status });
  }
  return { tips, snoozed };
}

/** The suggestions still waiting for a decision (used by the Assistant and the launcher). */
export function recommendationsFor(data: HomeData, now: number): Recommendation[] {
  return seasonalTipsFor(data, now).tips.filter((t) => !t.status);
}

export function healthCheckFor(data: HomeData, now: number): HealthCheck {
  const overdue = withInfo(data.tasks.filter((t) => t.status === 'open'), now).filter((i) => i.info.status === 'overdue').length;
  const appliances = data.items.filter((i) => i.kind === 'appliance');
  const steps: HealthStep[] = [
    { ok: Boolean(data.property?.yearBuilt), title: 'Add the year your home was built', why: 'Older homes need different checks, like wiring and pipe inspections.', href: '/property/details' },
    { ok: data.rooms.length > 0, title: 'Add your rooms', why: 'Tasks and belongings can then be filed by room.', href: '/property' },
    { ok: data.systems.some((s) => s.installYear), title: 'Add your heating, cooling or water heater', why: 'With an install year, Homebase warns you before one reaches the end of its usual life.', href: '/property/systems' },
    { ok: data.tasks.length >= 3, title: 'Plan at least three upkeep tasks', why: 'Start with filters, smoke alarms and gutters.', href: '/tasks?new=1' },
    { ok: overdue === 0, title: `Catch up on ${overdue} overdue ${overdue === 1 ? 'task' : 'tasks'}`, why: 'Mark them done, or move the date if they can wait.', href: '/tasks' },
    { ok: appliances.length > 0, title: 'List your main appliances', why: 'Model and serial numbers save time on repairs and warranty claims.', href: '/property/inventory' },
    { ok: data.records.some((r) => r.kind === 'warranty'), title: 'Save a warranty in the Warranty Vault', why: 'You’ll get a reminder two months before it ends.', href: '/records?new=warranty' },
    { ok: data.items.some((i) => i.kind === 'key'), title: 'Save your house keys', why: 'A photo tells a locksmith exactly which blank to cut.', href: '/property/identify-key' },
  ];
  const done = steps.filter((c) => c.ok).length;
  return { score: Math.round((done / steps.length) * 100), done, total: steps.length, steps, next: steps.filter((c) => !c.ok).slice(0, 3) };
}

// ---------- Home snapshot ----------

export interface SnapshotFact {
  id: 'age' | 'rooms' | 'hvac' | 'next' | 'health';
  label: string;
  value: string;
  detail: string;
  href: string;
  tone?: 'good' | 'warn' | 'overdue' | 'muted';
}

const HVAC_KINDS = new Set(['heating', 'cooling']);

export function snapshotFor(data: HomeData, now: number, health: HealthCheck): SnapshotFact[] {
  const year = new Date(now).getFullYear();
  const built = data.property?.yearBuilt;
  const open = withInfo(data.tasks.filter((t) => t.status === 'open'), now).sort(compareUrgency);
  const next = open[0];

  const hvac = data.systems.filter((s) => HVAC_KINDS.has(s.kind));
  const airOverdue = open.some((i) => i.info.status === 'overdue' && taskCategory(i.task) === 'air');
  let hvacFact: SnapshotFact;
  if (airOverdue) {
    hvacFact = { id: 'hvac', label: 'Heating and cooling', value: 'Service overdue', detail: 'An air or filter task is late', href: '/tasks', tone: 'overdue' };
  } else if (hvac.length === 0) {
    hvacFact = { id: 'hvac', label: 'Heating and cooling', value: 'Not added', detail: 'Add your furnace or AC', href: '/property/systems', tone: 'muted' };
  } else {
    const aged = hvac.filter((s) => s.installYear).map((s) => ({ s, age: year - s.installYear!, life: SYSTEM_LIFESPAN[s.kind] ?? 15 }));
    const worst = aged.sort((a, b) => b.age / b.life - a.age / a.life)[0];
    hvacFact = worst
      ? worst.age >= worst.life
        ? { id: 'hvac', label: 'Heating and cooling', value: 'Past its lifespan', detail: `${worst.s.name}, ${worst.age} years`, href: '/property/systems', tone: 'warn' }
        : { id: 'hvac', label: 'Heating and cooling', value: worst.age >= worst.life * 0.8 ? 'Plan a replacement' : 'In good shape', detail: `${worst.s.name}, ${worst.age} ${worst.age === 1 ? 'year' : 'years'} old`, href: '/property/systems', tone: worst.age >= worst.life * 0.8 ? 'warn' : 'good' }
      : { id: 'hvac', label: 'Heating and cooling', value: `${hvac.length} ${hvac.length === 1 ? 'system' : 'systems'}`, detail: 'Add install years for age alerts', href: '/property/systems' };
  }

  return [
    built
      ? { id: 'age', label: 'Home age', value: `${Math.max(0, year - built)} years`, detail: `Built in ${built}`, href: '/property/details' }
      : { id: 'age', label: 'Home age', value: 'Unknown', detail: 'Add the year built', href: '/property/details', tone: 'muted' },
    { id: 'rooms', label: 'Rooms', value: String(data.rooms.length), detail: data.rooms.length ? data.rooms.slice(0, 2).map((r) => r.name).join(', ') + (data.rooms.length > 2 ? '…' : '') : 'None added yet', href: '/property', tone: data.rooms.length ? undefined : 'muted' },
    hvacFact,
    next
      ? { id: 'next', label: 'Next maintenance', value: next.info.status === 'overdue' || next.info.daysLeft <= 1 ? countdownText(next.info) : formatDateShort(next.info.dueDate, now), detail: next.task.name, href: `/tasks/${next.task.id}`, tone: next.info.status === 'overdue' ? 'overdue' : undefined }
      : { id: 'next', label: 'Next maintenance', value: 'Nothing planned', detail: 'Add your first task', href: '/tasks?new=1', tone: 'muted' },
    { id: 'health', label: 'Home health', value: `${health.score}%`, detail: `${health.done} of ${health.total} steps`, href: '#home-health', tone: health.score >= 75 ? 'good' : undefined },
  ];
}

// ---------- Maintenance timeline ----------

export interface TimelineEntry {
  id: string;
  date: Date;
  title: string;
  detail: string;
  href: string;
  kind: 'task' | 'warranty';
  overdue: boolean;
  item?: TaskItem;
}

export interface TimelineMonth {
  key: string;
  label: string;
  entries: TimelineEntry[];
}

export const TIMELINE_DAYS = 90;

/** Open tasks and ending warranties over the next three months, grouped by month; overdue first. */
export function timelineFor(data: HomeData, now: number): TimelineMonth[] {
  const horizon = addDays(new Date(now), TIMELINE_DAYS).getTime();
  const entries: TimelineEntry[] = withInfo(data.tasks.filter((t) => t.status === 'open'), now)
    .filter((i) => i.info.dueDate.getTime() <= horizon)
    .map((i) => ({
      id: `task-${i.task.id}`,
      date: i.info.dueDate,
      title: i.task.name,
      detail: [i.task.location, i.task.cost ? formatCurrency(i.task.cost) : null].filter(Boolean).join(' · '),
      href: `/tasks/${i.task.id}`,
      kind: 'task' as const,
      overdue: i.info.status === 'overdue',
      item: i,
    }));
  const today = toDateInput(new Date(now));
  for (const r of data.records) {
    if (!r.expiresAt || r.expiresAt < today) continue;
    const date = new Date(`${r.expiresAt}T12:00:00`);
    if (date.getTime() > horizon) continue;
    entries.push({ id: `record-${r.id}`, date, title: `${r.title} ends`, detail: 'Check what’s still covered', href: `/records/${r.id}`, kind: 'warranty', overdue: false });
  }
  entries.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.date.getTime() - b.date.getTime());

  const months: TimelineMonth[] = [];
  for (const entry of entries) {
    const key = entry.overdue ? 'overdue' : `${entry.date.getFullYear()}-${entry.date.getMonth()}`;
    const label = entry.overdue ? 'Overdue' : entry.date.toLocaleDateString('en-US', { month: 'long', year: entry.date.getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric' });
    let month = months.find((m) => m.key === key);
    if (!month) months.push((month = { key, label, entries: [] }));
    month.entries.push(entry);
  }
  return months;
}

