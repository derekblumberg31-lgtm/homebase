import { useMemo, useState } from 'react';
import { useData } from '../../data/DataProvider';
import { uid } from '../../data/ids';
import type { Task, TaskCategory, TaskKind, TaskPriority } from '../../data/types';
import { addDays, formatDate, formatInterval, isRealDate, toDateInput } from '../../lib/dates';
import { Chips, FormGroup, Segmented, SelectField, Switch, TextArea, TextField } from '../../ui/controls';
import { ChevronDown, Sparkles } from '../../ui/Icons';
import { Section } from '../../ui/layout';
import { Sheet } from '../../ui/overlays';
import { COMMON_JOBS, guessForJob, inferTask, type TaskGuess } from './infer';
import { PRIORITY_LABEL, taskCategory } from './meta';
import { CATEGORY_META, CATEGORY_ORDER, TASK_PRESETS, findType } from './presets';
import { dueDateOf } from './taskMath';

const INTERVALS = [
  { value: 7, label: '1 wk' },
  { value: 30, label: '1 mo' },
  { value: 90, label: '3 mo' },
  { value: 180, label: '6 mo' },
  { value: 365, label: '1 yr' },
  { value: 730, label: '2 yr' },
];

type When = 'today' | 'week' | 'month' | 'date';
const WHEN_OPTIONS: { value: When; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'date', label: 'Pick a date' },
];

function whenToDate(when: When, picked: string): string {
  const today = new Date();
  if (when === 'today') return toDateInput(today);
  if (when === 'week') return toDateInput(addDays(today, 7));
  if (when === 'month') return toDateInput(addDays(today, 30));
  return picked;
}

export interface TaskDraft {
  name?: string;
  kind?: TaskKind;
  itemId?: string;
  systemId?: string;
  roomId?: string;
  location?: string;
  notes?: string;
  category?: TaskCategory;
  seasonal?: boolean;
  priority?: TaskPriority;
  /** One-off tasks: the due date. */
  dueDate?: string;
  /** Recurring drafts: when it was last done and how often, e.g. a yearly seasonal job due soon. */
  lastDoneAt?: string;
  intervalDays?: number;
}

interface TaskFormProps {
  initial?: Task | null;
  draft?: TaskDraft;
  onClose: () => void;
  onSave: (task: Task) => void;
}

type Field = 'kind' | 'typeId' | 'interval' | 'priority' | 'category' | 'seasonal' | 'notes' | 'cost';

/**
 * Add or edit a task. The first step asks only what, where and when; Homebase fills in the kind,
 * category, repeat interval, priority, seasonal flag and notes from what was typed. Everything
 * else is under "More options".
 */
