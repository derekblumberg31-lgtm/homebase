import { buildBackup, parseHomebaseBackup, readBackup } from '../../data/backup';
import type { HomeStore } from '../../data/store';
import { toDateInput } from '../../lib/dates';

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
    apply: () => store.replaceAll(data, files),
  };
}

export async function downloadBackup(store: HomeStore) {
  const text = await buildBackup(store.getSnapshot(), await store.allFiles());
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `homebase-backup-${toDateInput()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
