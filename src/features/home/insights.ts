import type { HomeData } from '../../data/store';
import type { HomeRecord, TaskCategory, TipState } from '../../data/types';
import { addDays, DAY_MS, formatCurrency, formatDateShort, formatRelativeTime, toDateInput } from '../../lib/dates';
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

const BACKUP_NUDGE_DAYS = 30;

export type AttentionKind = 'warranty' | 'system' | 'backup';

/** A fact about the home or this device that deserves a look, before it becomes a problem. */
export interface AttentionItem {
  /** 'record-<id>' | 'system-<id>' | 'backup' */
  id: string;
  kind: AttentionKind;
  title: string;
  detail: string;
  /** The backup item points to '/settings'; its Home row is a button when the page passes `onBackup`. */
  href: string;
  /** Key kept in homebase:alert-rows-dismissed. Absent for 'backup', which has its own dismissal. */
  dismissKey?: string;
}

/** The most alert rows Home shows. The rest are counted in "N more need a look". */
export const ALERT_ROW_CAP = 2;

/** Records whose end date falls from today through the warranty warning window, soonest first. */
export function endingSoon(records: HomeRecord[], now: number): HomeRecord[] {
  const today = toDateInput(new Date(now));
  const soon = toDateInput(addDays(new Date(now), EXPIRY_WARNING_DAYS));
  return records
    .filter((record) => record.expiresAt && record.expiresAt >= today && record.expiresAt <= soon)
    .sort((a, b) => (a.expiresAt ?? '').localeCompare(b.expiresAt ?? ''));
}

function endsText(expiresAt: string, now: number): string {
  const today = toDateInput(new Date(now));
  if (expiresAt === today) return 'Ends today';
  if (expiresAt === toDateInput(addDays(new Date(now), 1))) return 'Ends tomorrow';
  return `Ends ${formatDateShort(expiresAt, now)}`;
}

/** This device holds the only copy, so ask for a backup once there's something worth keeping. */
export function backupAttention(data: HomeData, now: number, backupDismissedAt?: string): AttentionItem | null {
  const hasData = data.tasks.length + data.items.length + data.records.length > 0;
  const lastBackup = data.settings.lastBackupAt;
  const since = lastBackup ?? data.household?.onboardedAt;
  if (!(hasData && since && now - new Date(since).getTime() >= BACKUP_NUDGE_DAYS * DAY_MS)) return null;
  // Hidden from Home: stays away until a backup is saved after it was hidden.
  if (backupDismissedAt && !(lastBackup && lastBackup > backupDismissedAt)) return null;
  return {
    id: 'backup',
    kind: 'backup',
    title: 'Save a backup',
    detail: lastBackup ? `Last saved ${formatRelativeTime(lastBackup, now).toLowerCase()}` : 'Your home’s information is only on this device',
    href: '/settings',
  };
}

/** Everything that needs a look, uncapped: warranties ending, systems past their life, then backup. */
export function attentionFor(data: HomeData, now: number, backupDismissedAt?: string): AttentionItem[] {
  const items: AttentionItem[] = endingSoon(data.records, now).map((record) => ({
    id: `record-${record.id}`,
    kind: 'warranty' as const,
    title: record.title,
    detail: endsText(record.expiresAt!, now),
    href: `/records/${record.id}`,
    dismissKey: `record-${record.id}:${record.expiresAt}`,
  }));

  const year = new Date(now).getFullYear();
  const systems: { item: AttentionItem; over: number }[] = [];
  for (const system of data.systems) {
    const life = SYSTEM_LIFESPAN[system.kind];
    if (!life || !system.installYear) continue;
    const age = year - system.installYear;
    if (age < life) continue;
    systems.push({
      over: age - life,
      item: {
        id: `system-${system.id}`,
        kind: 'system',
        title: system.name,
        detail: `${age} years old, past its usual ${life}`,
        href: '/property/systems',
        dismissKey: `system-${system.id}:${system.installYear}`,
      },
    });
  }
  systems.sort((a, b) => b.over - a.over || a.item.title.localeCompare(b.item.title));
  items.push(...systems.map((s) => s.item));

  const backup = backupAttention(data, now, backupDismissedAt);
  if (backup) items.push(backup);
  return items;
}

/**
 * Hides what was dismissed, then fills the alert slot. A backup row, when there is one, always
 * takes the last slot: home facts read first, but losing the only copy of the data costs everything.
 * `counted` is what the status sentence talks about (never the backup).
 */
export function arrangeAttention(
  items: AttentionItem[],
  dismissed: ReadonlySet<string>,
): { rows: AttentionItem[]; more: AttentionItem[]; counted: AttentionItem[] } {
  const visible = items.filter((item) => !(item.dismissKey && dismissed.has(item.dismissKey)));
  const counted = visible.filter((item) => item.kind !== 'backup');
  const backup = visible.find((item) => item.kind === 'backup');
  const rows = backup ? [...counted.slice(0, ALERT_ROW_CAP - 1), backup] : counted.slice(0, ALERT_ROW_CAP);
  return { rows, more: counted.filter((item) => !rows.includes(item)), counted };
}

