import { useCallback, useState } from 'react';
import { clearFlag, readFlag, readStringList, writeFlag, writeStringList } from '../../lib/deviceFlags';

const ROWS_KEY = 'homebase:alert-rows-dismissed';
const BACKUP_KEY = 'homebase:backup-row-dismissed';

/** Which Home alert rows this device has hidden. Kept in React too, so a row hides even when storage is blocked. */
export function useAlertDismissals() {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set(readStringList(ROWS_KEY)));
  const [backupDismissedAt, setBackupDismissedAt] = useState<string | undefined>(() => readFlag(BACKUP_KEY) ?? undefined);

  const dismiss = useCallback((key: string) => {
    setDismissed((prev) => new Set(prev).add(key));
    writeStringList(ROWS_KEY, [...new Set([...readStringList(ROWS_KEY), key])]);
  }, []);

  const restore = useCallback((key: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    writeStringList(ROWS_KEY, readStringList(ROWS_KEY).filter((k) => k !== key));
  }, []);

  const dismissBackup = useCallback(() => {
    const at = new Date().toISOString();
    setBackupDismissedAt(at);
    writeFlag(BACKUP_KEY, at);
  }, []);

  const restoreBackup = useCallback(() => {
    setBackupDismissedAt(undefined);
    clearFlag(BACKUP_KEY);
  }, []);

  return { dismissed, backupDismissedAt, dismiss, restore, dismissBackup, restoreBackup };
}
