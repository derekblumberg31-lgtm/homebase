import { useState } from 'react';
import { useData, useStore } from '../../data/DataProvider';
import { uid } from '../../data/ids';
import type { Room } from '../../data/types';
import { FormGroup, TextField } from '../../ui/controls';
import { Camera, Key } from '../../ui/Icons';
import { EmptyState, Group, Page, Row, Section } from '../../ui/layout';
import { Sheet, useToast } from '../../ui/overlays';
import { PROPERTY_TYPE_LABEL } from './labels';

/** Property: the home itself, its rooms and systems, what's in it, and its keys. */
export function PropertyPage() {
  const data = useData();
  const store = useStore();
  const toast = useToast();
  const [roomSheet, setRoomSheet] = useState(false);
  const property = data.property;
  const belongings = data.items.filter((item) => item.kind !== 'key');
  const keys = data.items.filter((item) => item.kind === 'key');
  const year = property?.yearBuilt;
  const facts = [property?.type ? PROPERTY_TYPE_LABEL[property.type] : null, year ? `Built ${year}` : null, property?.ownership === 'rent' ? 'Rented' : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Page title="Property" subtitle={property?.address} profile>
      <Section title="Your home">
        <Group>
          <Row title={property?.nickname ?? 'My home'} sub={facts || 'Add the type, year built and size'} to="/property/details" />
        </Group>
      </Section>

      <Section title="Rooms" aside={data.rooms.length ? String(data.rooms.length) : undefined}>
        {data.rooms.length === 0 ? (
          <EmptyState
            title="No rooms yet"
            body="Rooms let you see everything in one place: what’s in the kitchen, what’s due in the basement."
            action={{ label: 'Add a room', onClick: () => setRoomSheet(true) }}
          />
        ) : (
          <Group>
            {[...data.rooms]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((room) => {
                const items = data.items.filter((i) => i.roomId === room.id).length;
                const tasks = data.tasks.filter((t) => t.roomId === room.id && t.status === 'open').length;
                const sub = [items ? `${items} ${items === 1 ? 'item' : 'items'}` : null, tasks ? `${tasks} ${tasks === 1 ? 'task' : 'tasks'}` : null].filter(Boolean).join(' · ');
                return <Row key={room.id} title={room.name} sub={sub || room.floor} to={`/property/rooms/${room.id}`} />;
              })}
            <Row title="Add a room" tone="action" onClick={() => setRoomSheet(true)} />
          </Group>
        )}
      </Section>

      <Section title="What’s in it">
        <Group>
          <Row title="Home Systems" sub="Heating, cooling, water heater, roof" value={data.systems.length || undefined} to="/property/systems" />
          <Row title="Home Inventory" sub="Appliances, electronics, furniture, tools" value={belongings.length || undefined} to="/property/inventory" />
          <Row title="Keys and Locks" sub="Saved keys and the blanks to copy them" value={keys.length || undefined} lead={<Key size={19} />} to="/property/keys" />
          <Row title="Identify a key" sub="Take a photo to find which key it is" lead={<Camera size={19} />} to="/property/identify-key" />
        </Group>
      </Section>

      <Section title="Paperwork">
        <Group>
          <Row title="Warranties, manuals and receipts" value={data.records.length || undefined} to="/records" />
        </Group>
      </Section>

      {roomSheet && (
        <RoomSheet
          onClose={() => setRoomSheet(false)}
          onSave={async (room) => {
            await store.put('rooms', room);
            setRoomSheet(false);
            toast(`${room.name} added`);
          }}
        />
      )}
    </Page>
  );
}

const ROOM_IDEAS = ['Kitchen', 'Living room', 'Bedroom', 'Bathroom', 'Laundry', 'Garage', 'Basement', 'Attic', 'Yard', 'Office'];

export function RoomSheet({ room, onClose, onSave }: { room?: Room; onClose: () => void; onSave: (room: Room) => void }) {
  const { rooms } = useData();
  const [name, setName] = useState(room?.name ?? '');
  const [floor, setFloor] = useState(room?.floor ?? '');
  const [notes, setNotes] = useState(room?.notes ?? '');
  const [error, setError] = useState('');
  const ideas = ROOM_IDEAS.filter((idea) => !rooms.some((r) => r.name.toLowerCase() === idea.toLowerCase()));

  function save() {
    if (!name.trim()) return setError('Give the room a name.');
    onSave({ id: room?.id ?? uid(), name: name.trim(), floor: floor.trim() || undefined, notes: notes.trim() || undefined, createdAt: room?.createdAt ?? new Date().toISOString() });
  }

  return (
    <Sheet
      title={room ? 'Edit room' : 'Add a room'}
      onClose={onClose}
      leading={<button type="button" className="sheet-action" onClick={onClose}>Cancel</button>}
      trailing={<button type="button" className="sheet-action is-strong" onClick={save}>Save</button>}
    >
      <FormGroup>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={error} autoFocus />
        <TextField label="Floor" optional value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="Upstairs" />
        <TextField label="Notes" optional value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Paint color, flooring" />
      </FormGroup>
      {!room && ideas.length > 0 && (
        <div className="chips" role="group" aria-label="Common rooms">
          {ideas.map((idea) => (
            <button key={idea} type="button" className="chip" aria-pressed={name === idea} onClick={() => setName(idea)}>
              {idea}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
