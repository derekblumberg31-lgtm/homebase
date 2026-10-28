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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type TaskKind = 'maintenance' | 'repair' | 'project';

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
  /** Recurring tasks: the last time it was done, and how often it repeats. */
  lastDoneAt: DateString;
  intervalDays: number;
  /** One-off repairs and projects: when it should be done by. Recurring tasks leave this empty. */
  dueDate?: DateString;
  recurring: boolean;
  status: 'open' | 'done';
  /** Estimated cost each time, in dollars. */
  cost?: number;
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
  itemId?: ID;
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

export interface Settings {
  id: 'settings';
  theme: ThemePreference;
  reminders: boolean;
  /** Dismissed Home recommendations, by id. */
  dismissedTips: string[];
  /** KeyFinder's debug view. */
  keyDebug: boolean;
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
