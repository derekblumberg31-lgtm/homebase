/**
 * Homebase's data model. Everything is stored on this device (IndexedDB); one backup file holds it
 * all. Fields that future features need (year built, system install years, item values, providers)
 * exist from the start so those features can grow without migrations.
 */

export type ID = string;
/** Local calendar date, YYYY-MM-DD. */
export type DateString = string;
/** ISO timestamp. */
export type Timestamp = string;

export type ThemePreference = 'system' | 'light' | 'dark';

export interface Member {
  id: ID;
  name: string;
  role: 'owner' | 'member';
}

export interface Household {
  id: 'household';
  name: string;
  members: Member[];
  createdAt: Timestamp;
  /** Set when onboarding is finished. */
  onboardedAt?: Timestamp;
}

export type PropertyType = 'house' | 'townhouse' | 'condo' | 'apartment' | 'other';

export interface Property {
  id: 'property';
  nickname: string;
  address?: string;
  type?: PropertyType;
  ownership?: 'own' | 'rent';
  yearBuilt?: number;
  squareFeet?: number;
  bedrooms?: number;
  bathrooms?: number;
  notes?: string;
  updatedAt: Timestamp;
}

export interface Room {
  id: ID;
  name: string;
  floor?: string;
  notes?: string;
  createdAt: Timestamp;
}

export type SystemKind =
  | 'heating'
  | 'cooling'
  | 'water-heater'
  | 'plumbing'
  | 'electrical'
  | 'roof'
  | 'windows'
  | 'security'
  | 'other';

