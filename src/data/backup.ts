import { isRealDate } from '../lib/dates';
import { defaultSettings, type HomeData } from './store';
import type { Household, Property, Settings, StoredFile } from './types';

/**
 * One backup file holds everything Homebase keeps on this device. Files (attachments) are embedded
 * as base64 so the backup restores on any device.
 */

export const BACKUP_APP = 'Homebase';
export const BACKUP_VERSION = 1;

interface BackupFile {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
  base64: string;
}

interface HomebaseBackup {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  data: HomeData;
  files: BackupFile[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function buildBackup(data: HomeData, files: StoredFile[]): Promise<string> {
  const backup: HomebaseBackup = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
    files: await Promise.all(
      files.map(async (file) => ({
        id: file.id,
        name: file.name,
        type: file.type,
        size: file.size,
        createdAt: file.createdAt,
        base64: await blobToBase64(file.data),
      })),
    ),
  };
  return JSON.stringify(backup);
}

/** The parsed backup, or null when the file isn't a Homebase backup. */
export function readBackup(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) && parsed.app === BACKUP_APP && isRecord(parsed.data) ? parsed : null;
  } catch {
    return null;
  }
}

type Row = Record<string, unknown>;

const hasStrings = (row: Row, keys: string[]) => keys.every((key) => typeof row[key] === 'string');
const optionalStrings = (row: Row, keys: string[]) => keys.every((key) => row[key] == null || typeof row[key] === 'string');
const optionalDate = (value: unknown) => value == null || value === '' || isRealDate(value);

function validKey(key: unknown): boolean {
  return isRecord(key) && Array.isArray(key.captures) && key.captures.every(isRecord) && isRecord(key.flags);
}

/** What the screens rely on in each collection. A row that breaks these would crash them later. */
const ROW_CHECKS = {
  rooms: (row: Row) => hasStrings(row, ['name']) && optionalStrings(row, ['floor', 'notes']),
  systems: (row: Row) =>
    hasStrings(row, ['name', 'kind']) &&
    optionalStrings(row, ['brand', 'model', 'notes', 'roomId', 'serial', 'location', 'contractorId']) &&
    optionalDate(row.installDate) &&
    optionalDate(row.warrantyExpires) &&
    (row.photos == null || (Array.isArray(row.photos) && row.photos.every((p) => typeof p === 'string'))),
  items: (row: Row) =>
    hasStrings(row, ['name', 'kind']) &&
    optionalStrings(row, ['brand', 'model', 'serial', 'notes', 'roomId', 'contractorId']) &&
    optionalDate(row.purchaseDate) &&
    Array.isArray(row.photos) &&
    (row.kind === 'key' || row.key != null ? validKey(row.key) : true),
  tasks: (row: Row) =>
    hasStrings(row, ['name', 'kind']) &&
    optionalStrings(row, ['location', 'typeId', 'notes', 'roomId', 'itemId', 'systemId']) &&
    optionalDate(row.nextDue) &&
    isRealDate(row.lastDoneAt) &&
    typeof row.intervalDays === 'number' &&
    row.intervalDays > 0 &&
    typeof row.recurring === 'boolean' &&
    (row.status === 'open' || row.status === 'done') &&
    optionalDate(row.dueDate),
  serviceEvents: (row: Row) => hasStrings(row, ['title']) && isRealDate(row.date) && optionalStrings(row, ['provider', 'notes', 'taskId', 'itemId', 'systemId']),
  records: (row: Row) =>
    hasStrings(row, ['title', 'kind']) &&
    optionalStrings(row, ['vendor', 'phone', 'email', 'notes', 'itemId', 'taskId', 'systemId']) &&
    optionalDate(row.date) &&
    optionalDate(row.expiresAt) &&
    Array.isArray(row.fileIds),
  activity: (row: Row) => hasStrings(row, ['at', 'text', 'kind']) && optionalStrings(row, ['href']),
};

function damaged(part: string) {
  return new Error(`This backup is damaged (a problem in its ${part}), so nothing was changed.`);
}

