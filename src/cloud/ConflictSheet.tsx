import { useRef, useState } from 'react';
import { plural } from '../lib/plural';
import { Group, Row } from '../ui/layout';
import { Sheet } from '../ui/overlays';
import { fromDevice } from './copy';
import type { RemoteHead } from './decide';
import type { ConflictInfo, Counts } from './syncEngine';

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const countsText = (c: Counts) => `${plural(c.tasks, 'task')}, ${plural(c.systems, 'system')}, ${plural(c.records, 'record')}, ${plural(c.files, 'file')}.`;

export function conflictLead(conflict: ConflictInfo): string {
  const from = fromDevice(conflict.remote.deviceLabel);
  const stamp = when(conflict.remote.updatedAt);
  const tail = 'Homebase can’t combine them yet, so pick one. The other one is saved as a backup file first, so nothing is lost.';
  return conflict.reason === 'first-link'
    ? `Your account already has a home saved from ${from} (${stamp}), and this device has its own. ${tail}`
    : `Your home changed on this device and on ${from} (${stamp}) since they last synced. ${tail}`;
}

/** Two copies, one choice. Nothing is replaced until a row is tapped, and the copy being replaced is saved as a file first. */
export function ConflictSheet({ conflict, onChoose, onClose }: { conflict: ConflictInfo; onChoose: (choice: 'local' | 'cloud') => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  async function choose(choice: 'local' | 'cloud') {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await onChoose(choice);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <Sheet
      title="Choose which copy to keep"
      onClose={onClose}
      footer={
        <button type="button" className="button is-quiet is-block" onClick={onClose} disabled={busy}>
          Decide later
        </button>
      }
    >
      <p className="sheet-lead">{conflictLead(conflict)}</p>
      <div className="form-gap">
        <Group>
          <Row
            title="Keep this device’s copy"
            sub={`${countsText(conflict.localCounts)} The cloud copy is saved as a backup file, then replaced.`}
            onClick={() => void choose('local')}
            chevron
            wrap
          />
          <Row
            title="Use the cloud copy"
            sub={`${countsText(conflict.remoteCounts)} This device’s copy is saved as a backup file, then replaced.`}
            onClick={() => void choose('cloud')}
            chevron
            wrap
          />
        </Group>
      </div>
      {busy && (
        <p className="section-foot" role="status">
          Saving the backup file…
        </p>
      )}
    </Sheet>
  );
}

/** The two smaller questions: bring the account's home to an empty device, or save this device's home again after a reset. */
export function DecisionSheet({ kind, remote, onConfirm, onClose }: { kind: 'bring' | 'reset'; remote?: RemoteHead; onConfirm: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const bring = kind === 'bring';
  const text = bring
    ? `Your account has a home saved from ${fromDevice(remote?.deviceLabel ?? '')} on ${remote ? day(remote.updatedAt) : 'an earlier day'}. Bring it to this device?`
    : 'Your cloud copy was deleted or reset from another device. Save this device’s home to your account again?';
  return (
    <Sheet title={bring ? 'Your account has a home' : 'Your cloud copy is gone'} onClose={onClose}>
      <p className="sheet-lead">{text}</p>
      <div className="button-stack">
        <button
          type="button"
          className="button is-primary is-block"
          aria-disabled={busy || undefined}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            try {
              await onConfirm();
            } finally {
              setBusy(false);
            }
          }}
        >
          {bring ? 'Bring it here' : 'Save it'}
        </button>
        <button type="button" className="button is-quiet is-block" onClick={onClose}>
          Not now
        </button>
      </div>
    </Sheet>
  );
}
