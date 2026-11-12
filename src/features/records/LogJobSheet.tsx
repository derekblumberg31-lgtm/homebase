import { useState } from 'react';
import { useData, useStore } from '../../data/DataProvider';
import type { ServiceEvent } from '../../data/types';
import { toDateInput } from '../../lib/dates';
import { FormGroup, SelectField, TextArea, TextField } from '../../ui/controls';
import { Sheet } from '../../ui/overlays';
import { SaveFailed, useSave } from '../../ui/save';
import { buildLoggedEvent, logJob, type LogJobErrors } from './serviceLog';

export function LogJobSheet({ itemId = '', onClose, onLogged }: { itemId?: string; onClose: () => void; onLogged: (event: ServiceEvent, undo: () => Promise<void>) => void }) {
  const store = useStore();
  const { items } = useData();
  const save = useSave();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(toDateInput());
  const [item, setItem] = useState(items.some((i) => i.id === itemId) ? itemId : '');
  const [provider, setProvider] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<LogJobErrors>({});

  async function submit() {
    const result = buildLoggedEvent({ title, date, cost, provider, notes, itemId: item }, toDateInput(), new Date().toISOString());
    if ('errors' in result) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    let undo: (() => Promise<void>) | undefined;
    const ok = await save.run(async () => {
      undo = (await logJob(store, result.event)).undo;
    });
    if (ok && undo) onLogged(result.event, undo);
  }

  return (
    <Sheet
      title="Log something done"
      onClose={onClose}
      leading={
        <button type="button" className="sheet-action" onClick={onClose}>
          Cancel
        </button>
      }
      trailing={
        <button type="button" className="sheet-action is-strong" onClick={() => void submit()} aria-disabled={save.saving || undefined} aria-busy={save.saving || undefined}>
          Save
        </button>
      }
    >
      <SaveFailed show={save.failed} />
      <p className="muted">For a job that had no task. It’s kept in Service history.</p>
      <div className="section">
        <FormGroup>
          <TextField label="What was done" data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fixed the kitchen tap…" error={errors.title} />
          <TextField label="Done on" type="date" value={date} max={toDateInput()} onChange={(e) => setDate(e.target.value)} error={errors.date} />
          {items.length > 0 && (
            <SelectField label="Item" optional value={item} onChange={(e) => setItem(e.target.value)}>
              <option value="">None</option>
              {[...items]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
            </SelectField>
          )}
          <TextField label="Done by" optional value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Me, or a company…" autoComplete="off" />
          <TextField label="Cost" optional inputMode="decimal" prefix="$" value={cost} onChange={(e) => setCost(e.target.value)} error={errors.cost} />
          <TextArea label="Note" optional value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Part used, anything to remember…" />
        </FormGroup>
      </div>
    </Sheet>
  );
}