export function TaskForm({ initial, draft, onClose, onSave }: TaskFormProps) {
  const { rooms, items, systems } = useData();
  const [kind, setKind] = useState<TaskKind>(initial?.kind ?? draft?.kind ?? 'maintenance');
  const [typeId, setTypeId] = useState(initial?.typeId ?? 'custom');
  const [name, setName] = useState(initial?.name ?? draft?.name ?? '');
  const [roomId, setRoomId] = useState(initial?.roomId ?? draft?.roomId ?? '');
  const [location, setLocation] = useState(initial?.location ?? draft?.location ?? '');
  const [itemId, setItemId] = useState(initial?.itemId ?? draft?.itemId ?? '');
  const [systemId, setSystemId] = useState(initial?.systemId ?? draft?.systemId ?? '');
  const [lastDoneAt, setLastDoneAt] = useState(initial?.lastDoneAt ?? draft?.lastDoneAt ?? toDateInput());
  const [interval, setInterval] = useState(String(initial?.intervalDays ?? draft?.intervalDays ?? 90));
  const [cost, setCost] = useState(initial?.cost != null ? String(initial.cost) : '');
  const [notes, setNotes] = useState(initial?.notes ?? draft?.notes ?? '');
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? draft?.priority ?? 'normal');
  const [category, setCategory] = useState<TaskCategory>(initial ? taskCategory(initial) : draft?.category ?? 'other');
  const [seasonal, setSeasonal] = useState(initial?.seasonal ?? draft?.seasonal ?? false);
  // Editing shows every field; adding starts with the three questions.
  const [advanced, setAdvanced] = useState(Boolean(initial));
  const [touched, setTouched] = useState<Set<Field>>(() => new Set(initial ? (['kind', 'typeId', 'interval', 'priority', 'category', 'seasonal', 'notes', 'cost'] as Field[]) : draft?.lastDoneAt ? (['interval', 'kind'] as Field[]) : []));
  const [guess, setGuess] = useState<TaskGuess | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // When: an existing task's due date, a draft's, or "this week" for something new.
  const initialDue = initial ? toDateInput(dueDateOf(initial)) : draft?.dueDate ?? (draft?.lastDoneAt && draft.intervalDays ? toDateInput(addDays(new Date(`${draft.lastDoneAt}T12:00:00`), draft.intervalDays)) : '');
  const [when, setWhen] = useState<When>(initialDue ? 'date' : 'week');
  const [pickedDate, setPickedDate] = useState(initialDue);
  const [whenTouched, setWhenTouched] = useState(false);

  const recurring = kind === 'maintenance';
  const belongings = useMemo(() => items.filter((item) => item.kind !== 'key'), [items]);
  const touch = (field: Field) => setTouched((t) => new Set(t).add(field));

  /** Fill every field the homeowner hasn't set themselves. */
  function apply(next: TaskGuess | null) {
    setGuess(next);
    if (!next) return;
    if (!touched.has('kind')) setKind(next.kind);
    if (!touched.has('typeId')) setTypeId(next.typeId);
    if (!touched.has('interval')) setInterval(String(next.intervalDays));
    if (!touched.has('priority')) setPriority(next.priority);
    if (!touched.has('category')) setCategory(next.category);
    if (!touched.has('seasonal')) setSeasonal(next.seasonal);
    if (!touched.has('notes') && next.notes) setNotes(next.notes);
    if (!touched.has('cost') && next.cost != null) setCost(String(next.cost));
  }

  function changeName(value: string) {
    setName(value);
    if (!initial) apply(inferTask(value));
  }

  function pickJob(id: string) {
    const g = guessForJob(id);
    if (!g) return;
    if (g.name) setName(g.name);
    apply(g);
  }

  function choosePreset(id: string) {
    touch('typeId');
    setTypeId(id);
    const preset = findType(id);
    if (id !== 'custom') {
      if (!name || TASK_PRESETS.some((p) => p.label === name)) setName(preset.label);
      setInterval(String(preset.lifespanDays));
      setCategory(preset.category);
      if (!cost) setCost(String(preset.cost));
    }
  }

  function save() {
    const next: Record<string, string> = {};
    const days = Math.round(Number(interval));
    const price = cost.trim() ? Number(cost) : undefined;
    const due = whenToDate(when, pickedDate);
    if (!name.trim()) next.name = 'Say what needs doing, like “Replace the furnace filter”.';
    if (when === 'date' && !isRealDate(due)) next.when = 'Pick a date.';
    if (recurring && !(days >= 1 && days <= 3650)) next.interval = 'Use a number of days between 1 and 3650.';
    if (recurring && !isRealDate(lastDoneAt)) next.lastDoneAt = 'Pick the date it was last done.';
    if (price !== undefined && !(price >= 0)) next.cost = 'Use a positive amount, or leave it empty.';
    setErrors(next);
    if (Object.keys(next).length) {
      if (next.interval || next.lastDoneAt || next.cost) setAdvanced(true);
      return;
    }

    const room = rooms.find((r) => r.id === roomId);
    const now = new Date().toISOString();
    // Recurring: "when" sets the next due date unless it's the normal schedule for an existing task.
    const scheduleChanged = !initial || whenTouched;
    const naturalDue = toDateInput(addDays(new Date(`${lastDoneAt}T12:00:00`), days));
    onSave({
      id: initial?.id ?? uid(),
      kind,
      name: name.trim(),
      typeId: recurring ? typeId : 'custom',
      location: room?.name ?? location.trim(),
      roomId: room?.id,
      itemId: itemId || undefined,
      systemId: systemId || undefined,
      lastDoneAt: recurring ? lastDoneAt : initial?.lastDoneAt ?? toDateInput(),
      intervalDays: recurring ? days : initial?.intervalDays ?? 30,
      recurring,
      dueDate: recurring ? undefined : due,
      nextDue: recurring ? (scheduleChanged ? (due === naturalDue ? undefined : due) : initial?.nextDue) : undefined,
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

  const summary = [
    kind === 'maintenance' ? `Repeats every ${formatInterval(Number(interval) || 90)}` : kind === 'repair' ? 'One-off repair' : 'Project',
    CATEGORY_META[category].label,
    PRIORITY_LABEL[priority],
    seasonal ? 'Seasonal' : null,
  ].filter(Boolean);

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
      <FormGroup>
        <TextField
          label="What needs doing?"
          value={name}
          onChange={(e) => changeName(e.target.value)}
          placeholder="Replace the furnace filter"
          error={errors.name}
          autoFocus={!initial}
          autoComplete="off"
        />
      </FormGroup>
      {!initial && !name && (
        <div className="chips form-chips" role="group" aria-label="Common jobs">
          {COMMON_JOBS.map((job) => (
            <button key={job.id} type="button" className="chip" onClick={() => pickJob(job.id)}>
              {job.label}
            </button>
          ))}
        </div>
      )}

      <Section title="Where is it?">
        <FormGroup>
          {!roomId && <TextField label="Place" optional value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Hallway return, under the kitchen sink" />}
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
        </FormGroup>
      </Section>

      <Section title={recurring ? 'When is it next due?' : 'When should it happen?'}>
        <Chips<When>
          label="When"
          value={when}
          onChange={(v) => {
            setWhen(v);
            setWhenTouched(true);
            if (v === 'date' && !pickedDate) setPickedDate(toDateInput(addDays(new Date(), 14)));
          }}
          options={WHEN_OPTIONS}
        />
        {when === 'date' && (
          <div className="form-group form-gap">
            <TextField label="Date" type="date" value={pickedDate} onChange={(e) => { setPickedDate(e.target.value); setWhenTouched(true); }} error={errors.when} />
          </div>
        )}
        {when !== 'date' && <p className="section-foot">Due {formatDate(whenToDate(when, pickedDate))}.</p>}
      </Section>

      {name.trim() && (
        <div className="suggest-box" aria-live="polite">
          <Sparkles size={18} />
          <div>
            <p className="suggest-title">{guess?.matched ? `Set up as “${guess.matched}”` : 'Homebase will save it as'}</p>
            <p className="suggest-body">{summary.join(' · ')}</p>
            {notes && !touched.has('notes') && <p className="suggest-note">Note added: {notes}</p>}
          </div>
        </div>
      )}

      <button type="button" className="disclosure" aria-expanded={advanced} aria-controls="task-more" onClick={() => setAdvanced((v) => !v)}>
        <ChevronDown size={18} />
        {advanced ? 'Fewer options' : 'More options: repeat, priority, cost, notes'}
      </button>

      {advanced && (
        <div id="task-more">
          <Section title="Kind of task">
            <Segmented<TaskKind>
              label="Kind of task"
              value={kind}
              onChange={(v) => {
                touch('kind');
                setKind(v);
              }}
              options={[
                { value: 'maintenance', label: 'Repeats' },
                { value: 'repair', label: 'Repair' },
                { value: 'project', label: 'Project' },
              ]}
            />
          </Section>

          {recurring && (
            <Section title="Schedule">
              <FormGroup>
                <SelectField label="Common jobs" value={typeId} onChange={(e) => choosePreset(e.target.value)} hint={typeId !== 'custom' ? `Usually every ${findType(typeId).lifespanDays} days` : undefined}>
                  <option value="custom">Something else</option>
                  {CATEGORY_ORDER.map((c) => (
                    <optgroup key={c} label={CATEGORY_META[c].label}>
                      {TASK_PRESETS.filter((p) => p.category === c && p.id !== 'custom').map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </SelectField>
                <TextField label="Last done" type="date" value={lastDoneAt} max={toDateInput()} onChange={(e) => setLastDoneAt(e.target.value)} error={errors.lastDoneAt} hint="Not sure? Leave it as today." />
                <div className="field">
                  <TextField label="Repeat every" inputMode="numeric" value={interval} onChange={(e) => { touch('interval'); setInterval(e.target.value); }} suffix="days" error={errors.interval} />
                  <Chips label="Common intervals" value={Number(interval)} onChange={(v) => { touch('interval'); setInterval(String(v)); }} options={INTERVALS} />
                </div>
              </FormGroup>
            </Section>
          )}

          <Section title="Details">
            <div className="form-segment">
              <span className="field-label" aria-hidden="true">
                Priority
              </span>
              <Segmented<TaskPriority>
                label="Priority"
                value={priority}
                onChange={(v) => {
                  touch('priority');
                  setPriority(v);
                }}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'high', label: 'High' },
                ]}
              />
            </div>
            <FormGroup>
              <SelectField label="Category" value={category} onChange={(e) => { touch('category'); setCategory(e.target.value as TaskCategory); }}>
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_META[c].label}
                  </option>
                ))}
              </SelectField>
              <TextField label={recurring ? 'Cost each time' : 'Estimated cost'} optional inputMode="decimal" prefix="$" value={cost} onChange={(e) => { touch('cost'); setCost(e.target.value); }} error={errors.cost} />
              <TextArea label="Notes" optional value={notes} onChange={(e) => { touch('notes'); setNotes(e.target.value); }} placeholder={recurring ? 'Filter size, part number…' : 'What needs doing, who to call…'} />
              {systems.length > 0 && (
                <SelectField label="For a home system" optional value={systemId} onChange={(e) => setSystemId(e.target.value)}>
                  <option value="">None</option>
                  {systems.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </SelectField>
              )}
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
              <div className="field is-switch">
                <span className="row-main">
                  <span className="field-label">Seasonal job</span>
                  <span className="field-hint">Shown with this season’s recommendations on Home.</span>
                </span>
                <Switch checked={seasonal} onChange={(v) => { touch('seasonal'); setSeasonal(v); }} label="Seasonal job" />
              </div>
            </FormGroup>
          </Section>
        </div>
      )}
    </Sheet>
  );
}
