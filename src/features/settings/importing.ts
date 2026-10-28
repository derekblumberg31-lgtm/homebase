import { buildBackup, detectBackup, importKeyFinder, importReplacely, parseHomebaseBackup } from '../../data/backup';
import type { HomeStore } from '../../data/store';
import { toDateInput } from '../../lib/dates';

export interface ImportSummary {
  source: 'Homebase' | 'Replacely' | 'KeyFinder';
  text: string;
  /** Homebase backups replace everything, so they need a confirmation first. */
  replaces: boolean;
  apply: () => Promise<void>;
}

/** Reads a backup file and describes what bringing it in will do, before anything changes. */
export async function prepareImport(store: HomeStore, file: File): Promise<ImportSummary> {
  const text = await file.text();
  const detected = detectBackup(text);
  if (!detected) throw new Error('That file isn’t a Homebase, Replacely or KeyFinder backup.');

  if (detected.kind === 'homebase') {
    const { data, files } = parseHomebaseBackup(detected.parsed);
    return {
      source: 'Homebase',
      replaces: true,
      text: `This backup has ${data.tasks.length} tasks, ${data.items.length} items and ${data.records.length} records. Restoring it replaces everything on this device.`,
      apply: () => store.replaceAll(data, files),
    };
  }

  const imported = detected.kind === 'replacely' ? importReplacely(detected.parsed) : importKeyFinder(detected.parsed);
  const source = detected.kind === 'replacely' ? 'Replacely' : 'KeyFinder';
  const count = detected.kind === 'replacely' ? imported.tasks.length : imported.items.length;
  if (count === 0) throw new Error(`That ${source} backup doesn’t have anything to bring in.`);
  const noun = detected.kind === 'replacely' ? (count === 1 ? 'task' : 'tasks') : count === 1 ? 'key' : 'keys';

  return {
    source,
    replaces: false,
    text: `Adds ${count} ${noun} from ${source}. Anything already here stays; matching entries are updated.`,
    apply: async () => {
      await store.putMany('tasks', imported.tasks);
      await store.putMany('serviceEvents', imported.serviceEvents);
      await store.putMany('items', imported.items);
      await store.log('import', `Brought in ${count} ${noun} from ${source}`, detected.kind === 'replacely' ? '/tasks' : '/property/keys');
    },
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
