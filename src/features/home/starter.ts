import type { HomeData } from '../../data/store';
import type { HealthStepState, SystemKind } from '../../data/types';

/**
 * The starter Home Health Check: eight concrete jobs every home should have done once. It's
 * created for every new home, so Home is useful straight after onboarding. Some steps finish on
 * their own when the matching data exists (an HVAC system, a contractor); the rest are marked by
 * the homeowner and kept in settings.healthSteps.
 */

export type StarterStepId =
  | 'water-shutoff'
  | 'electrical-panel'
  | 'gas-shutoff'
  | 'smoke-alarms'
  | 'co-alarms'
  | 'hvac'
  | 'water-heater'
  | 'emergency-contact';

/** What the step's main button does. */
export type StarterAction =
  | { type: 'locate'; label: string; prompt: string; placeholder: string; tips: string[]; noteTitle: string }
  | { type: 'test'; label: string; taskName: string; intervalDays: number; how: string[] }
  | { type: 'system'; label: string; kind: SystemKind }
  | { type: 'contact'; label: string };

export interface StarterStepDef {
  id: StarterStepId;
  title: string;
  why: string;
  minutes: number;
  priority: 'high' | 'normal';
  action: StarterAction;
  /** Can be marked "doesn't apply" (only gas, for homes without it). */
  optional?: { label: string };
}

export type StarterStatus = 'todo' | 'done' | 'not-applicable';

export interface StarterStep extends StarterStepDef {
  status: StarterStatus;
  /** Finished because matching data exists, not because it was ticked. */
  auto: boolean;
  saved?: HealthStepState;
}

export interface StarterCheck {
  steps: StarterStep[];
  /** Steps that count (not "doesn't apply"). */
  total: number;
  done: number;
  score: number;
  /** Minutes left across the open steps. */
  minutesLeft: number;
  next?: StarterStep;
  complete: boolean;
}

export const STARTER_STEPS: StarterStepDef[] = [
  {
    id: 'water-shutoff',
    title: 'Find the main water shutoff',
    why: 'When a pipe bursts, closing this valve in the first minute is the difference between a wet towel and a new floor.',
    minutes: 10,
    priority: 'high',
    action: {
      type: 'locate',
      label: 'Save where it is',
      prompt: 'Where is the main water shutoff?',
      placeholder: 'Basement, front wall, next to the water meter',
      noteTitle: 'Main water shutoff',
      tips: [
        'Look where the water line enters the home: a basement or crawlspace wall facing the street, a utility closet, or near the water heater.',
        'In warm climates it can be outside, near the foundation or in a box by the curb.',
        'Turn it clockwise to close. Don’t force a stuck valve; ask a plumber to replace it.',
      ],
    },
  },
  {
    id: 'electrical-panel',
    title: 'Find the electrical panel',
    why: 'You need it for every tripped breaker, and to cut power fast if water reaches an outlet.',
    minutes: 5,
    priority: 'high',
    action: {
      type: 'locate',
      label: 'Save where it is',
      prompt: 'Where is the electrical panel?',
      placeholder: 'Garage, left of the door. Breaker 14 is the kitchen.',
      noteTitle: 'Electrical panel',
      tips: [
        'Common spots: garage, basement, utility room, hallway or laundry closet.',
        'Note which breakers are labelled. A photo of the door label helps later.',
        'Look, don’t open the inner cover. Only an electrician should remove it.',
      ],
    },
  },
  {
    id: 'gas-shutoff',
    title: 'Find the gas shutoff',
    why: 'Firefighters and the gas company may ask where it is. You only touch it if they tell you to.',
    minutes: 5,
    priority: 'high',
    optional: { label: 'No gas in this home' },
    action: {
      type: 'locate',
      label: 'Save where it is',
      prompt: 'Where is the gas shutoff?',
      placeholder: 'At the meter, right side of the house',
      noteTitle: 'Gas shutoff',
      tips: [
        'The main valve is usually on the pipe next to the gas meter, outside.',
        'If you smell gas, don’t look for it. Leave the home and call the gas company or 911 from outside.',
        'Once gas is shut off, only the gas company should turn it back on.',
      ],
    },
  },
  {
    id: 'smoke-alarms',
    title: 'Test smoke alarms',
    why: 'A home fire can fill a house with smoke in minutes. Alarms that don’t work usually have dead or missing batteries.',
    minutes: 10,
    priority: 'high',
    action: {
      type: 'test',
      label: 'Mark them tested',
      taskName: 'Test smoke alarms',
      intervalDays: 30,
      how: [
        'Press and hold Test on each alarm until it sounds. Use a step stool, not a chair.',
        'One on every level, inside each bedroom and outside sleeping areas.',
        'Replace any alarm over 10 years old. The date is printed on the back.',
      ],
    },
  },
  {
    id: 'co-alarms',
    title: 'Test carbon monoxide alarms',
    why: 'Carbon monoxide has no smell. Gas appliances, fireplaces and attached garages all make a working CO alarm essential.',
    minutes: 5,
    priority: 'high',
    action: {
      type: 'test',
      label: 'Mark them tested',
      taskName: 'Test carbon monoxide alarms',
      intervalDays: 30,
      how: [
        'Press and hold Test on each CO alarm.',
        'You want one on every level and near sleeping areas.',
        'No CO alarm yet? Add a task to buy one and install it near the bedrooms.',
      ],
    },
  },
  {
    id: 'hvac',
    title: 'Add HVAC information',
    why: 'Brand, model and age let Homebase put filters and service on your list, and tell a technician what you have.',
    minutes: 5,
    priority: 'normal',
    action: { type: 'system', label: 'Add heating or cooling', kind: 'heating' },
  },
  {
    id: 'water-heater',
    title: 'Add water-heater information',
    why: 'Tank water heaters last about 10 years. The age and model on the tank label tell you when to budget for a new one.',
    minutes: 5,
    priority: 'normal',
    action: { type: 'system', label: 'Add the water heater', kind: 'water-heater' },
  },
  {
    id: 'emergency-contact',
    title: 'Add one emergency contact',
    why: 'A plumber, electrician or neighbor you can call at 2 a.m., saved before you need them.',
    minutes: 3,
    priority: 'normal',
    action: { type: 'contact', label: 'Save a contact' },
  },
];

