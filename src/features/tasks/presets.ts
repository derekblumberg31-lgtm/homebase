/** Maintenance Planner presets: typical jobs with how often they repeat and a typical cost. */
export type Category =
  | 'cleaning'
  | 'maintenance'
  | 'outdoor'
  | 'safety'
  | 'air'
  | 'water'
  | 'appliance'
  | 'vehicle'
  | 'pool'
  | 'other';

export interface CategoryMeta {
  label: string;
  color: string;
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  cleaning: { label: 'Cleaning', color: '#b8375f' },
  maintenance: { label: 'Maintenance', color: '#4b53c9' },
  outdoor: { label: 'Outdoor', color: '#2f855a' },
  safety: { label: 'Safety', color: '#c2410c' },
  air: { label: 'Air', color: '#0f766e' },
  water: { label: 'Water', color: '#2563a8' },
  appliance: { label: 'Appliance', color: '#7c4dbe' },
  pool: { label: 'Pool & spa', color: '#0e7490' },
  vehicle: { label: 'Vehicle', color: '#b45309' },
  other: { label: 'Other', color: '#5b6b62' },
};

export interface TaskPreset {
  id: string;
  label: string;
  category: Category;
  /** Days between one completion and the next. */
  lifespanDays: number;
  cost: number;
}

