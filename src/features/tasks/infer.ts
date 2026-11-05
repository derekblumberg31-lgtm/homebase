import type { TaskCategory, TaskKind, TaskPriority } from '../../data/types';
import { findType, TASK_PRESETS } from './presets';

/**
 * Guesses sensible defaults from what the homeowner typed ("HVAC filter", "fix the leak under the
 * sink"), so the first step of adding a task is just: what, where, when. Every guess stays
 * editable under "More options".
 */
export interface TaskGuess {
  /** A tidier name for a picked common job. */
  name?: string;
  typeId: string;
  kind: TaskKind;
  category: TaskCategory;
  intervalDays: number;
  priority: TaskPriority;
  seasonal: boolean;
  notes?: string;
  cost?: number;
  /** Why it guessed this, in a few words. */
  matched?: string;
}

interface Rule {
  id: string;
  /** Shown as a one-tap common job. */
  label?: string;
  test: RegExp;
  guess: Omit<TaskGuess, 'matched'>;
}

const RULES: Rule[] = [
  {
    id: 'hvac-filter',
    label: 'HVAC air filter',
    test: /(hvac|furnace|air|ac|a\/c|return)\b.*filter|filter.*(hvac|furnace|air)/,
    guess: { name: 'Replace the HVAC air filter', typeId: 'hvac-1', kind: 'maintenance', category: 'air', intervalDays: 90, priority: 'normal', seasonal: false, cost: 14, notes: 'Filter size is printed on the frame (like 16x25x1). The arrow points toward the furnace. Every 1–3 months; more often with pets.' },
  },
  {
    id: 'smoke',
    label: 'Test smoke alarms',
    test: /smoke (alarm|detector)/,
    guess: { name: 'Test smoke alarms', typeId: 'custom', kind: 'maintenance', category: 'safety', intervalDays: 30, priority: 'high', seasonal: false, notes: 'Press and hold Test on each alarm. Replace batteries yearly and any alarm over 10 years old.' },
  },
  {
    id: 'co',
    test: /carbon monoxide|\bco (alarm|detector)/,
    guess: { name: 'Test carbon monoxide alarms', typeId: 'co-alarm', kind: 'maintenance', category: 'safety', intervalDays: 30, priority: 'high', seasonal: false, notes: 'Press and hold Test. One on every level and near sleeping areas.' },
  },
  {
    id: 'gutters',
    label: 'Clean the gutters',
    test: /gutter/,
    guess: { name: 'Clean the gutters', typeId: 'gutters', kind: 'maintenance', category: 'outdoor', intervalDays: 180, priority: 'normal', seasonal: true, cost: 25, notes: 'Spring and late fall. Use a stable ladder and have someone hold it. Check downspouts drain away from the house.' },
  },
  {
    id: 'water-heater',
    label: 'Flush the water heater',
    test: /water heater|hot water tank/,
    guess: { name: 'Flush the water heater', typeId: 'water-heater', kind: 'maintenance', category: 'water', intervalDays: 365, priority: 'normal', seasonal: false, cost: 20, notes: 'Turn off power or set gas to Pilot first. The water is scalding. Follow the steps in the manual.' },
  },
  {
    id: 'dryer',
    label: 'Clean the dryer vent',
    test: /dryer/,
    guess: { name: 'Clean out the dryer vent', typeId: 'dryer-vent', kind: 'maintenance', category: 'appliance', intervalDays: 365, priority: 'high', seasonal: false, cost: 20, notes: 'Lint build-up is a fire risk. Clean the lint screen every load and the duct to the outside yearly.' },
  },
  {
    id: 'hvac-service',
    label: 'Service the furnace',
    test: /(furnace|heating|boiler|hvac|ac|a\/c|air condition\w*|heat pump).*(service|tune|check|inspect)|(service|tune|inspect).*(furnace|heating|boiler|hvac|ac|air condition\w*|heat pump)/,
    guess: { name: 'Service the furnace', typeId: 'hvac-service', kind: 'maintenance', category: 'air', intervalDays: 365, priority: 'normal', seasonal: true, cost: 130, notes: 'Book heating service in early fall and cooling in spring, before the busy season.' },
  },
  {
    id: 'fridge-filter',
    label: 'Fridge water filter',
    test: /(fridge|refrigerator).*filter/,
    guess: { name: 'Replace the fridge water filter', typeId: 'fridge-water', kind: 'maintenance', category: 'water', intervalDays: 180, priority: 'low', seasonal: false, cost: 38, notes: 'The filter model is in the fridge manual or on the old filter.' },
  },
  {
    id: 'sump',
    test: /sump/,
    guess: { name: 'Test the sump pump', typeId: 'custom', kind: 'maintenance', category: 'water', intervalDays: 90, priority: 'normal', seasonal: true, notes: 'Pour a bucket of water into the pit and check it pumps out and switches off.' },
  },
  {
    id: 'extinguisher',
    test: /extinguisher/,
    guess: { name: 'Check the fire extinguisher', typeId: 'fire-extinguisher', kind: 'maintenance', category: 'safety', intervalDays: 365, priority: 'normal', seasonal: false, cost: 15, notes: 'The gauge needle should be in the green. Replace after any use.' },
  },
  {
    id: 'gfci',
    test: /gfci|gfi/,
    guess: { name: 'Test GFCI outlets', typeId: 'gfcii', kind: 'maintenance', category: 'safety', intervalDays: 180, priority: 'normal', seasonal: false, notes: 'Press Test, check the outlet goes dead, then press Reset.' },
  },
  {
    id: 'leak',
    label: 'Fix a leak',
    test: /leak|drip|burst|water (on|under|in)/,
    guess: { typeId: 'custom', kind: 'repair', category: 'water', intervalDays: 30, priority: 'high', seasonal: false, notes: 'Note where the water comes from and when. Close the nearest shutoff valve if it gets worse.' },
  },
  {
    id: 'electrical',
    test: /outlet|breaker|switch|wiring|flicker/,
    guess: { typeId: 'custom', kind: 'repair', category: 'safety', intervalDays: 30, priority: 'high', seasonal: false, notes: 'A warm outlet, burning smell or breaker that keeps tripping needs a licensed electrician.' },
  },
  {
    id: 'repair',
    test: /\b(fix|repair|broken|replace|clog\w*|stuck|crack\w*|won.?t|not working)\b/,
    guess: { typeId: 'custom', kind: 'repair', category: 'maintenance', intervalDays: 30, priority: 'normal', seasonal: false },
  },
  {
    id: 'project',
    test: /\b(re)?(paint|remodel|renovat\w*|install|build|redo|upgrade|landscap\w*)\b/,
    guess: { typeId: 'custom', kind: 'project', category: 'other', intervalDays: 30, priority: 'low', seasonal: false, notes: 'Write down what done looks like, then get three written quotes.' },
  },
];

