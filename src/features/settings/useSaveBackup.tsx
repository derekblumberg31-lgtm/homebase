import { useRef, useState, type ReactNode } from 'react';
import { useStore } from '../../data/DataProvider';
import { Confirm, useToast } from '../../ui/overlays';
import { browserDeliverCaps, deliverAndRecord, saveBackup, type BackupResult } from './importing';

export interface SaveBackupOptions {
  /** No toasts; the caller says what happened (the erase and restore confirms do this in the dialog). */
  quiet?: boolean;
  /** Called once with the final result, including after a "Backup ready" second tap. */
  onDone?: (result: BackupResult) => void;
}

const NOTE_FAILED = 'The backup was saved, but Homebase couldn’t note the date.';

export function toastFor(result: BackupResult): { text: string; tone?: 'error' } | null {
  switch (result.outcome) {
    case 'cancelled':
    case 'needs-tap':
      return null;
    case 'failed':
      return { text: 'The backup couldn’t be saved. Try again.', tone: 'error' };
    case 'shared':
      return result.date === 'failed' ? { text: NOTE_FAILED, tone: 'error' } : { text: 'Backup saved' };
    case 'downloaded':
      if (result.date === 'failed') return { text: NOTE_FAILED, tone: 'error' };
      return { text: result.date === 'written' ? 'Backup downloaded. Check your Downloads folder.' : 'Check that the backup reached Files before you rely on it.' };
  }
}

/** Saves a backup by share sheet or download. Call `save` straight from a tap, and render `dialog` for the "Backup ready" retry. */
export function useSaveBackup() {
  const store = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ file: File; options: SaveBackupOptions } | null>(null);
  const running = useRef(false);

  function finish(result: BackupResult, options: SaveBackupOptions) {
    if (!options.quiet) {
      const message = toastFor(result);
      if (message) toast(message.text, message.tone ? { tone: message.tone } : undefined);
    }
    options.onDone?.(result);
  }

  async function save(options: SaveBackupOptions = {}) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const result = await saveBackup(store);
      if (result.outcome === 'needs-tap' && result.file) setPending({ file: result.file, options });
      else finish(result, options);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  async function retry() {
    if (!pending) return;
    const { file, options } = pending;
    setPending(null);
    // The share call is the first thing in this tap, so it has the user activation it needs.
    const result = await deliverAndRecord(store, file, browserDeliverCaps());
    finish(result.outcome === 'needs-tap' ? { outcome: 'failed', date: 'skipped' } : result, options);
  }

  const dialog: ReactNode = pending ? (
    <Confirm
      title="Backup ready"
      message="Choose where to keep it, such as Files or iCloud Drive."
      confirmLabel="Save"
      onConfirm={retry}
      onCancel={() => {
        const { options } = pending;
        setPending(null);
        options.onDone?.({ outcome: 'cancelled', date: 'skipped' });
      }}
    />
  ) : null;

  return { save, busy, dialog };
}