function validRows<C extends keyof typeof ROW_CHECKS>(raw: Row, collection: C, label: string): HomeData[C] {
  const rows = raw[collection];
  if (rows === undefined) return [];
  const check = ROW_CHECKS[collection];
  const valid = Array.isArray(rows) && rows.every((row) => isRecord(row) && typeof row.id === 'string' && row.id !== '' && check(row));
  if (!valid) throw damaged(label);
  return rows as HomeData[C];
}

function validHousehold(value: unknown): Household | undefined {
  if (value == null) return undefined;
  const valid = isRecord(value) && hasStrings(value, ['name']) && Array.isArray(value.members) && value.members.every((m) => isRecord(m) && hasStrings(m, ['id', 'name']));
  if (!valid) throw damaged('household');
  return { ...(value as unknown as Household), id: 'household' };
}

function validProperty(value: unknown): Property | undefined {
  if (value == null) return undefined;
  if (!isRecord(value) || !hasStrings(value, ['nickname']) || !optionalStrings(value, ['address', 'notes'])) throw damaged('home details');
  return { ...(value as unknown as Property), id: 'property' };
}

/** Keeps what's usable from the saved settings; a bad value falls back to the default. */
function validSettings(value: unknown): Settings {
  const defaults = defaultSettings();
  if (!isRecord(value)) return defaults;
  return {
    id: 'settings',
    theme: value.theme === 'light' || value.theme === 'dark' ? value.theme : defaults.theme,
    reminders: value.reminders === true,
    dismissedTips: Array.isArray(value.dismissedTips) ? value.dismissedTips.filter((tip): tip is string => typeof tip === 'string') : [],
    tipStates: isRecord(value.tipStates) ? (value.tipStates as Settings['tipStates']) : {},
    keyDebug: value.keyDebug === true,
    lastBackupAt: typeof value.lastBackupAt === 'string' ? value.lastBackupAt : undefined,
    healthSteps: validHealthSteps(value.healthSteps),
    hasGas: typeof value.hasGas === 'boolean' ? value.hasGas : undefined,
  };
}

/** Starter Health Check progress: keeps well-formed steps, drops anything else. */
function validHealthSteps(value: unknown): Settings['healthSteps'] {
  if (!isRecord(value)) return undefined;
  const steps = Object.entries(value).filter(
    ([, step]) => isRecord(step) && ['done', 'skipped', 'not-applicable'].includes(step.state as string) && typeof step.at === 'string' && (step.note == null || typeof step.note === 'string'),
  );
  return steps.length ? (Object.fromEntries(steps) as Settings['healthSteps']) : undefined;
}

function validFiles(value: unknown): StoredFile[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw damaged('files');
  return value.map((file) => {
    if (!isRecord(file) || !hasStrings(file, ['id', 'name', 'type', 'createdAt', 'base64']) || typeof file.size !== 'number') throw damaged('files');
    const { id, name, type, size, createdAt, base64 } = file as unknown as BackupFile;
    try {
      return { id, name, type, size, createdAt, data: base64ToBlob(base64, type) };
    } catch {
      throw damaged('files');
    }
  });
}

/** Checks the whole backup before anything on the device changes. Throws a message to show if it's unusable. */
export function parseHomebaseBackup(parsed: Record<string, unknown>): { data: HomeData; files: StoredFile[] } {
  if (typeof parsed.version === 'number' && parsed.version > BACKUP_VERSION) {
    throw new Error('This backup came from a newer version of Homebase, so nothing was changed. Update Homebase, then try again.');
  }
  if (!isRecord(parsed.data)) throw damaged('data');
  const raw = parsed.data;
  const data: HomeData = {
    household: validHousehold(raw.household),
    property: validProperty(raw.property),
    settings: validSettings(raw.settings),
    rooms: validRows(raw, 'rooms', 'rooms'),
    systems: validRows(raw, 'systems', 'home systems'),
    items: validRows(raw, 'items', 'items'),
    tasks: validRows(raw, 'tasks', 'tasks'),
    serviceEvents: validRows(raw, 'serviceEvents', 'service history'),
    records: validRows(raw, 'records', 'records'),
    activity: validRows(raw, 'activity', 'activity'),
  };
  return { data, files: validFiles(parsed.files) };
}
