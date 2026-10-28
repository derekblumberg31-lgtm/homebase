import { useState } from 'react';
import type { KeyIdSource } from '../../../data/types';
import { KEY_TYPES } from '../../../engine/keys/engine';
import type { KeywayRow } from '../../../engine/keys/keyInfo';
import { FormGroup, SelectField, Switch, TextArea, TextField } from '../../../ui/controls';
import { Section } from '../../../ui/layout';
import { Sheet } from '../../../ui/overlays';

export interface KeyDetailsValue {
  name?: string;
  notes?: string;
  brand?: string;
  keyway?: string;
  type?: string;
  blank?: string;
  dnd?: boolean;
  transponder?: boolean;
  idSource?: KeyIdSource;
}

/** Edit a key's name, what it opens, and its brand/keyway. Picking a known keyway fills the rest. */
export function KeyDetailsSheet({ title, value, rows, withName = true, onClose, onSave }: { title: string; value: KeyDetailsValue; rows: KeywayRow[] | null; withName?: boolean; onClose: () => void; onSave: (v: KeyDetailsValue) => void }) {
  const [name, setName] = useState(value.name ?? '');
  const [notes, setNotes] = useState(value.notes ?? '');
  const [brand, setBrand] = useState(value.brand ?? '');
  const [keyway, setKeyway] = useState(value.keyway ?? '');
  const [type, setType] = useState(value.type ?? '');
  const [blank, setBlank] = useState(value.blank ?? '');
  const [dnd, setDnd] = useState(Boolean(value.dnd));
  const [transponder, setTransponder] = useState(Boolean(value.transponder));
  const [error, setError] = useState('');

  function pickKeyway(next: string) {
    setKeyway(next);
    const entry = rows?.find((r) => r.keyway && r.keyway.toUpperCase() === next.trim().toUpperCase());
    if (entry) {
      setBrand(entry.brand);
      setType(entry.type);
      setBlank(entry.blank ?? '');
      if (entry.transponderLikely) setTransponder(true);
    }
  }

  function save() {
    if (withName && !name.trim()) return setError('Give the key a name, like Front door.');
    onSave({ name: name.trim(), notes: notes.trim() || undefined, brand: brand.trim() || undefined, keyway: keyway.trim() || undefined, type: type || undefined, blank: blank.trim() || undefined, dnd, transponder, idSource: 'user' });
  }

  return (
    <Sheet
      title={title}
      onClose={onClose}
      leading={<button type="button" className="sheet-action" onClick={onClose}>Cancel</button>}
      trailing={<button type="button" className="sheet-action is-strong" onClick={save}>Save</button>}
    >
      {withName && (
        <FormGroup>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Front door" error={error} autoFocus />
          <TextArea label="What it opens" optional value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Front door and side gate; spare is with Sam" />
        </FormGroup>
      )}
      <Section title="Replacement key" foot="Saving marks these details as confirmed by you, and future suggestions learn from them.">
        <FormGroup>
          <TextField label="Keyway" optional value={keyway} onChange={(e) => pickKeyway(e.target.value)} list="homebase-keyways" placeholder="KW1" autoComplete="off" />
          <TextField label="Brand" optional value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Kwikset" />
          <SelectField label="Type" optional value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Unknown</option>
            {KEY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t[0].toUpperCase() + t.slice(1)}
              </option>
            ))}
          </SelectField>
          <TextField label="Blank number" optional value={blank} onChange={(e) => setBlank(e.target.value)} autoComplete="off" />
        </FormGroup>
        <datalist id="homebase-keyways">{rows?.filter((r) => r.keyway).map((r) => <option key={r.keyway} value={r.keyway}>{r.brand}</option>)}</datalist>
      </Section>
      <Section>
        <div className="group">
          <div className="row">
            <span className="row-main"><span className="row-title">Stamped “Do not duplicate”</span></span>
            <Switch checked={dnd} onChange={setDnd} label="Stamped do not duplicate" />
          </div>
          <div className="row">
            <span className="row-main"><span className="row-title">Car key with a chip or fob</span></span>
            <Switch checked={transponder} onChange={setTransponder} label="Car key with a chip or fob" />
          </div>
        </div>
      </Section>
    </Sheet>
  );
}