const HVAC: SystemKind[] = ['heating', 'cooling'];

/** Steps that finish themselves once the data they ask for exists. */
function autoDone(id: StarterStepId, data: HomeData): boolean {
  switch (id) {
    case 'hvac':
      return data.systems.some((s) => HVAC.includes(s.kind));
    case 'water-heater':
      return data.systems.some((s) => s.kind === 'water-heater');
    case 'emergency-contact':
      return data.records.some((r) => r.kind === 'contractor');
    default:
      return false;
  }
}

export function starterCheckFor(data: HomeData): StarterCheck {
  const saved = data.settings.healthSteps ?? {};
  const steps: StarterStep[] = STARTER_STEPS.map((def) => {
    const state = saved[def.id];
    const auto = autoDone(def.id, data);
    let status: StarterStatus = 'todo';
    if (state?.state === 'not-applicable' || (def.id === 'gas-shutoff' && data.settings.hasGas === false && state?.state !== 'done')) status = 'not-applicable';
    else if (state?.state === 'done' || auto) status = 'done';
    return { ...def, status, auto: auto && state?.state !== 'done', saved: state };
  });
  const counted = steps.filter((s) => s.status !== 'not-applicable');
  const done = counted.filter((s) => s.status === 'done').length;
  const open = steps.filter((s) => s.status === 'todo');
  // High-priority steps first, then in the listed order.
  const next = [...open].sort((a, b) => Number(b.priority === 'high') - Number(a.priority === 'high'))[0];
  return {
    steps,
    total: counted.length,
    done,
    score: counted.length ? Math.round((done / counted.length) * 100) : 100,
    minutesLeft: open.reduce((sum, s) => sum + s.minutes, 0),
    next,
    complete: open.length === 0,
  };
}

/** Where the homeowner said a shutoff or panel is, for the Assistant. */
export function savedLocation(data: HomeData, id: StarterStepId): string | undefined {
  const note = data.settings.healthSteps?.[id]?.note;
  if (note) return note;
  const def = STARTER_STEPS.find((s) => s.id === id);
  if (def?.action.type !== 'locate') return undefined;
  const title = def.action.noteTitle.toLowerCase();
  return data.records.find((r) => r.kind === 'note' && r.title.toLowerCase().startsWith(title))?.notes;
}