export function alertsFor(data: HomeData, now: number): Alert[] {
  const alerts: Alert[] = [];
  const open = withInfo(data.tasks.filter((t) => t.status === 'open'), now).sort(compareUrgency);
  for (const { task, info } of open.filter((i) => i.info.status === 'overdue')) {
    alerts.push({ id: `task-${task.id}`, title: task.name, detail: countdownText(info), href: `/tasks/${task.id}`, tone: 'overdue' });
  }
  for (const item of attentionFor(data, now)) {
    alerts.push({ id: item.id, title: item.title, detail: item.detail, href: item.href, tone: 'soon' });
  }
  return alerts;
}

// ---------- The status sentence ----------

export interface HomeStatus {
  tone: 'empty' | 'overdue' | 'attention' | 'clear';
  /** One or two clauses; the first is the overdue one when tone is 'overdue'. */
  clauses: [string] | [string, string];
  text: string;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const NAME_LIMIT = 40;

function statusOf(tone: HomeStatus['tone'], clauses: HomeStatus['clauses']): HomeStatus {
  return { tone, clauses, text: clauses.join(', and ') };
}

function alertClause(data: HomeData, counted: AttentionItem[], afterOverdue: boolean): string {
  const n = counted.length;
  const systems = counted.filter((item) => item.kind === 'system').length;
  const records = counted.filter((item) => item.kind === 'warranty');
  const allWarranties = records.every((item) => data.records.find((r) => `record-${r.id}` === item.id)?.kind === 'warranty');
  if (systems === 0) {
    return allWarranties ? (n === 1 ? '1 warranty ends soon' : `${n} warranties end soon`) : n === 1 ? '1 end date is coming up' : `${n} end dates are coming up`;
  }
  if (records.length === 0) return n === 1 ? '1 system is past its usual life' : `${n} systems are past their usual life`;
  return `${n} ${afterOverdue ? 'other ' : ''}things need a look`;
}

/** The one sentence under the greeting. Says only what Homebase was told; the backup is never in it. */
export function homeStatusFor(data: HomeData, now: number, counted: AttentionItem[]): HomeStatus {
  const open = withInfo(data.tasks.filter((t) => t.status === 'open'), now).sort(compareUrgency);
  const overdue = open.filter((i) => i.info.status === 'overdue').length;
  const dueSoon = open.filter((i) => i.info.status !== 'overdue' && i.info.daysLeft <= 7).length;

  if (overdue > 0) {
    const a = `${overdue} ${plural(overdue, 'job is', 'jobs are')} overdue`;
    if (counted.length > 0) return statusOf('overdue', [a, alertClause(data, counted, true)]);
    if (dueSoon > 0) return statusOf('overdue', [a, `${dueSoon} ${plural(dueSoon, 'more is', 'more are')} due this week`]);
    return statusOf('overdue', [a]);
  }

  const w = `${dueSoon} ${plural(dueSoon, 'job is', 'jobs are')} due this week`;
  if (data.tasks.length === 0) {
    if (counted.length === 0) return statusOf('empty', ['Add the jobs your home needs']);
    const b = alertClause(data, counted, false);
    return statusOf('attention', [b.charAt(0).toUpperCase() + b.slice(1)]);
  }
  if (dueSoon > 0) {
    return statusOf('attention', counted.length > 0 ? [w, alertClause(data, counted, false)] : [w]);
  }
  if (counted.length > 0) return statusOf('attention', ['Nothing is overdue', alertClause(data, counted, false)]);

  const first = open[0];
  if (!first) return statusOf('clear', ['All clear. Nothing else is planned']);
  const name = first.task.name.length > NAME_LIMIT ? `${first.task.name.slice(0, NAME_LIMIT)}…` : first.task.name;
  return statusOf('clear', [`All clear. Next up on ${formatDateShort(first.info.dueDate, now)}: ${name}`]);
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
  // "0 overdue" is only progress once there are tasks to be on schedule with.
  const overdueStep: HealthStep =
    data.tasks.length === 0
      ? { ok: false, title: 'Keep your tasks on schedule', why: 'Add a task first. This step is done while nothing is overdue.', href: '/tasks?new=1' }
      : overdue === 0
        ? { ok: true, title: 'Keep your tasks on schedule', why: 'Mark them done, or move the date if they can wait.', href: '/tasks' }
        : { ok: false, title: `Catch up on ${overdue} overdue ${overdue === 1 ? 'task' : 'tasks'}`, why: 'Mark them done, or move the date if they can wait.', href: '/tasks' };
  const steps: HealthStep[] = [
    { ok: Boolean(data.property?.yearBuilt), title: 'Add the year your home was built', why: 'Older homes need different checks, like wiring and pipe inspections.', href: '/property/details' },
    { ok: data.rooms.length > 0, title: 'Add your rooms', why: 'Tasks and belongings can then be filed by room.', href: '/property' },
    { ok: data.systems.some((s) => s.installYear), title: 'Add your heating, cooling or water heater', why: 'With an install year, Homebase warns you before one reaches the end of its usual life.', href: '/property/systems' },
    { ok: data.tasks.length >= 3, title: 'Plan at least three upkeep tasks', why: 'Start with filters, smoke alarms and gutters.', href: '/tasks?new=1' },
    overdueStep,
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