/** One-tap common jobs for the first step of the form. */
export const COMMON_JOBS = RULES.filter((r) => r.label).map((r) => ({ id: r.id, label: r.label!, name: r.guess.name ?? r.label! }));

export function guessForJob(id: string): TaskGuess | null {
  const rule = RULES.find((r) => r.id === id);
  return rule ? { ...rule.guess, matched: rule.label ?? rule.id } : null;
}

export function inferTask(text: string): TaskGuess | null {
  const q = text.toLowerCase().trim();
  if (q.length < 3) return null;
  const rule = RULES.find((r) => r.test.test(q));
  if (rule) return { ...rule.guess, name: undefined, matched: rule.label ?? rule.id };
  // Fall back to the Maintenance Planner presets by shared words.
  const words = new Set(q.split(/[^a-z]+/).filter((w) => w.length > 3));
  const preset = TASK_PRESETS.filter((p) => p.id !== 'custom').find((p) => {
    const pw = p.label.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
    return pw.some((w) => words.has(w)) && pw.filter((w) => words.has(w)).length >= Math.min(2, pw.length);
  });
  if (preset) {
    const p = findType(preset.id);
    return { typeId: p.id, kind: 'maintenance', category: p.category, intervalDays: p.lifespanDays, priority: 'normal', seasonal: false, cost: p.cost, matched: p.label };
  }
  return null;
}
