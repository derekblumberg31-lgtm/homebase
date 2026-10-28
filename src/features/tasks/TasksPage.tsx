import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData, useNow, useStore } from '../../data/DataProvider';
import type { Task } from '../../data/types';
import { formatCurrency } from '../../lib/dates';
import { SearchField, Segmented } from '../../ui/controls';
import { Plus } from '../../ui/Icons';
import { EmptyState, Group, Page, Section } from '../../ui/layout';
import { useToast } from '../../ui/overlays';
import { TaskRow } from './components';
import { CostsView } from './CostsView';
import { TaskForm, type TaskDraft } from './TaskForm';
import { annualCost, compareUrgency, withInfo, type TaskItem } from './taskMath';
import { useTaskActions } from './useTaskActions';

type View = 'list' | 'schedule' | 'costs';
const SEARCH_AT = 6;

function endOfMonth(now: number) {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
}

/** Maintenance Planner: everything the home needs, soonest first. */
export function TasksPage() {
  const data = useData();
  const store = useStore();
  const toast = useToast();
  const now = useNow();
  const { complete } = useTaskActions();
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as View) || 'list';
  const [query, setQuery] = useState('');
  // Other areas open a prefilled form with ?new=1 (Assistant, rooms, inventory items).
  const [form, setForm] = useState<TaskDraft | null>(
    params.get('new')
      ? {
          kind: (params.get('kind') as Task['kind']) ?? 'maintenance',
          name: params.get('name') ?? undefined,
          roomId: params.get('roomId') ?? undefined,
          itemId: params.get('itemId') ?? undefined,
          notes: params.get('notes') ?? undefined,
        }
      : null,
  );

  const open = useMemo(() => data.tasks.filter((task) => task.status === 'open'), [data.tasks]);
  const items = useMemo(() => withInfo(open, now).sort(compareUrgency), [open, now]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(({ task }) => [task.name, task.location, task.notes ?? ''].some((v) => v.toLowerCase().includes(needle)));
  }, [items, query]);

  const monthEnd = endOfMonth(now);
  const thisMonth = visible.filter((item) => item.info.status === 'overdue' || item.info.dueDate.getTime() <= monthEnd);
  const later = visible.filter((item) => !thisMonth.includes(item));
  const yearly = open.reduce((sum, task) => sum + annualCost(task), 0);
  const overdue = items.filter((item) => item.info.status === 'overdue').length;

  function setView(next: View) {
    const p = new URLSearchParams(params);
    p.set('view', next);
    setParams(p, { replace: true });
  }

  async function save(task: Task) {
    await store.put('tasks', task);
    await store.log('task-added', `Added: ${task.name}`, `/tasks/${task.id}`);
    setForm(null);
    if (params.get('new')) setParams({}, { replace: true });
    toast(`${task.name} added`);
  }

  const summary = open.length
    ? [
        `${open.length} ${open.length === 1 ? 'task' : 'tasks'}`,
        overdue ? `${overdue} overdue` : `${thisMonth.length} due this month`,
        yearly > 0 ? `${formatCurrency(Math.round(yearly))} a year` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  return (
    <Page
      title="Tasks"
      subtitle={summary}
      profile
      actions={
        <button type="button" className="round-button" aria-label="Add task" onClick={() => setForm({})}>
          <Plus size={20} />
        </button>
      }
    >
      {data.tasks.length > 0 && (
        <div className="section">
          <Segmented<View>
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: 'Planner' },
              { value: 'schedule', label: 'Schedule' },
              { value: 'costs', label: 'Costs' },
            ]}
          />
        </div>
      )}

      {data.tasks.length === 0 && (
        <div className="section">
          <EmptyState
            title="Nothing to keep track of yet"
            body="Add the jobs your home needs, like filters, gutters or a leaky tap, and Homebase counts down to each one."
            action={{ label: 'Add a task', onClick: () => setForm({}) }}
          />
        </div>
      )}

      {view === 'list' && open.length > 0 && (
        <>
          {open.length >= SEARCH_AT && (
            <div className="section">
              <SearchField value={query} onChange={setQuery} label="Search tasks" placeholder="Search tasks or rooms" />
            </div>
          )}
          <TaskList title="This month" items={thisMonth} now={now} aside={overdue ? `${thisMonth.length} · ${overdue} overdue` : String(thisMonth.length)} onDone={(t) => complete(t)} featureFirst />
          <TaskList title="Later" items={later} now={now} aside={String(later.length)} onDone={(t) => complete(t)} />
          {visible.length === 0 && (
            <div className="section">
              <EmptyState inline title={`Nothing matches “${query.trim()}”`} body="Try a room or part of the task name." />
            </div>
          )}
          <p className="local-note">Swipe a task left to mark it done.</p>
        </>
      )}

      {view === 'list' && open.length === 0 && data.tasks.length > 0 && (
        <div className="section">
          <EmptyState title="All caught up" body="Every task is done. Add the next one when it comes up." action={{ label: 'Add a task', onClick: () => setForm({}) }} />
        </div>
      )}

      {view === 'schedule' && <ScheduleView items={items} now={now} onDone={(t) => complete(t)} />}
      {view === 'costs' && <CostsView tasks={open} now={now} />}

      {form && <TaskForm draft={form} onClose={() => setForm(null)} onSave={save} />}
    </Page>
  );
}

function TaskList({ title, items, now, aside, onDone, featureFirst = false }: { title: string; items: TaskItem[]; now: number; aside: string; onDone: (task: Task) => void; featureFirst?: boolean }) {
  if (items.length === 0) return null;
  return (
    <Section title={title} aside={aside}>
      <Group>
        {items.map(({ task, info }, index) => (
          <TaskRow key={task.id} task={task} info={info} now={now} featured={featureFirst && index === 0} onDone={() => onDone(task)} />
        ))}
      </Group>
    </Section>
  );
}

function ScheduleView({ items, now, onDone }: { items: TaskItem[]; now: number; onDone: (task: Task) => void }) {
  const groups = [
    { title: 'Overdue', items: items.filter((i) => i.info.status === 'overdue') },
    { title: 'This week', items: items.filter((i) => i.info.status !== 'overdue' && i.info.daysLeft <= 7) },
    { title: 'Next 30 days', items: items.filter((i) => i.info.daysLeft > 7 && i.info.daysLeft <= 30) },
    { title: 'Later', items: items.filter((i) => i.info.daysLeft > 30) },
  ];
  if (items.length === 0) return <div className="section"><EmptyState title="Nothing scheduled" body="Open tasks show here, grouped by when they’re due." /></div>;
  return (
    <>
      {groups.map((group) => (
        <TaskList key={group.title} title={group.title} items={group.items} now={now} aside={String(group.items.length)} onDone={onDone} />
      ))}
      <p className="local-note">Due dates move forward when you mark a task done.</p>
    </>
  );
}
