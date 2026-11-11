import { useMemo, useState } from 'react';
import { useData } from '../../data/DataProvider';
import { uid } from '../../data/ids';
import type { Task, TaskCategory, TaskKind, TaskPriority } from '../../data/types';
import { daysBetween, formatDate, isRealDate, startOfDay, toDateInput } from '../../lib/dates';
import { Chips, FormGroup, Segmented, SelectField, Switch, TextArea, TextField } from '../../ui/controls';
import { Section } from '../../ui/layout';
import { Sheet } from '../../ui/overlays';
import { taskCategory } from './meta';
import { CATEGORY_META, CATEGORY_ORDER, TASK_PRESETS, findType, presetCostHint } from './presets';
import { firstDueFor, LAST_DONE_OPTIONS, resolveLastDone, type LastDoneChoice } from './lastDone';
import { dueDateOf } from './taskMath';

const INTERVALS = [
  { value: 7, label: '1 wk' },
  { value: 30, label: '1 mo' },
  { value: 90, label: '3 mo' },
  { value: 180, label: '6 mo' },
  { value: 365, label: '1 yr' },
  { value: 730, label: '2 yr' },
];

export interface TaskDraft {
  name?: string;
  kind?: TaskKind;
  itemId?: string;
  roomId?: string;
  notes?: string;
  category?: TaskCategory;
  seasonal?: boolean;
  priority?: TaskPriority;
  /** Recurring drafts: when it was last done and how often, e.g. a yearly seasonal job due soon. */
  lastDoneAt?: string;
  intervalDays?: number;
  /** First due date when the last-done date is not known. */
  dueDate?: string;
}

interface TaskFormProps {
  initial?: Task | null;
  draft?: TaskDraft;
  onClose: () => void;
  onSave: (task: Task) => void;
}

