import { buildBackup, parseHomebaseBackup, readBackup } from '../../data/backup';
import type { HomeStore } from '../../data/store';
import { toDateInput } from '../../lib/dates';
import { deliverBackup, readDeviceEnv, recordsBackup, recordsOnDownload, type DeliverCaps, type Delivery, type DeviceEnv } from '../../lib/dataSafety';

export interface RestoreSummary {
  text: string;
  apply: () => Promise<void>;
}

/** Reads a backup file and says what restoring it will do, before anything changes. */
export async function prepareRestore(store: HomeStore, file: File): Promise<RestoreSummary> {
  const parsed = readBackup(await file.text());
  if (!parsed) throw new Error('That file isn’t a Homebase backup. Choose the .json file saved from Settings.');
  const { data, files } = parseHomebaseBackup(parsed);
  return {
    text: `This backup has ${data.tasks.length} tasks, ${data.items.length} items and ${data.records.length} records. Restoring it replaces everything on this device.`,
    apply: async () => {
      await store.replaceAll(data, files);
      // The file in hand is a backup, so its home is not "only on this device". The restore already worked: a failed date write is not an error.
      const exportedAt = parsed.exportedAt;
      if (typeof exportedAt === 'string' && Number.isFinite(Date.parse(exportedAt))) await store.updateSettings({ lastBackupAt: exportedAt }).catch(() => {});
    },
  };
}

function backupName() {
  return `homebase-backup-${toDateInput()}.json`;
}

/** Builds the backup as a file. Throws if the data can't be read. */
export async function prepareBackupFile(store: HomeStore): Promise<File> {
  const text = await buildBackup(store.getSnapshot(), await store.allFiles());
  return new File([text], backupName(), { type: 'application/json' });
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The real browser's way out for a file: the share sheet where it takes files, else a download. */
export function browserDeliverCaps(): DeliverCaps {
  return {
    canShareFile: (file) => typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }),
    // No title, text or url: on iOS extra fields can be saved as a second item beside the file.
    share: (file) => navigator.share({ files: [file] }),
    download: downloadFile,
  };
}

export type DateNote = 'written' | 'skipped' | 'failed';

export interface BackupResult {
  outcome: Exclude<Delivery, 'downloaded-after-failed-share'> | 'failed';
  /** Whether "Last backup" was updated. Only a share, or a download the device can vouch for, writes it. */
  date: DateNote;
  /** Kept when the tap ran out ('needs-tap') so a second tap can share the same file. */
  file?: File;
}

/** Delivers a prepared file and writes `lastBackupAt` only if the save went through. */
export async function deliverAndRecord(store: HomeStore, file: File, caps: DeliverCaps = browserDeliverCaps(), env: DeviceEnv = readDeviceEnv()): Promise<BackupResult> {
  const delivery = await deliverBackup(file, caps);
  if (delivery === 'needs-tap') return { outcome: delivery, date: 'skipped', file };
  // To the screens a download after a failed share is a download; only the date rule differs.
  const outcome = delivery === 'downloaded-after-failed-share' ? 'downloaded' : delivery;
  if (!recordsBackup(delivery, env)) return { outcome, date: 'skipped' };
  try {
    await store.updateSettings({ lastBackupAt: new Date().toISOString() });
    return { outcome, date: 'written' };
  } catch {
    return { outcome, date: 'failed' };
  }
}

/** Builds the backup, hands it to the share sheet or a download, and notes the date only on a real save. */
export async function saveBackup(store: HomeStore, caps?: DeliverCaps, env?: DeviceEnv): Promise<BackupResult> {
  let file: File;
  try {
    file = await prepareBackupFile(store);
  } catch {
    return { outcome: 'failed', date: 'skipped' };
  }
  return deliverAndRecord(store, file, caps, env);
}

/** Download only (the crash screen). Returns whether the date was recorded. */
export async function downloadBackup(store: HomeStore): Promise<boolean> {
  const file = await prepareBackupFile(store);
  downloadFile(file);
  if (!recordsOnDownload(readDeviceEnv())) return false;
  await store.updateSettings({ lastBackupAt: new Date().toISOString() });
  return true;
}
