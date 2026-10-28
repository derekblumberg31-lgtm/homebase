import { useState } from 'react';
import type { Task } from '../../data/types';
import { isRealDate, toDateInput } from '../../lib/dates';
import { FormGroup, TextArea, TextField } from '../../ui/controls';
import { Sheet } from '../../ui/overlays';
import type { CompletionInput } from './actions';

/** Confirm a completion with its date, who did it and a note; it's kept in Service History. */
export function CompleteSheet({ task, onClose, onConfirm }: { task: Task; onClose: () => void; onConfirm: (input: CompletionInput) => void }) {
  const [date, setDate] = useState(toDateInput());
  const [provider, setProvider] = useState('');
  const [cost, setCost] = useState(task.cost != null ? String(task.cost) : '');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  function confirm() {
    if (!isRealDate(date) || date > toDateInput()) {
      setError('Pick today or a day in the past.');
      return;
    }
    const price = cost.trim() ? Number(cost) : undefined;
    onConfirm({ date, provider: provider.trim() || undefined, notes, cost: price !== undefined && price >= 0 ? price : undefined });
  }

  return (
    <Sheet
      title="Mark done"
      onClose={onClose}
      leading={
        <button type="button" className="sheet-action" onClick={onClose}>
          Cancel
        </button>
      }
      trailing={
        <button type="button" className="sheet-action is-strong" onClick={confirm}>
          Done
        </button>
      }
    >
      <p className="muted">{task.recurring ? 'The countdown starts again from this date.' : 'This closes the task and keeps it in Service History.'}</p>
      <div className="section">
        <FormGroup>
          <TextField label="Done on" type="date" value={date} max={toDateInput()} onChange={(e) => setDate(e.target.value)} error={error} />
          <TextField label="Done by" optional value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Me, or a company" />
          <TextField label="Cost" optional inputMode="decimal" prefix="$" value={cost} onChange={(e) => setCost(e.target.value)} />
          <TextArea label="Note" optional value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Part used, anything to remember" />
        </FormGroup>
      </div>
    </Sheet>
  );
}
