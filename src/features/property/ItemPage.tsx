import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData, useNow, useStore } from '../../data/DataProvider';
import { formatCurrency, formatDate, toDateInput } from '../../lib/dates';
import { EmptyState, Group, Page, Row, Section } from '../../ui/layout';
import { Confirm, useToast } from '../../ui/overlays';
import { TaskRow } from '../tasks/components';
import { withInfo } from '../tasks/taskMath';
import { useTaskActions } from '../tasks/useTaskActions';
import { RECORD_KIND_LABEL } from '../records/labels';
import { ItemForm } from './ItemForm';
import { ITEM_KIND_LABEL } from './labels';

export function ItemPage() {
  const { itemId } = useParams();
  const data = useData();
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const now = useNow();
  const { complete } = useTaskActions();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const item = data.items.find((i) => i.id === itemId);

  if (!item || item.kind === 'key') {
    return (
      <Page title="Item" back={{ to: '/property/inventory', label: 'Home Inventory' }}>
        <div className="section">
          <EmptyState title="This item isn’t here" body="It may have been removed." action={{ label: 'Back to Home Inventory', to: '/property/inventory' }} />
        </div>
      </Page>
    );
  }

  const room = data.rooms.find((r) => r.id === item.roomId);
  const records = data.records.filter((r) => r.itemId === item.id);
  const tasks = withInfo(data.tasks.filter((t) => t.itemId === item.id && t.status === 'open'), now);
  const history = data.serviceEvents.filter((e) => e.itemId === item.id).sort((a, b) => b.date.localeCompare(a.date));
  const today = toDateInput();

  return (
    <Page
      title={item.name}
      subtitle={[ITEM_KIND_LABEL[item.kind as keyof typeof ITEM_KIND_LABEL], room?.name].filter(Boolean).join(' · ')}
      back={{ to: '/property/inventory', label: 'Home Inventory' }}
      actions={<button type="button" className="button is-quiet" onClick={() => setEditing(true)}>Edit</button>}
    >
      {item.photos.length > 0 && (
        <Section>
          <div className="photo-grid">
            {item.photos.map((src, i) => (
              <img key={i} src={src} alt={`${item.name}, photo ${i + 1}`} />
            ))}
          </div>
        </Section>
      )}

      <Section title="Details">
        <Group>
          <Row title="Brand" value={item.brand ?? '—'} />
          <Row title="Model number" value={item.model ?? '—'} />
          <Row title="Serial number" value={item.serial ?? '—'} />
          <Row title="Purchased" value={item.purchaseDate ? formatDate(item.purchaseDate) : '—'} />
          <Row title="Value" value={item.value != null ? formatCurrency(item.value) : '—'} />
          {room && <Row title="Room" value={room.name} to={`/property/rooms/${room.id}`} />}
        </Group>
      </Section>

      {item.notes && (
        <Section title="Notes">
          <div className="group note-card">{item.notes}</div>
        </Section>
      )}

      <Section title="Warranty and paperwork" aside={<Link to={`/records?new=warranty&itemId=${item.id}`}>Add</Link>}>
        {records.length === 0 ? (
          <div className="group">
            <EmptyState inline title="No paperwork yet" body="Add the warranty, manual or receipt and Homebase reminds you before a warranty runs out." />
          </div>
        ) : (
          <Group>
            {records.map((record) => (
              <Row
                key={record.id}
                title={record.title}
                sub={record.expiresAt ? `${record.expiresAt < today ? 'Expired' : 'Expires'} ${formatDate(record.expiresAt)}` : RECORD_KIND_LABEL[record.kind]}
                to={`/records/${record.id}`}
              />
            ))}
          </Group>
        )}
      </Section>

      <Section title="Upkeep" aside={<Link to={`/tasks?new=1&itemId=${item.id}&name=${encodeURIComponent(`Service the ${item.name.toLowerCase()}`)}`}>Add</Link>}>
        {tasks.length === 0 && history.length === 0 ? (
          <div className="group">
            <EmptyState inline title="No upkeep tracked" body="Add a task for this item, like cleaning a filter or an annual service." />
          </div>
        ) : (
          <Group>
            {tasks.map(({ task, info }) => (
              <TaskRow key={task.id} task={task} info={info} now={now} onDone={() => complete(task)} />
            ))}
            {history.slice(0, 5).map((event) => (
              <Row key={event.id} title={event.title} sub={`Done ${formatDate(event.date)}${event.provider ? ` · ${event.provider}` : ''}`} value={event.cost != null ? formatCurrency(event.cost) : undefined} />
            ))}
          </Group>
        )}
      </Section>

      <div className="button-stack">
        <button type="button" className="button is-danger-quiet" onClick={() => setDeleting(true)}>
          Remove item
        </button>
      </div>

      {editing && (
        <ItemForm
          item={item}
          onClose={() => setEditing(false)}
          onSave={async (next) => {
            await store.put('items', next);
            setEditing(false);
            toast('Saved');
          }}
        />
      )}
      {deleting && (
        <Confirm
          title={`Remove ${item.name}?`}
          message="Its paperwork stays in Records."
          confirmLabel="Remove"
          destructive
          onCancel={() => setDeleting(false)}
          onConfirm={async () => {
            await store.remove('items', item.id);
            navigate('/property/inventory', { replace: true });
            toast(`${item.name} removed`, { action: { label: 'Undo', run: () => void store.put('items', item) } });
          }}
        />
      )}
    </Page>
  );
}
