import { useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useData, useNow, useStore } from '../../data/DataProvider';
import { uid } from '../../data/ids';
import type { HomeSystem, SystemKind } from '../../data/types';
import { formatCurrency, formatDate, isRealDate, toDateInput } from '../../lib/dates';
import { compressPhoto } from '../../lib/images';
import { FormGroup, SelectField, TextArea, TextField } from '../../ui/controls';
import { EmptyState, Group, Page, Row, Section } from '../../ui/layout';
import { Confirm, Sheet, useToast } from '../../ui/overlays';
import { RECORD_KIND_LABEL } from '../records/labels';
import { TaskRow } from '../tasks/components';
import { withInfo } from '../tasks/taskMath';
import { useTaskActions } from '../tasks/useTaskActions';
import { SYSTEM_LABEL, SYSTEM_LIFESPAN } from './labels';
import { LabelScanButton } from './LabelScan';

const MAX_PHOTOS = 6;

export function systemAge(system: HomeSystem, now = Date.now()): number | undefined {
  const year = system.installYear ?? (system.installDate ? Number(system.installDate.slice(0, 4)) : undefined);
  return year ? new Date(now).getFullYear() - year : undefined;
}

function ageText(system: HomeSystem): string | undefined {
  const age = systemAge(system);
  if (age === undefined) return undefined;
  return age <= 0 ? 'Installed this year' : `${age} ${age === 1 ? 'year' : 'years'} old`;
}

/** The big systems that keep the home running, with their age for lifespan reminders. */
export function SystemsPage() {
  const { systems } = useData();
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const newKind = params.get('new') as SystemKind | null;
  const [adding, setAdding] = useState<SystemKind | null>(newKind && newKind in SYSTEM_LABEL ? newKind : null);

  function close() {
    setAdding(null);
    if (newKind) setParams({}, { replace: true });
  }

  return (
    <Page
      title="Home Systems"
      subtitle="Heating, cooling, water heater and more. Install dates let Homebase warn you before things wear out."
      back={{ to: '/property', label: 'Property' }}
      actions={<button type="button" className="button is-quiet" onClick={() => setAdding('water-heater')}>Add system</button>}
    >
      <Section>
        {systems.length === 0 ? (
          <EmptyState
            title="No systems yet"
            body="Start with the water heater, heating and cooling. The brand, model and install date are usually on a sticker on the unit."
            action={{ label: 'Add the water heater', onClick: () => setAdding('water-heater') }}
            secondary={{ label: 'Add heating or cooling', onClick: () => setAdding('heating') }}
          />
        ) : (
          <Group>
            {systems.map((system) => (
              <Row key={system.id} title={system.name} sub={[SYSTEM_LABEL[system.kind].toLowerCase() === system.name.trim().toLowerCase() ? null : SYSTEM_LABEL[system.kind], system.brand, ageText(system)].filter(Boolean).join(' · ')} to={`/property/systems/${system.id}`} />
            ))}
          </Group>
        )}
      </Section>

      {adding && (
        <SystemSheet
          draftKind={adding}
          onClose={close}
          onSave={async (system) => {
            await store.put('systems', system);
            await store.log('item-added', `Added ${system.name}`, `/property/systems/${system.id}`);
            close();
            toast(`${system.name} saved`, { action: { label: 'Open', run: () => navigate(`/property/systems/${system.id}`) } });
          }}
        />
      )}
    </Page>
  );
}

