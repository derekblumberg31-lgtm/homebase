import { useRef, useState } from 'react';
import { useStore } from '../../data/DataProvider';
import { Confirm, useToast } from '../../ui/overlays';
import { prepareImport, type ImportSummary } from './importing';

/** Pick a backup file, see what it will do, then confirm. Used in onboarding and Settings. */
export function ImportButton({ label = 'Bring in a backup file', className = 'row is-action', onDone }: { label?: string; className?: string; onDone?: () => void }) {
  const store = useStore();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      setPending(await prepareImport(store, file));
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Couldn’t read that file.', { tone: 'error' });
    }
  }

  async function apply() {
    if (!pending) return;
    setBusy(true);
    try {
      await pending.apply();
      toast(pending.replaces ? 'Backup restored' : `Brought in from ${pending.source}`);
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
          <span className="row-title">{busy ? 'Bringing it in…' : label}</span>
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
          title={pending.replaces ? 'Restore this backup?' : `Bring in from ${pending.source}?`}
          message={pending.text}
          confirmLabel={pending.replaces ? 'Restore' : 'Bring in'}
          destructive={pending.replaces}
          onConfirm={apply}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
