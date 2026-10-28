import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useData, useNow, useStore } from '../../data/DataProvider';
import { EmptyState, Group, Page, Row, Section } from '../../ui/layout';
import { Confirm, useToast } from '../../ui/overlays';
import { TaskRow } from '../tasks/components';
import { compareUrgency, withInfo } from '../tasks/taskMath';
import { useTaskActions } from '../tasks/useTaskActions';
import { RoomSheet } from './PropertyPage';

export function RoomPage() {
  const { roomId } = useParams();
  const data = useData();
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const now = useNow();
  const { complete } = useTaskActions();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const room = data.rooms.find((r) => r.id === roomId);

  if (!room) {
    return (
      <Page title="Room" back={{ to: '/property', label: 'Property' }}>
        <div className="section">
          <EmptyState title="This room isn’t here" body="It may have been removed." action={{ label: 'Back to Property', to: '/property' }} />
        </div>
      </Page>
    );
  }

  const items = data.items.filter((i) => i.roomId === room.id);
  const tasks = withInfo(data.tasks.filter((t) => t.roomId === room.id && t.status === 'open'), now).sort(compareUrgency);
  const systems = data.systems.filter((s) => s.roomId === room.id);

  return (
    <Page title={room.name} subtitle={room.floor} back={{ to: '/property', label: 'Property' }} actions={<button type="button" className="button is-quiet" onClick={() => setEditing(true)}>Edit</button>}>
      {room.notes && (
        <Section>
          <div className="group note-card">{room.notes}</div>
        </Section>
      )}

      <Section title="Tasks here" aside={<button type="button" onClick={() => navigate(`/tasks?new=1&roomId=${room.id}`)}>Add</button>}>
        {tasks.length === 0 ? (
          <div className="group">
            <EmptyState inline title="Nothing due here" body="Tasks you put in this room show here." />
          </div>
        ) : (
          <Group>
            {tasks.map(({ task, info }) => (
              <TaskRow key={task.id} task={task} info={info} now={now} onDone={() => complete(task)} />
            ))}
          </Group>
        )}
      </Section>

      <Section title="In this room" aside={<button type="button" onClick={() => navigate(`/property/inventory?new=1&roomId=${room.id}`)}>Add</button>}>
        {items.length === 0 && systems.length === 0 ? (
          <div className="group">
            <EmptyState inline title="Nothing listed yet" body="Add appliances and belongings to keep their details and warranties together." />
          </div>
        ) : (
          <Group>
            {systems.map((s) => (
              <Row key={s.id} title={s.name} sub="Home system" to="/property/systems" />
            ))}
            {items.map((item) => (
              <Row key={item.id} title={item.name} sub={[item.brand, item.model].filter(Boolean).join(' ') || undefined} to={item.kind === 'key' ? `/property/keys/${item.id}` : `/property/items/${item.id}`} />
            ))}
          </Group>
        )}
      </Section>

      <div className="button-stack">
        <button type="button" className="button is-danger-quiet" onClick={() => setDeleting(true)}>
          Remove room
        </button>
      </div>

      {editing && (
        <RoomSheet
          room={room}
          onClose={() => setEditing(false)}
          onSave={async (next) => {
            await store.put('rooms', next);
            for (const task of data.tasks.filter((t) => t.roomId === room.id)) await store.put('tasks', { ...task, location: next.name });
            setEditing(false);
            toast('Saved');
          }}
        />
      )}
      {deleting && (
        <Confirm
          title={`Remove ${room.name}?`}
          message="Tasks and items in it stay; they just won’t be in a room."
          confirmLabel="Remove"
          destructive
          onCancel={() => setDeleting(false)}
          onConfirm={async () => {
            for (const task of data.tasks.filter((t) => t.roomId === room.id)) await store.put('tasks', { ...task, roomId: undefined });
            for (const item of items) await store.put('items', { ...item, roomId: undefined });
            await store.remove('rooms', room.id);
            navigate('/property', { replace: true });
            toast(`${room.name} removed`);
          }}
        />
      )}
    </Page>
  );
}
