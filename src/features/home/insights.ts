import type { HomeData } from '../../data/store';
import { addDays, formatDate, toDateInput } from '../../lib/dates';
import { SYSTEM_LIFESPAN } from '../property/labels';
import { EXPIRY_WARNING_DAYS } from '../records/labels';
import { compareUrgency, countdownText, withInfo } from '../tasks/taskMath';

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
  intervalHint?: string;
}

export interface HealthCheck {
  score: number;
  done: number;
  total: number;
  next: { title: string; href: string }[];
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

function seasonOf(month: number): Season {
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

const SEASONAL: Record<Season, Omit<Recommendation, 'id'>[]> = {
  spring: [
    { title: 'Service the air conditioning', why: 'Before the first hot week, when technicians get busy.', taskName: 'Service the air conditioning' },
    { title: 'Clean the gutters', why: 'Spring rain finds every clog.', taskName: 'Clean the gutters' },
    { title: 'Test smoke and CO alarms', why: 'A good habit at each time change.', taskName: 'Test smoke and CO alarms' },
  ],
  summer: [
    { title: 'Check outdoor faucets and hoses', why: 'Small leaks waste a lot of water in summer.', taskName: 'Check outdoor faucets and hoses' },
    { title: 'Clean the dryer vent', why: 'Lint build-up is a common cause of house fires.', taskName: 'Clean out the dryer vent' },
    { title: 'Inspect the deck or patio', why: 'Loose boards and peeling sealant are easier to fix in dry weather.', taskName: 'Inspect the deck or patio' },
  ],
  fall: [
    { title: 'Service the furnace', why: 'Before the first cold night.', taskName: 'Service the furnace' },
    { title: 'Drain and store garden hoses', why: 'Prevents frozen and burst outdoor pipes.', taskName: 'Drain and store garden hoses' },
    { title: 'Seal drafts around doors and windows', why: 'Cuts heating bills all winter.', taskName: 'Seal drafts around doors and windows' },
  ],
  winter: [
    { title: 'Know where the water shut-off is', why: 'Minutes matter if a pipe bursts.', taskName: 'Find and label the main water shut-off' },
    { title: 'Test the sump pump', why: 'Snowmelt is when it’s needed most.', taskName: 'Test the sump pump' },
    { title: 'Swap the HVAC filter', why: 'The heating runs hardest now.', taskName: 'Swap the HVAC filter' },
  ],
};

const similar = (a: string, b: string) => {
  const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3));
  const wa = words(a);
  let shared = 0;
  for (const w of words(b)) if (wa.has(w)) shared += 1;
  return shared >= 2;
};

export function recommendationsFor(data: HomeData, now: number): Recommendation[] {
  const date = new Date(now);
  const season = seasonOf(date.getMonth());
  const tag = `${season}-${date.getFullYear()}`;
  return SEASONAL[season]
    .map((r) => ({ ...r, id: `${tag}:${r.taskName}` }))
    .filter((r) => !data.settings.dismissedTips.includes(r.id))
    .filter((r) => !data.tasks.some((t) => t.status === 'open' && similar(t.name, r.taskName)));
}

export function healthCheckFor(data: HomeData, now: number): HealthCheck {
  const overdue = withInfo(data.tasks.filter((t) => t.status === 'open'), now).filter((i) => i.info.status === 'overdue').length;
  const appliances = data.items.filter((i) => i.kind === 'appliance');
  const checks = [
    { ok: Boolean(data.property?.yearBuilt), title: 'Add the year your home was built', href: '/property/details' },
    { ok: data.rooms.length > 0, title: 'Add your rooms', href: '/property' },
    { ok: data.systems.some((s) => s.installYear), title: 'Add your heating, cooling or water heater', href: '/property/systems' },
    { ok: data.tasks.length >= 3, title: 'Plan at least three upkeep tasks', href: '/tasks' },
    { ok: data.tasks.length > 0 && overdue === 0, title: overdue ? `Catch up on ${overdue} overdue ${overdue === 1 ? 'task' : 'tasks'}` : 'Keep tasks up to date', href: '/tasks' },
    { ok: appliances.length > 0, title: 'List your main appliances', href: '/property/inventory' },
    { ok: data.records.some((r) => r.kind === 'warranty'), title: 'Save a warranty in the Warranty Vault', href: '/records?new=warranty' },
    { ok: data.items.some((i) => i.kind === 'key'), title: 'Save your house keys', href: '/property/identify-key' },
  ];
  const done = checks.filter((c) => c.ok).length;
  return { score: Math.round((done / checks.length) * 100), done, total: checks.length, next: checks.filter((c) => !c.ok).slice(0, 3) };
}