/** One system: everything about it, its paperwork, upkeep and who services it. */
export function SystemPage() {
  const { systemId } = useParams();
  const data = useData();
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const now = useNow();
  const { complete } = useTaskActions();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const system = data.systems.find((s) => s.id === systemId);
  const back = { to: '/property/systems', label: 'Home Systems' };

  if (!system) {
    return (
      <Page title="System" back={back}>
        <div className="section">
          <EmptyState primary title="This system isn’t here" body="It may have been removed." action={{ label: 'Back to Home Systems', to: '/property/systems' }} />
        </div>
      </Page>
    );
  }

  const today = toDateInput();
  const room = data.rooms.find((r) => r.id === system.roomId);
  const contractor = data.records.find((r) => r.id === system.contractorId);
  const records = data.records.filter((r) => r.systemId === system.id);
  const tasks = withInfo(data.tasks.filter((t) => t.systemId === system.id && t.status === 'open'), now);
  const history = data.serviceEvents.filter((e) => e.systemId === system.id).sort((a, b) => b.date.localeCompare(a.date));
  const age = systemAge(system, now);
  const life = SYSTEM_LIFESPAN[system.kind];
  const where = room?.name ?? system.location;

  return (
    <Page
      title={system.name}
      subtitle={[SYSTEM_LABEL[system.kind].toLowerCase() === system.name.trim().toLowerCase() ? null : SYSTEM_LABEL[system.kind], where].filter(Boolean).join(' · ') || undefined}
      back={back}
      actions={<button type="button" className="button is-quiet" onClick={() => setEditing(true)}>Edit</button>}
    >
      {age !== undefined && life && age >= life && (
        <div className="section">
          <p className="callout is-warn">
            <b>{age} years old.</b> These usually last about {life} years. Get it inspected and start budgeting for a replacement before it fails.
          </p>
        </div>
      )}

      {system.photos && system.photos.length > 0 && (
        <Section>
          <div className="photo-grid">
            {system.photos.map((src, i) => (
              <img key={i} src={src} alt={`${system.name}, photo ${i + 1}`} />
            ))}
          </div>
        </Section>
      )}

      <Section title="Details">
        <Group>
          <Row title="Brand" value={system.brand ?? 'Not added'} />
          <Row title="Model number" value={system.model ?? 'Not added'} />
          <Row title="Serial number" value={system.serial ?? 'Not added'} />
          <Row title="Location" value={where ?? 'Not added'} to={room ? `/property/rooms/${room.id}` : undefined} />
          <Row title="Installed" value={system.installDate ? formatDate(system.installDate) : system.installYear ? String(system.installYear) : 'Not added'} />
          {age !== undefined && <Row title="Age" value={`${Math.max(0, age)} ${age === 1 ? 'year' : 'years'}${life ? ` of about ${life}` : ''}`} />}
          <Row
            title="Warranty"
            value={system.warrantyExpires ? `${system.warrantyExpires < today ? 'Ended' : 'Ends'} ${formatDate(system.warrantyExpires)}` : 'Not added'}
          />
          <Row title="Contractor" value={contractor ? contractor.title : 'Not added'} to={contractor ? `/records/${contractor.id}` : undefined} />
        </Group>
        {(!system.brand || !system.model || !system.serial) && (
          <p className="section-foot">The brand, model and serial number are on the rating label. A photo of it is enough; add one with Edit.</p>
        )}
      </Section>

      {system.notes && (
        <Section title="Notes">
          <div className="group note-card">{system.notes}</div>
        </Section>
      )}

      <Section title="Manuals, receipts and warranty" aside={<Link to={`/records?new=manual&systemId=${system.id}`}>Add</Link>}>
        {records.length === 0 ? (
          <div className="group">
            <EmptyState
              inline
              title="No paperwork yet"
              body="Save the manual, the install receipt and the warranty here. The Assistant finds them when something breaks."
              action={{ label: 'Upload a manual or warranty', to: `/records?new=manual&systemId=${system.id}` }}
            />
          </div>
        ) : (
          <Group>
            {records.map((r) => (
              <Row key={r.id} title={r.title} sub={[RECORD_KIND_LABEL[r.kind], r.expiresAt ? `${r.expiresAt < today ? 'Ended' : 'Ends'} ${formatDate(r.expiresAt)}` : null].filter(Boolean).join(' · ')} to={`/records/${r.id}`} />
            ))}
          </Group>
        )}
      </Section>

      <Section
        title="Upkeep and service history"
        aside={<Link to={`/tasks?new=1&systemId=${system.id}&name=${encodeURIComponent(`Service the ${system.name.toLowerCase()}`)}`}>Add task</Link>}
      >
        {tasks.length === 0 && history.length === 0 ? (
          <div className="group">
            <EmptyState inline title="No upkeep tracked" body="Add a yearly service or filter change. Each time you mark it done, it’s kept here." />
          </div>
        ) : (
          <Group>
            {tasks.map(({ task, info }) => (
              <TaskRow key={task.id} task={task} info={info} now={now} onDone={() => complete(task)} />
            ))}
            {history.slice(0, 8).map((e) => (
              <Row key={e.id} title={e.title} sub={[`Done ${formatDate(e.date)}`, e.provider, e.notes].filter(Boolean).join(' · ')} value={e.cost != null ? formatCurrency(e.cost) : undefined} wrap />
            ))}
          </Group>
        )}
      </Section>

      <div className="button-stack">
        <Link className="button is-secondary is-block" to={`/assistant?q=${encodeURIComponent(`Problem with my ${system.name.toLowerCase()}`)}`}>
          Ask about a problem with it
        </Link>
        <button type="button" className="button is-danger-quiet" onClick={() => setDeleting(true)}>
          Remove system
        </button>
      </div>

      {editing && (
        <SystemSheet
          system={system}
          onClose={() => setEditing(false)}
          onSave={async (next) => {
            await store.put('systems', next);
            setEditing(false);
            toast('Saved');
          }}
        />
      )}
      {deleting && (
        <Confirm
          title={`Remove ${system.name}?`}
          message="Its paperwork and service history stay in Records."
          confirmLabel="Remove"
          destructive
          onCancel={() => setDeleting(false)}
          onConfirm={async () => {
            await store.remove('systems', system.id);
            navigate('/property/systems', { replace: true });
            toast(`${system.name} removed`, { action: { label: 'Undo', run: () => void store.put('systems', system) } });
          }}
        />
      )}
    </Page>
  );
}

