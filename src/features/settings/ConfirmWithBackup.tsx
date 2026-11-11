import { useState, type ComponentProps } from 'react';
import { useData } from '../../data/DataProvider';
import { entryCount } from '../../lib/dataSafety';
import { Confirm } from '../../ui/overlays';
import { useSaveBackup } from './useSaveBackup';

type Props = Omit<ComponentProps<typeof Confirm>, 'extra' | 'status' | 'confirmDisabled'> & {
  /** What the confirm is about to do, for the status line: "You can erase now." */
  verb: 'erase' | 'restore';
};

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
    setStatus('');
    void save({
      quiet: true,
      onDone: (result) => {
        if (result.outcome === 'shared' || result.outcome === 'downloaded') {
          const word = result.outcome === 'shared' ? 'saved' : 'downloaded';
          setSaved(word);
          setStatus(`Backup ${word}. You can ${verb} now.`);
        } else if (result.outcome === 'failed') {
          setStatus('The backup couldn’t be saved. Nothing was changed.');
        }
        // A cancelled share changes nothing.
      },
    });
  }

  return (
    <>
      <Confirm
        {...props}
        confirmDisabled={busy}
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
