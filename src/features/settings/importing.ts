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
  const when = typeof parsed.exportedAt === 'string' ? new Date(parsed.exportedAt) : null;
  const current = store.getSnapshot();
  const hasData = current.tasks.length + current.items.length + current.records.length + current.systems.length > 0;
  return {
    text: [
      `Saved ${when && !Number.isNaN(when.getTime()) ? when.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'on an unknown date'}${data.property?.nickname ? ` for ${data.property.nickname}` : ''}.`,
      `It has ${data.tasks.length} tasks, ${data.systems.length} systems, ${data.items.length} items, ${data.records.length} records and ${files.length} attached files.`,
      hasData
        ? `Restoring replaces everything on this device now (${current.tasks.length} tasks, ${current.systems.length} systems, ${current.items.length} items, ${current.records.length} records). Save a backup of this device first if you might want it.`
        : 'Restoring fills this device with it.',
    ].join(' '),
    apply: () => store.replaceAll(data, files),
  };
}

export async function downloadBackup(store: HomeStore) {
  const text = await buildBackup(store.getSnapshot(), await store.allFiles());
  // Remember when, so Settings and Home can say how old the latest copy is.
  await store.updateSettings({ lastBackupAt: new Date().toISOString() });
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