const KIND_HINT: Partial<Record<SystemKind, string>> = {
  'water-heater': 'Look for the label on the side of the tank.',
  heating: 'The label is usually inside the furnace door.',
  cooling: 'The label is on the side of the outdoor unit.',
  electrical: 'The panel door often lists the brand and amperage.',
};

/** Add or edit a home system with everything a technician or a warranty claim asks for. */
export function SystemSheet({ system, draftKind, onClose, onSave }: { system?: HomeSystem; draftKind?: SystemKind; onClose: () => void; onSave: (s: HomeSystem) => void }) {
  const { rooms, records } = useData();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<SystemKind>(system?.kind ?? draftKind ?? 'water-heater');
  const [name, setName] = useState(system?.name ?? '');
  const [brand, setBrand] = useState(system?.brand ?? '');
  const [model, setModel] = useState(system?.model ?? '');
  const [serial, setSerial] = useState(system?.serial ?? '');
  const [installYear, setInstallYear] = useState(system?.installYear ? String(system.installYear) : '');
  const [installDate, setInstallDate] = useState(system?.installDate ?? '');
  const [warrantyExpires, setWarrantyExpires] = useState(system?.warrantyExpires ?? '');
  const [roomId, setRoomId] = useState(system?.roomId ?? '');
  const [location, setLocation] = useState(system?.location ?? '');
  const [contractorId, setContractorId] = useState(system?.contractorId ?? '');
  const [notes, setNotes] = useState(system?.notes ?? '');
  const [photos, setPhotos] = useState<string[]>(system?.photos ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const life = SYSTEM_LIFESPAN[kind];
  const contractors = records.filter((r) => r.kind === 'contractor');

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    try {
      const next = await Promise.all([...files].slice(0, room).map((f) => compressPhoto(f)));
      setPhotos((p) => [...p, ...next]);
    } catch {
      toast('That photo couldn’t be read. Try a JPEG or PNG.', { tone: 'error' });
    }
  }

  function save() {
    const next: Record<string, string> = {};
    let year = installYear.trim() ? Number(installYear) : undefined;
    if (year !== undefined && !(Number.isInteger(year) && year >= 1900 && year <= new Date().getFullYear())) next.installYear = 'Use a four-digit year, like 2016.';
    if (installDate && !isRealDate(installDate)) next.installDate = 'Pick a real date.';
    if (warrantyExpires && !isRealDate(warrantyExpires)) next.warrantyExpires = 'Pick a real date.';
    setErrors(next);
    if (Object.keys(next).length) return;
    if (year === undefined && installDate) year = Number(installDate.slice(0, 4));
    const now = new Date().toISOString();
    onSave({
      id: system?.id ?? uid(),
      kind,
      name: name.trim() || SYSTEM_LABEL[kind],
      brand: brand.trim() || undefined,
      model: model.trim() || undefined,
      serial: serial.trim() || undefined,
      installYear: year,
      installDate: installDate || undefined,
      warrantyExpires: warrantyExpires || undefined,
      roomId: roomId || undefined,
      location: roomId ? undefined : location.trim() || undefined,
      contractorId: contractorId || undefined,
      photos: photos.length ? photos : undefined,
      notes: notes.trim() || undefined,
      createdAt: system?.createdAt ?? now,
      updatedAt: now,
    });
  }

  return (
    <Sheet
      title={system ? 'Edit system' : 'Add a system'}
      onClose={onClose}
      leading={<button type="button" className="sheet-action" onClick={onClose}>Cancel</button>}
      trailing={<button type="button" className="sheet-action is-strong" onClick={save}>Save</button>}
    >
      <FormGroup>
        <SelectField label="Kind" value={kind} onChange={(e) => setKind(e.target.value as SystemKind)} hint={life ? `Usually lasts about ${life} years.` : undefined}>
          {(Object.keys(SYSTEM_LABEL) as SystemKind[]).map((k) => (
            <option key={k} value={k}>
              {SYSTEM_LABEL[k]}
            </option>
          ))}
        </SelectField>
        <TextField label="Name" optional value={name} onChange={(e) => setName(e.target.value)} placeholder={SYSTEM_LABEL[kind]} />
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
        {!roomId && <TextField label="Where is it?" optional value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Garage, back corner" />}
      </FormGroup>

      <Section title="From the label" foot={KIND_HINT[kind] ?? 'The brand, model and serial number are usually on a sticker on the unit.'}>
        <LabelScanButton
          current={{ brand, model, serial }}
          canKeepPhoto={photos.length < MAX_PHOTOS}
          onApply={(v, photo) => {
            setBrand(v.brand);
            setModel(v.model);
            setSerial(v.serial);
            if (photo) setPhotos((p) => (p.length < MAX_PHOTOS ? [...p, photo] : p));
          }}
        />
        <FormGroup>
          <TextField label="Brand" optional value={brand} onChange={(e) => setBrand(e.target.value)} />
          <TextField label="Model number" optional value={model} onChange={(e) => setModel(e.target.value)} />
          <TextField label="Serial number" optional value={serial} onChange={(e) => setSerial(e.target.value)} />
        </FormGroup>
      </Section>

      <Section title="Dates and coverage">
        <FormGroup>
          <TextField label="Install year" optional inputMode="numeric" value={installYear} onChange={(e) => setInstallYear(e.target.value)} error={errors.installYear} hint="A year is enough for lifespan reminders." />
          <TextField label="Install or purchase date" optional type="date" max={toDateInput()} value={installDate} onChange={(e) => setInstallDate(e.target.value)} error={errors.installDate} />
          <TextField label="Warranty ends" optional type="date" value={warrantyExpires} onChange={(e) => setWarrantyExpires(e.target.value)} error={errors.warrantyExpires} hint="Home reminds you 60 days before." />
          {contractors.length > 0 ? (
            <SelectField label="Contractor" optional value={contractorId} onChange={(e) => setContractorId(e.target.value)}>
              <option value="">None</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                  {c.vendor ? ` (${c.vendor})` : ''}
                </option>
              ))}
            </SelectField>
          ) : null}
          <TextArea label="Notes" optional value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Filter size, fuel type, quirks" />
        </FormGroup>
        {contractors.length === 0 && <p className="section-foot">Save a contractor in Records to link who services it.</p>}
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
              Add a photo of the label
            </button>
          </div>
        )}
        {photos.length > 0 && <p className="section-foot">Tap a photo to remove it.</p>}
        <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { void addPhotos(e.target.files); e.target.value = ''; }} />
      </Section>
    </Sheet>
  );
}
