import { useRef, useState } from 'react';
import { useStore } from '../../data/DataProvider';
import { Confirm, useToast } from '../../ui/overlays';
import { prepareRestore, type RestoreSummary } from './importing';

/** Pick a Homebase backup, see what restoring it will do, then confirm. */
export function ImportButton({ label = 'Restore from a backup', className = 'row is-action', onDone }: { label?: string; className?: string; onDone?: () => void }) {
  const store = useStore();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<RestoreSummary | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      setPending(await prepareRestore(store, file));
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Couldn’t read that file.', { tone: 'error' });
    }
  }

  async function apply() {
    if (!pending) return;
    setBusy(true);
    try {
      await pending.apply();
      toast('Backup restored');
      onDone?.();
    } catch {
      toast('That didn’t finish. Nothing was changed; try the file again.', { tone: 'error' });
    } finally {
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
        <Confirm
          title="Restore this backup?"
          message={pending.text}
          confirmLabel="Restore"
          destructive
          onConfirm={apply}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
