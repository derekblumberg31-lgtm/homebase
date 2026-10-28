import { defaultSettings, emptyData, type HomeData } from './store';
import type { StoredFile } from './types';

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