export const TASK_PRESETS: TaskPreset[] = [
  // Cleaning — the regular household chores.
  { id: 'toilets', label: 'Clean the toilets', category: 'cleaning', lifespanDays: 30, cost: 5 },
  { id: 'dryer-vent', label: 'Clean out the dryer vent', category: 'cleaning', lifespanDays: 180, cost: 20 },
  { id: 'carpet', label: 'Carpet cleaning', category: 'cleaning', lifespanDays: 180, cost: 45 },
  { id: 'floors', label: 'Mop hard floors', category: 'cleaning', lifespanDays: 14, cost: 6 },
  { id: 'bedding', label: 'Wash the bedding', category: 'cleaning', lifespanDays: 14, cost: 8 },
  { id: 'shower-descale', label: 'Descale the shower & tiles', category: 'cleaning', lifespanDays: 60, cost: 12 },
  { id: 'oven', label: 'Deep-clean the oven', category: 'cleaning', lifespanDays: 180, cost: 10 },
  { id: 'windows', label: 'Clean the windows', category: 'cleaning', lifespanDays: 240, cost: 15 },
  { id: 'fridge-coils', label: 'Vacuum the fridge coils', category: 'cleaning', lifespanDays: 180, cost: 5 },
  { id: 'upholstery', label: 'Vacuum upholstery', category: 'cleaning', lifespanDays: 30, cost: 5 },

  // Maintenance — the jobs that stop things breaking.
  { id: 'hvac-service', label: 'Service the HVAC', category: 'maintenance', lifespanDays: 180, cost: 130 },
  { id: 'water-heater', label: 'Flush the water heater', category: 'maintenance', lifespanDays: 365, cost: 20 },
  { id: 'dishwasher', label: 'Clean the dishwasher', category: 'maintenance', lifespanDays: 90, cost: 8 },
  { id: 'washing-machine', label: 'Clean the washing machine', category: 'maintenance', lifespanDays: 90, cost: 12 },
  { id: 'disposal', label: 'Deodorise the garbage disposal', category: 'maintenance', lifespanDays: 30, cost: 5 },
  { id: 'caulking', label: 'Check sinks & caulking', category: 'maintenance', lifespanDays: 180, cost: 10 },

  // Outdoor
  { id: 'gutters', label: 'Clean the gutters', category: 'outdoor', lifespanDays: 180, cost: 25 },
  { id: 'pressure-wash', label: 'Pressure wash paths & drive', category: 'outdoor', lifespanDays: 365, cost: 40 },
  { id: 'deck-seal', label: 'Reseal the deck', category: 'outdoor', lifespanDays: 730, cost: 70 },
  { id: 'garden-beds', label: 'Weed & mulch the beds', category: 'outdoor', lifespanDays: 120, cost: 30 },

  // Safety
  { id: 'smoke-batteries', label: 'Smoke alarm batteries', category: 'safety', lifespanDays: 180, cost: 9 },
  { id: 'co-alarm', label: 'Check CO alarms', category: 'safety', lifespanDays: 365, cost: 0 },
  { id: 'fire-extinguisher', label: 'Fire extinguisher check', category: 'safety', lifespanDays: 365, cost: 15 },
  { id: 'gfcii', label: 'Test GFCI outlets', category: 'safety', lifespanDays: 180, cost: 0 },

  // Filters — air, water, pool and vehicle.
  { id: 'hvac-1', label: 'HVAC air filter · 1"', category: 'air', lifespanDays: 90, cost: 14 },
  { id: 'hvac-4', label: 'HVAC media filter · 4"', category: 'air', lifespanDays: 180, cost: 30 },
  { id: 'air-purifier', label: 'Air purifier HEPA', category: 'air', lifespanDays: 365, cost: 55 },
  { id: 'range-hood', label: 'Range hood grease filter', category: 'air', lifespanDays: 180, cost: 18 },
  { id: 'humidifier', label: 'Humidifier filter', category: 'air', lifespanDays: 90, cost: 15 },
  { id: 'fridge-water', label: 'Refrigerator water filter', category: 'water', lifespanDays: 180, cost: 38 },
  { id: 'under-sink', label: 'Under-sink water filter', category: 'water', lifespanDays: 180, cost: 42 },
  { id: 'whole-house', label: 'Whole-house sediment filter', category: 'water', lifespanDays: 90, cost: 22 },
  { id: 'ro-membrane', label: 'RO membrane', category: 'water', lifespanDays: 730, cost: 60 },
  { id: 'ro-prefilter', label: 'RO pre-filter', category: 'water', lifespanDays: 180, cost: 16 },
  { id: 'pitcher', label: 'Pitcher / faucet filter', category: 'water', lifespanDays: 60, cost: 12 },
  { id: 'shower', label: 'Shower filter', category: 'water', lifespanDays: 180, cost: 25 },
  { id: 'coffee', label: 'Coffee machine filter', category: 'water', lifespanDays: 60, cost: 10 },
  { id: 'pool-cartridge', label: 'Pool cartridge filter', category: 'pool', lifespanDays: 365, cost: 70 },
  { id: 'hot-tub', label: 'Hot tub filter', category: 'pool', lifespanDays: 180, cost: 35 },
  { id: 'aquarium', label: 'Aquarium filter media', category: 'pool', lifespanDays: 30, cost: 8 },
  { id: 'car-cabin', label: 'Car cabin air filter', category: 'vehicle', lifespanDays: 365, cost: 24 },
  { id: 'engine-air', label: 'Engine air filter', category: 'vehicle', lifespanDays: 365, cost: 22 },
  { id: 'vacuum-hepa', label: 'Vacuum HEPA filter', category: 'appliance', lifespanDays: 365, cost: 30 },
  { id: 'dehumidifier', label: 'Dehumidifier filter', category: 'appliance', lifespanDays: 180, cost: 12 },

  // Keep this last: it is the fallback for unknown ids and the "anything else" option.
  { id: 'custom', label: 'Custom task', category: 'other', lifespanDays: 90, cost: 20 },
];

const TYPES_BY_ID = new Map(TASK_PRESETS.map((type) => [type.id, type]));

export function findType(typeId: string): TaskPreset {
  return TYPES_BY_ID.get(typeId) ?? TASK_PRESETS[TASK_PRESETS.length - 1];
}

export const CATEGORY_ORDER: Category[] = [
  'cleaning',
  'maintenance',
  'outdoor',
  'safety',
  'air',
  'water',
  'pool',
  'vehicle',
  'appliance',
  'other',
];
