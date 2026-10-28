import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData, useNow, useStore } from '../../data/DataProvider';
import { formatCurrency, formatDate, formatInterval } from '../../lib/dates';
import { Check } from '../../ui/Icons';
import { EmptyState, Group, Page, Row, Section } from '../../ui/layout';
import { Confirm, useToast } from '../../ui/overlays';
import { removeTask } from './actions';
import { CompleteSheet } from './CompleteSheet';
import { Countdown, DayStrip } from './components';
import { TaskForm } from './TaskForm';
import { annualCost, getTaskInfo } from './taskMath';
import { useTaskActions } from './useTaskActions';

export function TaskDetailPage() {
  const { taskId } = useParams();
  const data = useData();
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const now = useNow();
  const { complete } = useTaskActions();
  const [editing, setEditing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const task = data.tasks.find((t) => t.id === taskId);
  if (!task) {
    return (
      <Page title="Task" back={{ to: '/tasks', label: 'Tasks' }}>
        <div className="section">
          <EmptyState title="This task isn’t here" body="It may have been deleted, or it lives on another device." action={{ label: 'Back to Tasks', to: '/tasks' }} />
        </div>
      </Page>
    );
  }

  const info = getTaskInfo(task, now);
  const history = data.serviceEvents.filter((e) => e.taskId === task.id).sort((a, b) => b.date.localeCompare(a.date));
  const room = data.rooms.find((r) => r.id === task.roomId);
  const item = data.items.find((i) => i.id === task.itemId);
  const yearly = annualCost(task);
  const kindLabel = task.kind === 'maintenance' ? 'Maintenance' : task.kind === 'repair' ? 'Repair' : 'Project';

  return (
    <Page title={task.name} subtitle={[kindLabel, task.location].filter(Boolean).join(' · ')} back={{ to: '/tasks', label: 'Tasks' }} actions={<button type="button" className="button is-quiet" onClick={() => setEditing(true)}>Edit</button>}>
      <Section>
        <Group>
          <div className="row is-stacked is-hero">
            <Countdown info={info} large />
            {task.recurring && task.status === 'open' && <DayStrip task={task} now={now} />}
          </div>
          {task.recurring ? (
            <>
              <Row title="Last done" value={formatDate(task.lastDoneAt)} />
              <Row title={info.status === 'overdue' ? 'Was due' : 'Due'} value={formatDate(info.dueDate)} />
              <Row title="Repeats" value={`Every ${formatInterval(task.intervalDays)}`} />
            </>
          ) : (
            <Row title={task.status === 'done' ? 'Finished' : 'Do by'} value={formatDate(task.status === 'done' ? task.lastDoneAt : info.dueDate)} />
          )}
          {task.cost != null && <Row title={task.recurring ? 'Cost each time' : 'Estimated cost'} value={formatCurrency(task.cost)} />}
          {yearly > 0 && <Row title="Per year" value={formatCurrency(Math.round(yearly))} />}
          {room && <Row title="Room" value={room.name} to={`/property/rooms/${room.id}`} />}
          {item && <Row title="For" value={item.name} to={`/property/items/${item.id}`} />}
        </Group>
      </Section>

      {task.notes && (
        <Section title="Notes">
          <div className="group note-card">
            {task.notes}
          </div>
        </Section>
      )}

      <Section title="Service history" aside={history.length ? <Link to="/records/service-history">All</Link> : undefined}>
        {history.length === 0 ? (
          <div className="group">
            <EmptyState inline title="Not done in Homebase yet" body="Each time you mark it done, the date, cost and note are kept here." />
          </div>
        ) : (
          <Group>
            {history.map((event) => (
              <Row
                key={event.id}
                title={`Done ${formatDate(event.date)}`}
                sub={[event.provider, event.notes, event.previousDoneAt ? `${Math.max(0, Math.round((new Date(event.date).getTime() - new Date(event.previousDoneAt).getTime()) / 86_400_000))} days after the last time` : null].filter(Boolean).join(' · ') || undefined}
                value={event.cost != null ? formatCurrency(event.cost) : undefined}
              />
            ))}
          </Group>
        )}
      </Section>

      <div className="button-stack">
        {task.status === 'open' && (
          <button type="button" className="button is-primary is-block" onClick={() => setCompleting(true)}>
            <Check size={18} />
            Mark done
          </button>
        )}
        <button type="button" className="button is-danger-quiet" onClick={() => setDeleting(true)}>
          Delete task
        </button>
      </div>

      {editing && (
        <TaskForm
          initial={task}
          onClose={() => setEditing(false)}
          onSave={async (next) => {
            await store.put('tasks', next);
            setEditing(false);
            toast('Saved');
          }}
        />
      )}
      {completing && (
        <CompleteSheet
          task={task}
          onClose={() => setCompleting(false)}
          onConfirm={async (input) => {
            setCompleting(false);
            await complete(task, input);
          }}
        />
      )}
      {deleting && (
        <Confirm
          title="Delete this task?"
          message="Its service history stays in Records."
          confirmLabel="Delete"
          destructive
          onCancel={() => setDeleting(false)}
          onConfirm={async () => {
            const { undo } = await removeTask(store, task);
            setDeleting(false);
            navigate('/tasks', { replace: true });
            toast(`${task.name} deleted`, { action: { label: 'Undo', run: () => void undo() } });
          }}
        />
      )}
    </Page>
  );
}
