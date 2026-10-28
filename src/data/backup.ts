import { isRealDate } from '../lib/dates';
import { uid } from './ids';
import { defaultSettings, emptyData, type HomeData } from './store';
import type { Item, KeyCapture, KeyDetails, KeyIdSource, ServiceEvent, StoredFile, Task } from './types';

/**
 * One backup file holds everything Homebase keeps on this device. Files (attachments) are embedded
 * as base64 so the backup restores on any device. Older Replacely and KeyFinder exports can be
 * brought in too; their storage lives on other web addresses, so a file is the only bridge.
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

export type BackupKind = 'homebase' | 'replacely' | 'keyfinder';

export interface ImportedData {
  tasks: Task[];
  serviceEvents: ServiceEvent[];
  items: Item[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const num = (value: unknown) => {
  const n = Number(value);
  return value !== null && value !== '' && Number.isFinite(n) ? n : undefined;
};

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

export function detectBackup(text: string): { kind: BackupKind; parsed: Record<string, unknown> } | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) return null;
    if (parsed.app === BACKUP_APP && isRecord(parsed.data)) return { kind: 'homebase', parsed };
    if (parsed.app === 'KeyFinder' || (Array.isArray(parsed.keys) && !parsed.filters)) return { kind: 'keyfinder', parsed };
    if (Array.isArray(parsed.filters)) return { kind: 'replacely', parsed };
    return null;
  } catch {
    return null;
  }
}

export function parseHomebaseBackup(parsed: Record<string, unknown>): { data: HomeData; files: StoredFile[] } {
  const raw = parsed.data as Partial<HomeData>;
  const base = emptyData();
  const data: HomeData = {
    household: raw.household,
    property: raw.property,
    settings: { ...defaultSettings(), ...raw.settings, id: 'settings' },
    rooms: Array.isArray(raw.rooms) ? raw.rooms : base.rooms,
    systems: Array.isArray(raw.systems) ? raw.systems : base.systems,
    items: Array.isArray(raw.items) ? raw.items : base.items,
    tasks: Array.isArray(raw.tasks) ? raw.tasks : base.tasks,
    serviceEvents: Array.isArray(raw.serviceEvents) ? raw.serviceEvents : base.serviceEvents,
    records: Array.isArray(raw.records) ? raw.records : base.records,
    activity: Array.isArray(raw.activity) ? raw.activity : base.activity,
  };
  const files = (Array.isArray(parsed.files) ? (parsed.files as BackupFile[]) : []).map((file) => ({
    id: file.id,
    name: file.name,
    type: file.type,
    size: file.size,
    createdAt: file.createdAt,
    data: base64ToBlob(file.base64, file.type),
  }));
  return { data, files };
}

/** Replacely (and its earlier name, Filterly) backup: { app, version, filters: [...] }. */
export function importReplacely(parsed: Record<string, unknown>): ImportedData {
  const now = new Date().toISOString();
  const tasks: Task[] = [];
  const serviceEvents: ServiceEvent[] = [];
  for (const value of parsed.filters as unknown[]) {
    if (!isRecord(value)) continue;
    if (value.isSample === true || (typeof value.id === 'string' && value.id.startsWith('sample-'))) continue;
    const name = str(value.name);
    const location = str(value.location) ?? '';
    const lastDoneAt = value.installedAt;
    const intervalDays = Math.round(Number(value.lifespanDays));
    if (!name || !isRealDate(lastDoneAt) || !(intervalDays >= 1 && intervalDays <= 3650)) continue;
    const id = str(value.id) ?? uid();
    const cost = num(value.cost);
    tasks.push({
      id,
      kind: 'maintenance',
      name,
      typeId: str(value.typeId) ?? 'custom',
      location,
      lastDoneAt,
      intervalDays,
      recurring: true,
      status: 'open',
      cost: cost !== undefined && cost >= 0 ? cost : undefined,
      notes: str(value.notes),
      createdAt: str(value.createdAt) ?? now,
      updatedAt: now,
    });
    for (const entry of Array.isArray(value.history) ? value.history : []) {
      if (!isRecord(entry) || !isRealDate(entry.replacedAt)) continue;
      serviceEvents.push({
        id: str(entry.id) ?? uid(),
        date: entry.replacedAt,
        title: name,
        taskId: id,
        previousDoneAt: isRealDate(entry.previousInstalledAt) ? entry.previousInstalledAt : undefined,
        notes: str(entry.note),
        createdAt: now,
      });
    }
  }
  return { tasks, serviceEvents, items: [] };
}

const ID_SOURCES: KeyIdSource[] = ['user', 'text', 'text-brand', 'learned', 'shape', 'unknown'];

/** KeyFinder backup: { app: 'KeyFinder', version: 1, keys: [...] } (or a bare array of keys). */
export function importKeyFinder(parsed: Record<string, unknown> | unknown[]): ImportedData {
  const keys = Array.isArray(parsed) ? parsed : Array.isArray(parsed.keys) ? parsed.keys : [];
  const now = new Date().toISOString();
  const items: Item[] = [];
  for (const value of keys) {
    if (!isRecord(value) || !str(value.id) || !str(value.label) || !Array.isArray(value.captures)) continue;
    const flags = isRecord(value.flags) ? value.flags : {};
    const key: KeyDetails = {
      keyway: str(value.keyway),
      blank: str(value.blank),
      type: str(value.type),
      flags: { dnd: flags.dnd === true, transponder: flags.transponder === true },
      idSource: ID_SOURCES.includes(value.idSource as KeyIdSource) ? (value.idSource as KeyIdSource) : 'unknown',
      ocrTokens: Array.isArray(value.ocrTokens) ? (value.ocrTokens as string[]) : [],
      captures: (value.captures as unknown[]).filter(isRecord) as unknown as KeyCapture[],
    };
    const createdAt = typeof value.createdAt === 'number' ? new Date(value.createdAt).toISOString() : str(value.createdAt) ?? now;
    items.push({
      id: value.id as string,
      kind: 'key',
      name: value.label as string,
      brand: str(value.brand),
      notes: str(value.notes),
      photos: [],
      key,
      createdAt,
      updatedAt: now,
    });
  }
  return { tasks: [], serviceEvents: [], items };
}
