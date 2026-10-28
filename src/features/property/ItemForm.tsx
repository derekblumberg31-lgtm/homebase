import { useRef, useState } from 'react';
import { useData } from '../../data/DataProvider';
import { uid } from '../../data/ids';
import type { Item, ItemKind } from '../../data/types';
import { isRealDate, toDateInput } from '../../lib/dates';
import { compressPhoto } from '../../lib/images';
import { FormGroup, SelectField, TextArea, TextField } from '../../ui/controls';
import { Section } from '../../ui/layout';
import { Sheet, useToast } from '../../ui/overlays';
import { ITEM_KIND_LABEL } from './labels';

const MAX_PHOTOS = 6;

/** Add or edit a belonging: what it is, where it is, the numbers you'll need later, and photos. */
export function ItemForm({ item, draft, onClose, onSave }: { item?: Item; draft?: { roomId?: string }; onClose: () => void; onSave: (item: Item) => void }) {
  const { rooms } = useData();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Exclude<ItemKind, 'key'>>((item?.kind as Exclude<ItemKind, 'key'>) ?? 'appliance');
  const [name, setName] = useState(item?.name ?? '');
  const [brand, setBrand] = useState(item?.brand ?? '');
  const [model, setModel] = useState(item?.model ?? '');
  const [serial, setSerial] = useState(item?.serial ?? '');
  const [value, setValue] = useState(item?.value != null ? String(item.value) : '');
  const [purchaseDate, setPurchaseDate] = useState(item?.purchaseDate ?? '');
  const [roomId, setRoomId] = useState(item?.roomId ?? draft?.roomId ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [photos, setPhotos] = useState<string[]>(item?.photos ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    try {
      const next = await Promise.all([...files].slice(0, room).map((f) => compressPhoto(f)));
      setPhotos((p) => [...p, ...next]);
      if (files.length > room) toast(`Up to ${MAX_PHOTOS} photos per item.`);
    } catch {
      toast('That photo couldn’t be read. Try a JPEG or PNG.', { tone: 'error' });
    }
  }

  function save() {
    const next: Record<string, string> = {};
    const price = value.trim() ? Number(value) : undefined;
    if (!name.trim()) next.name = 'Give it a name.';
    if (price !== undefined && !(price >= 0)) next.value = 'Use a positive amount.';
    if (purchaseDate && !isRealDate(purchaseDate)) next.purchaseDate = 'Pick a real date.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const now = new Date().toISOString();
    onSave({
      id: item?.id ?? uid(),
      kind,
      name: name.trim(),
      brand: brand.trim() || undefined,
      model: model.trim() || undefined,
      serial: serial.trim() || undefined,
      value: price,
      purchaseDate: purchaseDate || undefined,
      roomId: roomId || undefined,
      notes: notes.trim() || undefined,
      photos,
      createdAt: item?.createdAt ?? now,
      updatedAt: now,
    });
  }

  return (
    <Sheet
      title={item ? 'Edit item' : 'Add an item'}
      onClose={onClose}
      leading={<button type="button" className="sheet-action" onClick={onClose}>Cancel</button>}
      trailing={<button type="button" className="sheet-action is-strong" onClick={save}>Save</button>}
    >
      <FormGroup>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dishwasher" error={errors.name} autoFocus />
        <SelectField label="Kind" value={kind} onChange={(e) => setKind(e.target.value as Exclude<ItemKind, 'key'>)}>
          {(Object.keys(ITEM_KIND_LABEL) as (keyof typeof ITEM_KIND_LABEL)[]).map((k) => (
            <option key={k} value={k}>
              {ITEM_KIND_LABEL[k]}
            </option>
          ))}
        </SelectField>
        {rooms.length > 0 && (
          <SelectField label="Room" optional value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">Not in a room</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </SelectField>
        )}
      </FormGroup>

      <Section title="Details" foot="Model and serial numbers are usually on a sticker inside the door or on the back.">
        <FormGroup>
          <TextField label="Brand" optional value={brand} onChange={(e) => setBrand(e.target.value)} />
          <TextField label="Model number" optional value={model} onChange={(e) => setModel(e.target.value)} />
          <TextField label="Serial number" optional value={serial} onChange={(e) => setSerial(e.target.value)} />
          <TextField label="Purchase date" optional type="date" max={toDateInput()} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} error={errors.purchaseDate} />
          <TextField label="Value" optional inputMode="decimal" prefix="$" value={value} onChange={(e) => setValue(e.target.value)} error={errors.value} />
          <TextArea label="Notes" optional value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormGroup>
      </Section>

      <Section title="Photos" aside={`${photos.length} of ${MAX_PHOTOS}`}>
        {photos.length > 0 && (
          <div className="photo-grid">
            {photos.map((src, i) => (
              <button key={i} type="button" className="photo-thumb" onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} aria-label={`Remove photo ${i + 1}`}>
                <img src={src} alt="" />
              </button>
            ))}
          </div>
        )}
        {photos.length < MAX_PHOTOS && (
          <div className="button-stack">
            <button type="button" className="button is-secondary is-block" onClick={() => fileInput.current?.click()}>
              Add photos
            </button>
          </div>
        )}
        {photos.length > 0 && <p className="section-foot">Tap a photo to remove it.</p>}
        <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { void addPhotos(e.target.files); e.target.value = ''; }} />
      </Section>
    </Sheet>
  );
}
