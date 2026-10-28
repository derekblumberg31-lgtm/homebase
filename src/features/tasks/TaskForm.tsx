import { useMemo, useState } from 'react';
import { useData } from '../../data/DataProvider';
import { uid } from '../../data/ids';
import type { Task, TaskKind } from '../../data/types';
import { isRealDate, toDateInput } from '../../lib/dates';
import { Chips, FormGroup, Segmented, SelectField, TextArea, TextField } from '../../ui/controls';
import { Section } from '../../ui/layout';
import { Sheet } from '../../ui/overlays';
import { CATEGORY_META, CATEGORY_ORDER, TASK_PRESETS, findType } from './presets';

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
  const [lastDoneAt, setLastDoneAt] = useState(initial?.lastDoneAt ?? toDateInput());
  const [interval, setInterval] = useState(String(initial?.intervalDays ?? 90));
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '');
  const [cost, setCost] = useState(initial?.cost != null ? String(initial.cost) : '');
  const [notes, setNotes] = useState(initial?.notes ?? draft?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const recurring = kind === 'maintenance';
  const belongings = useMemo(() => items.filter((item) => item.kind !== 'key'), [items]);

  function choosePreset(id: string) {
    setTypeId(id);
    const preset = findType(id);
    if (id !== 'custom') {
      if (!name || TASK_PRESETS.some((p) => p.label === name)) setName(preset.label);
      setInterval(String(preset.lifespanDays));
      if (!cost) setCost(String(preset.cost));
    }
  }

  function save() {
    const next: Record<string, string> = {};
    const days = Math.round(Number(interval));
    const price = cost.trim() ? Number(cost) : undefined;
    if (!name.trim()) next.name = 'Give the task a name.';
    if (recurring && !(days >= 1 && days <= 3650)) next.interval = 'Use a number of days between 1 and 3650.';
    if (recurring && !isRealDate(lastDoneAt)) next.lastDoneAt = 'Pick the date it was last done.';
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
      lastDoneAt: recurring ? lastDoneAt : initial?.lastDoneAt ?? toDateInput(),
      intervalDays: recurring ? days : initial?.intervalDays ?? 30,
      recurring,
      dueDate: recurring ? undefined : dueDate || toDateInput(),
      status: initial?.status === 'done' && !recurring ? 'done' : 'open',
      cost: price,
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
              <TextField label="Last done" type="date" value={lastDoneAt} max={toDateInput()} onChange={(e) => setLastDoneAt(e.target.value)} error={errors.lastDoneAt} />
              <div className="field">
                <TextField label="Repeat every" inputMode="numeric" value={interval} onChange={(e) => setInterval(e.target.value)} suffix="days" error={errors.interval} />
                <Chips label="Common intervals" value={Number(interval)} onChange={(v) => setInterval(String(v))} options={INTERVALS} />
              </div>
            </>
          ) : (
            <TextField label="Do by" optional type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} error={errors.dueDate} hint="Leave empty for today." />
          )}
          <TextField label={recurring ? 'Cost each time' : 'Estimated cost'} optional inputMode="decimal" prefix="$" value={cost} onChange={(e) => setCost(e.target.value)} error={errors.cost} />
          <TextArea label="Notes" optional value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={recurring ? 'Filter size, part number…' : 'What needs doing, who to call…'} />
        </FormGroup>
      </Section>
    </Sheet>
  );
}