export interface HomeSystem {
  id: ID;
  kind: SystemKind;
  name: string;
  brand?: string;
  model?: string;
  installYear?: number;
  /** Optional, newer fields. Older systems and backups simply don't have them. */
  serial?: string;
  /** Exact install or purchase date when known; installYear stays the lifespan source. */
  installDate?: DateString;
  /** Free-text spot when there's no room, e.g. "Basement, behind the stairs". */
  location?: string;
  warrantyExpires?: DateString;
  /** The contractor record (kind 'contractor') who installs or services it. */
  contractorId?: ID;
  /** Photo data URLs. */
  photos?: string[];
  roomId?: ID;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ItemKind = 'appliance' | 'key' | 'electronics' | 'furniture' | 'tool' | 'other';

/** Where a key's brand and keyway came from (KeyFinder's ranking). */
export type KeyIdSource = 'user' | 'text' | 'text-brand' | 'learned' | 'shape' | 'unknown';

/** One photo of a key, as KeyFinder's engine measures it. */
export interface KeyCapture {
  id: ID;
  at: Timestamp;
  /** JPEG data URL, at most 640px. */
  photo: string;
  /** PNG data URL of the cut-out. */
  silhouette?: string;
  sig?: number[];
  top?: number[];
  bot?: number[];
  ratio?: number;
  headShape?: string;
  headFeat?: unknown;
  ocrText?: string;
  ocrTokens?: string[];
}

export interface KeyDetails {
  keyway?: string;
  blank?: string;
  /** house, padlock, mailbox, car, high security… */
  type?: string;
  flags: { dnd?: boolean; transponder?: boolean };
  idSource: KeyIdSource;
  ocrTokens: string[];
  captures: KeyCapture[];
}

export interface Item {
  id: ID;
  kind: ItemKind;
  name: string;
  brand?: string;
  model?: string;
  serial?: string;
  /** Estimated value in dollars. */
  value?: number;
  purchaseDate?: DateString;
  roomId?: ID;
  /** For keys: what it opens. For others: free notes. */
  notes?: string;
  /** Photo data URLs. */
  photos: string[];
  key?: KeyDetails;
  /** The contractor record (kind 'contractor') who services it. Optional, newer field. */
  contractorId?: ID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type TaskKind = 'maintenance' | 'repair' | 'project';

export type TaskPriority = 'low' | 'normal' | 'high';

/** Matches the Maintenance Planner preset categories. */
export type TaskCategory =
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

export interface Task {
  id: ID;
  kind: TaskKind;
  name: string;
  /** Preset id from the Maintenance Planner list, or 'custom'. */
  typeId: string;
  /** Free-text place ("Hallway return"); roomId links it to a room when known. */
  location: string;
  roomId?: ID;
  itemId?: ID;
  /** The home system it's for. Optional, newer field. */
  systemId?: ID;
  /**
   * Snoozed or rescheduled: the next due date, overriding the usual one until the task is marked
   * done. Optional, newer field; older versions ignore it and use the normal schedule.
   */
  nextDue?: DateString;
  /** Recurring tasks: the last time it was done, and how often it repeats. */
  lastDoneAt: DateString;
  intervalDays: number;
  /** One-off repairs and projects: when it should be done by. Recurring tasks leave this empty. */
  dueDate?: DateString;
  recurring: boolean;
  status: 'open' | 'done';
  /** Estimated cost each time, in dollars. */
  cost?: number;
  /** Missing on older tasks: treated as normal. */
  priority?: TaskPriority;
  /** Missing on older tasks: taken from the preset, or 'other'. */
  category?: TaskCategory;
  /** Planned from a seasonal recommendation, or marked as a seasonal job. */
  seasonal?: boolean;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ServiceEvent {
  id: ID;
  date: DateString;
  title: string;
  taskId?: ID;
  itemId?: ID;
  /** Optional, newer field. */
  systemId?: ID;
  /** For recurring tasks: when it had last been done before this. */
  previousDoneAt?: DateString;
  cost?: number;
  /** Who did it: "Me", a household member, or a company. Ready for contractor history. */
  provider?: string;
  notes?: string;
  createdAt: Timestamp;
}

export type RecordKind =
  | 'receipt'
  | 'invoice'
  | 'manual'
  | 'permit'
  | 'inspection'
  | 'warranty'
  | 'insurance'
  | 'contractor'
  | 'note'
  | 'other';

export interface HomeRecord {
  id: ID;
  kind: RecordKind;
  title: string;
  date?: DateString;
  /** Warranties, insurance and permits can expire; Home warns before they do. */
  expiresAt?: DateString;
  amount?: number;
  vendor?: string;
  /** Contractors and vendors. */
  phone?: string;
  email?: string;
  itemId?: ID;
  /** The home system it covers (water heater manual, furnace warranty). Optional, newer field. */
  systemId?: ID;
  taskId?: ID;
  notes?: string;
  fileIds: ID[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StoredFile {
  id: ID;
  name: string;
  type: string;
  size: number;
  data: Blob;
  createdAt: Timestamp;
}

export type ActivityKind =
  | 'task-added'
  | 'task-done'
  | 'task-removed'
  | 'item-added'
  | 'key-added'
  | 'record-added'
  | 'property-updated'
  | 'import';

export interface Activity {
  id: ID;
  at: Timestamp;
  kind: ActivityKind;
  text: string;
  /** Route to open when the entry is tapped, e.g. /tasks/abc. */
  href?: string;
}

export interface TipState {
  state: 'planned' | 'snoozed' | 'done' | 'hidden';
  /** Snoozed recommendations come back on this date. */
  until?: DateString;
  /** The task created when it was planned. */
  taskId?: ID;
  at: Timestamp;
}

export interface Settings {
  id: 'settings';
  theme: ThemePreference;
  reminders: boolean;
  /** Dismissed Home recommendations, by id. Kept for older data; new choices go in tipStates. */
  dismissedTips: string[];
  /** What the homeowner did with each seasonal recommendation, by id. */
  tipStates?: Record<string, TipState>;
  /** KeyFinder's debug view. */
  keyDebug: boolean;
  /** Starter Home Health Check: what the homeowner did with each step, by step id. Optional, newer field. */
  healthSteps?: Record<string, HealthStepState>;
  /** Whether the home has gas service, asked during onboarding. Undefined means not sure. */
  hasGas?: boolean;
  /** When a backup file was last saved from this device. */
  lastBackupAt?: Timestamp;
}

export interface HealthStepState {
  state: 'done' | 'skipped' | 'not-applicable';
  at: Timestamp;
  /** What the homeowner noted, e.g. where the shut-off is. */
  note?: string;
}

export const STORES = [
  'meta',
  'rooms',
  'systems',
  'items',
  'tasks',
  'serviceEvents',
  'records',
  'files',
  'activity',
] as const;
export type StoreName = (typeof STORES)[number];
