import { useState, type ComponentProps } from 'react';
import { useData } from '../../data/DataProvider';
import { entryCount } from '../../lib/dataSafety';
import { Confirm } from '../../ui/overlays';
import type { BackupResult } from './importing';
import { useSaveBackup } from './useSaveBackup';

type Props = Omit<ComponentProps<typeof Confirm>, 'extra' | 'status' | 'confirmDisabled' | 'focusConfirmWhen'> & {
  /** What the confirm is about to do, for the status line: "Check that the backup reached Files before you erase." */
  verb: 'erase' | 'restore';
};

/** What the status line says once a backup finished. It reports what happened and never invites the irreversible step. */
export function backupStatus(result: BackupResult, verb: 'erase' | 'restore'): string | null {
  switch (result.outcome) {
    case 'shared':
      return 'Backup saved.';
    case 'downloaded':
      // Where the device cannot confirm a download (the installed iPhone app), say so.
      return result.date === 'written' ? 'Backup downloaded.' : `Check that the backup reached Files before you ${verb}.`;
    case 'failed':
      return 'The backup couldn’t be saved. Nothing was changed.';
    default:
      // A cancelled share changes nothing.
      return null;
  }
}

/**
 * Erase and restore replace what is on this device. When there is something on it, this adds
 * "Save a backup first". Saving never erases or restores; that stays its own tap.
 */
export function ConfirmWithBackup({ verb, ...props }: Props) {
  const data = useData();
  const { save, busy, dialog } = useSaveBackup();
  const [status, setStatus] = useState('');
  const [saved, setSaved] = useState<'saved' | 'downloaded' | null>(null);

  if (entryCount(data) === 0) return <Confirm {...props} />;

  function run() {
    if (busy || saved !== null) return;
    setStatus('');
    void save({
      quiet: true,
      onDone: (result) => {
        if (result.outcome === 'shared' || result.outcome === 'downloaded') setSaved(result.outcome === 'shared' ? 'saved' : 'downloaded');
        const text = backupStatus(result, verb);
        if (text !== null) setStatus(text);
      },
    });
  }

  return (
    <>
      <Confirm
        {...props}
        confirmDisabled={busy}
        focusConfirmWhen={saved}
        status={status}
        extra={{
          label: busy ? 'Saving…' : saved === 'saved' ? 'Backup saved' : saved === 'downloaded' ? 'Backup downloaded' : 'Save a backup first',
          onClick: run,
          disabled: busy || saved !== null,
        }}
      />
      {dialog}
    </>
  );
}