/** Add or edit a task: recurring maintenance, a one-off repair, or a project. */
export function TaskForm({ initial, draft, onClose, onSave }: TaskFormProps) {
  const { rooms, items } = useData();
  const [kind, setKind] = useState<TaskKind>(initial?.kind ?? draft?.kind ?? 'maintenance');
  const [typeId, setTypeId] = useState(initial?.typeId ?? 'custom');
  const [name, setName] = useState(initial?.name ?? draft?.name ?? '');
  const [roomId, setRoomId] = useState(initial?.roomId ?? draft?.roomId ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [itemId, setItemId] = useState(initial?.itemId ?? draft?.itemId ?? '');
  // Set when the last-done date is not known: the job is first due on this date.
  const firstDue = initial?.recurring ? initial.dueDate : draft?.dueDate;
  // No silent "today": a new job starts with nothing chosen. A draft that carries a real date opens on "Pick a date".
  const [lastDone, setLastDone] = useState<LastDoneChoice | 'date' | undefined>(!initial && !firstDue && draft?.lastDoneAt ? 'date' : undefined);
  const [lastDoneDate, setLastDoneDate] = useState(!initial && !firstDue ? draft?.lastDoneAt ?? '' : '');
  const [interval, setInterval] = useState(String(initial?.intervalDays ?? draft?.intervalDays ?? 90));
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '');
  const [cost, setCost] = useState(initial?.cost != null ? String(initial.cost) : '');
  const [notes, setNotes] = useState(initial?.notes ?? draft?.notes ?? '');
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? draft?.priority ?? 'normal');
  const [category, setCategory] = useState<TaskCategory>(initial ? taskCategory(initial) : draft?.category ?? 'other');
  const [seasonal, setSeasonal] = useState(initial?.seasonal ?? draft?.seasonal ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const recurring = kind === 'maintenance';
  const belongings = useMemo(() => items.filter((item) => item.kind !== 'key'), [items]);

  function choosePreset(id: string) {
    setTypeId(id);
    const preset = findType(id);
    if (id !== 'custom') {
      if (!name || TASK_PRESETS.some((p) => p.label === name)) setName(preset.label);
      setInterval(String(preset.lifespanDays));
      setCategory(preset.category);
    }
  }

  const intervalDays = Math.round(Number(interval));
  const lastDoneHint = (() => {
    if (lastDone && lastDone !== 'date' && intervalDays >= 1) {
      const due = firstDueFor(lastDone, intervalDays, Date.now());
      return daysBetween(toDateInput(startOfDay(Date.now())), due) <= 7 ? 'Due within a week, so it’s on your list now.' : `Next due ${formatDate(due)}`;
    }
    if (lastDone) return undefined;
    if (initial?.recurring) return `Next due ${formatDate(dueDateOf(initial))}. Pick one to change it.`;
    if (draft?.dueDate) return `If you skip this, it’s due ${formatDate(draft.dueDate)}.`;
    return 'A rough guess is fine.';
  })();

  function pickLastDone(choice: LastDoneChoice | 'date') {
    setLastDone(choice);
    setErrors((e) => ({ ...e, lastDoneAt: '' }));
  }

  function save() {
    const next: Record<string, string> = {};
    const days = Math.round(Number(interval));
    const price = cost.trim() ? Number(cost) : undefined;
    if (!name.trim()) next.name = 'Give the task a name.';
    if (recurring && !(days >= 1 && days <= 3650)) next.interval = 'Use a number of days between 1 and 3650.';
    const schedule = recurring ? resolveLastDone({ choice: lastDone, date: lastDoneDate, intervalDays: days, now: Date.now(), initial: initial ?? undefined, draftDueDate: draft?.dueDate }) : null;
    if (schedule && 'error' in schedule) next.lastDoneAt = schedule.error;
    if (!recurring && dueDate && !isRealDate(dueDate)) next.dueDate = 'Pick a real date.';
    if (price !== undefined && !(price >= 0)) next.cost = 'Use a positive amount, or leave it empty.';
    setErrors(next);
    if (Object.keys(next).length) return;

    const room = rooms.find((r) => r.id === roomId);
    const now = new Date().toISOString();
    onSave({
      id: initial?.id ?? uid(),
      kind,
      name: name.trim(),
      typeId: recurring ? typeId : 'custom',
      location: room?.name ?? location.trim(),
      roomId: room?.id,
      itemId: itemId || undefined,
      lastDoneAt: schedule && !('error' in schedule) ? schedule.lastDoneAt : initial?.lastDoneAt ?? toDateInput(),
      intervalDays: recurring ? days : initial?.intervalDays ?? 30,
      recurring,
      dueDate: schedule && !('error' in schedule) ? schedule.dueDate : dueDate || toDateInput(),
      status: initial?.status === 'done' && !recurring ? 'done' : 'open',
      cost: price,
      priority,
      category,
      seasonal: seasonal || undefined,
      notes: notes.trim() || undefined,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    });
  }

  return (
    <Sheet
      title={initial ? 'Edit task' : 'New task'}
      onClose={onClose}
      leading={
        <button type="button" className="sheet-action" onClick={onClose}>
          Cancel
        </button>
      }
      trailing={
        <button type="button" className="sheet-action is-strong" onClick={save}>
          {initial ? 'Save' : 'Add'}
        </button>
      }
    >
      <Segmented<TaskKind>
        label="Kind of task"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'maintenance', label: 'Maintenance' },
          { value: 'repair', label: 'Repair' },
          { value: 'project', label: 'Project' },
        ]}
      />

      <Section title="The task">
        <FormGroup>
          {recurring && (
            <SelectField label="Common jobs" value={typeId} onChange={(e) => choosePreset(e.target.value)} hint={typeId !== 'custom' ? `Usually every ${findType(typeId).lifespanDays} days` : undefined}>
              <option value="custom">Something else</option>
              {CATEGORY_ORDER.map((category) => (
                <optgroup key={category} label={CATEGORY_META[category].label}>
                  {TASK_PRESETS.filter((p) => p.category === category && p.id !== 'custom').map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectField>
          )}
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === 'repair' ? 'Fix the dripping kitchen tap' : kind === 'project' ? 'Repaint the guest room' : 'Swap the HVAC filter'}
            error={errors.name}
          />
          {rooms.length > 0 && (
            <SelectField label="Room" optional value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">Not in a room</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </SelectField>
          )}
          {!roomId && <TextField label="Where" optional value={location} onChange={(e) => setLocation(e.target.value)} placeholder={kind === 'maintenance' ? 'Hallway return' : 'Kitchen'} />}
          {belongings.length > 0 && (
            <SelectField label="For an item" optional value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">None</option>
              {belongings.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </SelectField>
          )}
        </FormGroup>
      </Section>

      <Section title={recurring ? 'Schedule' : 'When'}>
        <FormGroup>
          {recurring ? (
            <>
              <div className="field">
                <span className="field-label">Last done</span>
                <Chips<LastDoneChoice | 'date'> label="Last done" value={lastDone} onChange={pickLastDone} options={[...LAST_DONE_OPTIONS, { value: 'date', label: 'Pick a date' }]} />
                {lastDone === 'date' ? (
                  <TextField label="Date" type="date" value={lastDoneDate} max={toDateInput()} onChange={(e) => setLastDoneDate(e.target.value)} error={errors.lastDoneAt} />
                ) : errors.lastDoneAt ? (
                  <p className="field-error">{errors.lastDoneAt}</p>
                ) : (
                  lastDoneHint && <p className="field-hint">{lastDoneHint}</p>
                )}
              </div>
              <div className="field">
                <TextField label="Repeat every" inputMode="numeric" value={interval} onChange={(e) => setInterval(e.target.value)} suffix="days" error={errors.interval} />
                <Chips label="Common intervals" value={Number(interval)} onChange={(v) => setInterval(String(v))} options={INTERVALS} />
              </div>
            </>
          ) : (
            <TextField label="Do by" optional type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} error={errors.dueDate} hint="Leave empty for today." />
          )}
          <TextField label={recurring ? 'Cost each time' : 'Estimated cost'} optional inputMode="decimal" prefix="$" value={cost} onChange={(e) => setCost(e.target.value)} error={errors.cost} hint={presetCostHint(typeId, cost)} />
          <TextArea label="Notes" optional value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={recurring ? 'Filter size, part number…' : 'What needs doing, who to call…'} />
        </FormGroup>
      </Section>

      <Section title="Details">
        <div className="form-segment">
          <span className="field-label" aria-hidden="true">
            Priority
          </span>
          <Segmented<TaskPriority>
            label="Priority"
            value={priority}
            onChange={setPriority}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'normal', label: 'Normal' },
              { value: 'high', label: 'High' },
            ]}
          />
        </div>
        <FormGroup>
          <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)}>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_META[c].label}
              </option>
            ))}
          </SelectField>
          <div className="field is-switch">
            <span className="row-main">
              <span className="field-label">Seasonal job</span>
              <span className="field-hint">Shown with this season’s recommendations on Home.</span>
            </span>
            <Switch checked={seasonal} onChange={setSeasonal} label="Seasonal job" />
          </div>
        </FormGroup>
      </Section>
    </Sheet>
  );
}
