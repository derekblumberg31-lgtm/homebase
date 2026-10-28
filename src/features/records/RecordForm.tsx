import { useRef, useState } from 'react';
import { useData, useStore } from '../../data/DataProvider';
import { uid } from '../../data/ids';
import type { HomeRecord, RecordKind } from '../../data/types';
import { isRealDate } from '../../lib/dates';
import { formatBytes } from '../../lib/images';
import { FormGroup, SelectField, TextArea, TextField } from '../../ui/controls';
import { Group, Row, Section } from '../../ui/layout';
import { Sheet, useToast } from '../../ui/overlays';
import { EXPIRING_KINDS, RECORD_KIND_LABEL } from './labels';

const MAX_FILE = 15 * 1024 * 1024;

/** Add or edit a record: warranty, receipt, manual, permit… with an end date and files. */
export function RecordForm({ record, draft, onClose, onSaved }: { record?: HomeRecord; draft?: { kind?: RecordKind; itemId?: string }; onClose: () => void; onSaved: (r: HomeRecord) => void }) {
  const { items } = useData();
  const store = useStore();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<RecordKind>(record?.kind ?? draft?.kind ?? 'warranty');
  const [title, setTitle] = useState(record?.title ?? '');
  const [date, setDate] = useState(record?.date ?? '');
  const [expiresAt, setExpiresAt] = useState(record?.expiresAt ?? '');
  const [amount, setAmount] = useState(record?.amount != null ? String(record.amount) : '');
  const [vendor, setVendor] = useState(record?.vendor ?? '');
  const [itemId, setItemId] = useState(record?.itemId ?? draft?.itemId ?? '');
  const [notes, setNotes] = useState(record?.notes ?? '');
  const [files, setFiles] = useState<{ id: string; name: string; size: number }[]>([]);
  const [existing, setExisting] = useState<string[]>(record?.fileIds ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const belongings = items.filter((i) => i.kind !== 'key');

  async function attach(list: FileList | null) {
    if (!list) return;
    for (const file of [...list]) {
      if (file.size > MAX_FILE) {
        toast(`${file.name} is over 15 MB. Try a smaller scan or photo.`, { tone: 'error' });
        continue;
      }
      try {
        const stored = await store.saveFile(file);
        setFiles((f) => [...f, { id: stored.id, name: stored.name, size: stored.size }]);
      } catch {
        toast(`${file.name} couldn’t be saved. The device may be out of space.`, { tone: 'error' });
      }
    }
  }

  async function save() {
    const next: Record<string, string> = {};
    const price = amount.trim() ? Number(amount) : undefined;
    if (!title.trim()) next.title = 'Give it a name, like Dishwasher warranty.';
    if (date && !isRealDate(date)) next.date = 'Pick a real date.';
    if (expiresAt && !isRealDate(expiresAt)) next.expiresAt = 'Pick a real date.';
    if (price !== undefined && !(price >= 0)) next.amount = 'Use a positive amount.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    const now = new Date().toISOString();
    const row: HomeRecord = {
      id: record?.id ?? uid(),
      kind,
      title: title.trim(),
      date: date || undefined,
      expiresAt: expiresAt || undefined,
      amount: price,
      vendor: vendor.trim() || undefined,
      itemId: itemId || undefined,
      notes: notes.trim() || undefined,
      fileIds: [...existing, ...files.map((f) => f.id)],
      createdAt: record?.createdAt ?? now,
      updatedAt: now,
    };
    for (const removed of (record?.fileIds ?? []).filter((id) => !existing.includes(id))) await store.removeFile(removed);
    await store.put('records', row);
    if (!record) await store.log('record-added', `Added ${RECORD_KIND_LABEL[kind].toLowerCase()}: ${row.title}`, `/records/${row.id}`);
    setSaving(false);
    onSaved(row);
  }

  async function cancel() {
    // Files picked for a record that was never saved shouldn't linger.
    for (const f of files) await store.removeFile(f.id);
    onClose();
  }

  return (
    <Sheet
      title={record ? 'Edit record' : 'Add a record'}
      onClose={cancel}
      leading={<button type="button" className="sheet-action" onClick={cancel}>Cancel</button>}
      trailing={<button type="button" className="sheet-action is-strong" onClick={save} disabled={saving}>Save</button>}
    >
      <FormGroup>
        <SelectField label="Kind" value={kind} onChange={(e) => setKind(e.target.value as RecordKind)}>
          {(Object.keys(RECORD_KIND_LABEL) as RecordKind[]).map((k) => (
            <option key={k} value={k}>
              {RECORD_KIND_LABEL[k]}
            </option>
          ))}
        </SelectField>
        <TextField label="Name" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'warranty' ? 'Dishwasher warranty' : 'Furnace service invoice'} error={errors.title} />
        {belongings.length > 0 && (
          <SelectField label="For an item" optional value={itemId} onChange={(e) => setItemId(e.target.value)}>
            <option value="">None</option>
            {belongings.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </SelectField>
        )}
      </FormGroup>

      <Section title="Details">
        <FormGroup>
          <TextField label={kind === 'warranty' ? 'Starts' : 'Date'} optional type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
          {(EXPIRING_KINDS.includes(kind) || expiresAt) && (
            <TextField label="Ends" optional type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} error={errors.expiresAt} hint="Home reminds you 60 days before." />
          )}
          <TextField label="From" optional value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Store, company or contractor" />
          <TextField label="Amount" optional inputMode="decimal" prefix="$" value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amount} />
          <TextArea label="Notes" optional value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Claim phone number, policy number" />
        </FormGroup>
      </Section>

      <Section title="Files" foot="Photos and PDFs are stored on this device and included in backups.">
        {(existing.length > 0 || files.length > 0) && (
          <Group>
            {existing.map((id, i) => (
              <Row key={id} title={`Attached file ${i + 1}`} value="Remove" onClick={() => setExisting((e) => e.filter((x) => x !== id))} />
            ))}
            {files.map((f) => (
              <Row
                key={f.id}
                title={f.name}
                sub={formatBytes(f.size)}
                value="Remove"
                onClick={async () => {
                  await store.removeFile(f.id);
                  setFiles((list) => list.filter((x) => x.id !== f.id));
                }}
              />
            ))}
          </Group>
        )}
        <div className="button-stack">
          <button type="button" className="button is-secondary is-block" onClick={() => fileInput.current?.click()}>
            Attach a photo or PDF
          </button>
        </div>
        <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { void attach(e.target.files); e.target.value = ''; }} />
      </Section>
    </Sheet>
  );
}
