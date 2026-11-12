import { useRef, useState } from 'react';
import { useCloudState } from '../../cloud/cloudContext';
import { CLOUD_COPY } from '../../cloud/copy';
import { useStore } from '../../data/DataProvider';
import { useToast } from '../../ui/overlays';
import { ConfirmWithBackup } from './ConfirmWithBackup';
import { prepareRestore, type RestoreSummary } from './importing';

/** Pick a Homebase backup, see what restoring it will do, then confirm. */
export function ImportButton({ label = 'Restore from a backup', className = 'row is-action', onDone }: { label?: string; className?: string; onDone?: () => void }) {
  const store = useStore();
  const cloudState = useCloudState();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<RestoreSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const applying = useRef(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      setPending(await prepareRestore(store, file));
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Couldn’t read that file.', { tone: 'error' });
    }
  }

  async function apply() {
    // The confirm dialog stays up while this runs, so a double tap must not restore twice.
    if (!pending || applying.current) return;
    applying.current = true;
    setBusy(true);
    try {
      await pending.apply();
      toast('Backup restored');
      onDone?.();
    } catch {
      toast('That didn’t finish. Nothing was changed; try the file again.', { tone: 'error' });
    } finally {
      applying.current = false;
      setBusy(false);
      setPending(null);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => input.current?.click()} disabled={busy}>
        <span className="row-main">
          <span className="row-title">{busy ? 'Restoring…' : label}</span>
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          void pick(file);
        }}
      />
      {pending && (
        <ConfirmWithBackup
          verb="restore"
          title="Restore this backup?"
          message={cloudState === 'signed-in' ? `${pending.text} ${CLOUD_COPY.restoreConfirmAddition}` : pending.text}
          confirmLabel="Restore"
          destructive
          onConfirm={apply}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
