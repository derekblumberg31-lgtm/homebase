import { Component, useRef, useState, type ReactNode } from 'react';
import { createDatabase } from '../data/db';
import { HomeStore } from '../data/store';
import { downloadBackup, prepareRestore, type RestoreSummary } from '../features/settings/importing';

/** Opens the data on its own, because the crash may have taken the app's providers with it. */
async function openStore() {
  const store = new HomeStore(await createDatabase());
  await store.load();
  return store;
}

const reopen = () => location.assign(import.meta.env.BASE_URL);

/**
 * Shown when a screen crashes. A crash can come from saved data, in which case it would repeat on
 * every launch, so this keeps the way out in reach: save what's there, or restore a good backup.
 */
function CrashScreen() {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<RestoreSummary | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(work: () => Promise<void>, fallback: string) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await work();
    } catch (error) {
      setMessage(error instanceof Error && error.message ? error.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  const saveBackup = () =>
    run(async () => {
      const recorded = await downloadBackup(await openStore());
      setMessage(recorded ? 'Backup downloaded.' : 'Check that the backup reached Files before you rely on it.');
    }, 'The backup couldn’t be saved.');

  const pick = (file: File) =>
    run(async () => {
      setPending(await prepareRestore(await openStore(), file));
    }, 'Couldn’t read that file.');

  const restore = () =>
    run(async () => {
      await pending?.apply();
      reopen();
    }, 'That didn’t finish. Nothing was changed; try the file again.');

  return (
    <div className="onboarding">
      <div className="onboarding-card" role="alert">
        <h1>Something went wrong</h1>
        <p className="lead">Your home’s information is still saved on this device. Try reopening Homebase. If this keeps happening, save a backup so nothing is lost.</p>
        {pending && <p className="lead">{pending.text}</p>}
        {message && <p className="lead" role="status">{message}</p>}
        <div className="button-stack">
          {pending ? (
            <>
              <button type="button" className="button is-primary is-block" onClick={restore} disabled={busy}>
                Restore this backup
              </button>
              <button type="button" className="button is-block" onClick={() => setPending(null)} disabled={busy}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" className="button is-primary is-block" onClick={reopen}>
                Reopen Homebase
              </button>
              <button type="button" className="button is-block" onClick={saveBackup} disabled={busy}>
                Save a backup
              </button>
              <button type="button" className="button is-block" onClick={() => input.current?.click()} disabled={busy}>
                Restore from a backup
              </button>
            </>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void pick(file);
          }}
        />
      </div>
    </div>
  );
}

/** Catches anything a screen throws while rendering, so a bug never leaves a blank page. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <CrashScreen /> : this.props.children;
  }
}
