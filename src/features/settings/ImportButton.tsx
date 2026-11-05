import { useRef, useState } from 'react';
import { useStore } from '../../data/DataProvider';
import { Sheet, useToast } from '../../ui/overlays';
import { downloadBackup, prepareRestore, type RestoreSummary } from './importing';

/** Pick a Homebase backup, see what restoring it will do, then confirm. */
export function ImportButton({ label = 'Restore from a backup', className = 'row is-action', onDone }: { label?: string; className?: string; onDone?: () => void }) {
  const store = useStore();
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
        <Sheet title="Restore this backup?" onClose={() => setPending(null)}>
          <p className="callout is-warn">{pending.text}</p>
          <p className="sheet-lead form-gap">Nothing changes until you tap Restore. If the file can’t be read, this device keeps what it has.</p>
          <div className="button-stack">
            <button
              type="button"
              className="button is-secondary is-block"
              onClick={() => void downloadBackup(store).then(() => toast('This device’s data saved to a file'))}
            >
              First, save a backup of this device
            </button>
            <button type="button" className="button is-primary is-block" onClick={apply} disabled={busy}>
              {busy ? 'Restoring…' : 'Restore and replace'}
            </button>
            <button type="button" className="button is-quiet" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
