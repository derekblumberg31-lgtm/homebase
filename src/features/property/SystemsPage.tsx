import { useState } from 'react';
import { useData, useStore } from '../../data/DataProvider';
import { uid } from '../../data/ids';
import type { HomeSystem, SystemKind } from '../../data/types';
import { FormGroup, SelectField, TextArea, TextField } from '../../ui/controls';
import { EmptyState, Group, Page, Row, Section } from '../../ui/layout';
import { Confirm, Sheet, useToast } from '../../ui/overlays';
import { SYSTEM_LABEL, SYSTEM_LIFESPAN } from './labels';

function ageText(system: HomeSystem): string | undefined {
  if (!system.installYear) return undefined;
  const age = new Date().getFullYear() - system.installYear;
  return age <= 0 ? 'Installed this year' : `Installed ${system.installYear} · ${age} ${age === 1 ? 'year' : 'years'} old`;
}

/** The big systems that keep the home running, with their age for lifespan reminders. */
export function SystemsPage() {
  const { systems } = useData();
  const store = useStore();
  const toast = useToast();
  const [editing, setEditing] = useState<HomeSystem | 'new' | null>(null);

  return (
    <Page
      title="Home systems"
      subtitle="Knowing install years lets Homebase remind you before things wear out."
      back={{ to: '/property', label: 'Property' }}
      actions={<button type="button" className="button is-quiet" onClick={() => setEditing('new')}>Add</button>}
    >
      <Section>
        {systems.length === 0 ? (
          <EmptyState title="No systems yet" body="Start with the water heater, heating and cooling. The install year is often on a sticker on the unit." action={{ label: 'Add a system', onClick: () => setEditing('new') }} />
        ) : (
          <Group>
            {systems.map((system) => (
              <Row key={system.id} title={system.name} sub={[SYSTEM_LABEL[system.kind], ageText(system)].filter(Boolean).join(' · ')} onClick={() => setEditing(system)} chevron />
            ))}
          </Group>
        )}
      </Section>

      {editing && (
        <SystemSheet
          system={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={async (system) => {
            await store.put('systems', system);
            if (editing === 'new') await store.log('item-added', `Added ${system.name}`, '/property/systems');
            setEditing(null);
            toast('Saved');
          }}
          onRemove={async (system) => {
            await store.remove('systems', system.id);
            setEditing(null);
            toast(`${system.name} removed`, { action: { label: 'Undo', run: () => void store.put('systems', system) } });
          }}
        />
      )}
    </Page>
  );
}

function SystemSheet({ system, onClose, onSave, onRemove }: { system?: HomeSystem; onClose: () => void; onSave: (s: HomeSystem) => void; onRemove: (s: HomeSystem) => void }) {
  const { rooms } = useData();
  const [kind, setKind] = useState<SystemKind>(system?.kind ?? 'water-heater');
  const [name, setName] = useState(system?.name ?? '');
  const [brand, setBrand] = useState(system?.brand ?? '');
  const [model, setModel] = useState(system?.model ?? '');
  const [installYear, setInstallYear] = useState(system?.installYear ? String(system.installYear) : '');
  const [roomId, setRoomId] = useState(system?.roomId ?? '');
  const [notes, setNotes] = useState(system?.notes ?? '');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const life = SYSTEM_LIFESPAN[kind];

  function save() {
    const year = installYear.trim() ? Number(installYear) : undefined;
    if (year !== undefined && !(Number.isInteger(year) && year >= 1900 && year <= new Date().getFullYear())) return setError('Use a four-digit year.');
    const now = new Date().toISOString();
    onSave({
      id: system?.id ?? uid(),
      kind,
      name: name.trim() || SYSTEM_LABEL[kind],
      brand: brand.trim() || undefined,
      model: model.trim() || undefined,
      installYear: year,
      roomId: roomId || undefined,
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
        <TextField label="Brand" optional value={brand} onChange={(e) => setBrand(e.target.value)} />
        <TextField label="Model" optional value={model} onChange={(e) => setModel(e.target.value)} />
        <TextField label="Install year" optional inputMode="numeric" value={installYear} onChange={(e) => setInstallYear(e.target.value)} error={error} />
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
        <TextArea label="Notes" optional value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Filter size, service company" />
      </FormGroup>
      {system && (
        <div className="button-stack">
          <button type="button" className="button is-danger-quiet" onClick={() => setConfirming(true)}>
            Remove system
          </button>
        </div>
      )}
      {confirming && system && (
        <Confirm title={`Remove ${system.name}?`} message="You can undo this right after." confirmLabel="Remove" destructive onCancel={() => setConfirming(false)} onConfirm={() => onRemove(system)} />
      )}
    </Sheet>
  );
}
