import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData, useStore } from '../../data/DataProvider';
import { uid } from '../../data/ids';
import type { Task } from '../../data/types';
import { addDays, toDateInput } from '../../lib/dates';
import { TextArea } from '../../ui/controls';
import { Check } from '../../ui/Icons';
import { Section } from '../../ui/layout';
import { Sheet, useToast } from '../../ui/overlays';
import { SystemSheet } from '../property/SystemsPage';
import { RecordForm } from '../records/RecordForm';
import { starterCheckFor, type StarterStep } from './starter';
import { markNotApplicable, markTested, reopenStep, saveLocation } from './starterActions';

/**
 * The starter Home Health Check, as one list: a progress line, then the steps in two groups, safety
 * first. Every step says why it matters and how long it takes, and has one plain text action.
 */
export function StarterChecklist() {
  const data = useData();
  const check = useMemo(() => starterCheckFor(data), [data]);
  const [active, setActive] = useState<StarterStep | null>(null);

  const safety = check.steps.filter((step) => step.priority === 'high');
  const then = check.steps.filter((step) => step.priority !== 'high');

  return (
    <section className="health" aria-label="Starter checklist">
      <div className="health-meter">
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={check.total} aria-valuenow={check.done} aria-label="Home Health Check progress">
          <span style={{ width: `${check.score}%` }} />
        </div>
      </div>
      {check.complete && <p className="page-note">Every step is done. Your shutoffs, alarms, systems and an emergency contact are on record.</p>}
      {[
        { title: 'Safety first', steps: safety },
        { title: 'Then', steps: then },
      ]
        .filter((group) => group.steps.length > 0)
        .map((group) => (
          <Section key={group.title} title={group.title}>
            <ol className="group health-steps">
              {group.steps.map((step) => (
                <HealthStepRow key={step.id} step={step} onStart={() => setActive(step)} />
              ))}
            </ol>
          </Section>
        ))}
      {active && <StepSheet step={active} onClose={() => setActive(null)} />}
    </section>
  );
}

function HealthStepRow({ step, onStart }: { step: StarterStep; onStart: () => void }) {
  const store = useStore();
  const toast = useToast();
  const done = step.status === 'done';
  const na = step.status === 'not-applicable';

  async function run(fn: () => Promise<() => unknown>, message: string) {
    try {
      const undo = await fn();
      toast(message, { action: { label: 'Undo', run: () => void undo() } });
    } catch {
      toast('That wasn’t saved. Try again.', { tone: 'error' });
    }
  }

  return (
    <li className={`row health-step ${done ? 'is-done' : ''} ${na ? 'is-na' : ''}`}>
      <span className="row-lead health-mark-cell" aria-hidden="true">
        <span className="health-mark">{done && <Check size={14} strokeWidth={2.6} />}</span>
      </span>
      <div className="health-body">
        <div className="health-line">
          <h3 className="health-title">
            {step.title}
            <span className="visually-hidden">{done ? ' (done)' : na ? ' (doesn’t apply)' : ' (not done)'}</span>
          </h3>
          <span className="health-minutes">{done ? 'Done' : na ? 'Doesn’t apply' : `About ${step.minutes} min`}</span>
        </div>
        {done && step.saved?.note ? <p className="health-why">Saved: {step.saved.note}</p> : !done && !na && <p className="health-why">{step.why}</p>}
        {done && step.auto && <p className="health-why">Done because it’s already in Homebase.</p>}
        <div className="health-actions">
          {!done && !na && (
            <button type="button" className="text-button is-strong" onClick={onStart}>
              {step.action.label} <span aria-hidden="true">›</span>
            </button>
          )}
          {!done && !na && step.optional && (
            <button type="button" className="text-button" onClick={() => void run(() => markNotApplicable(store, step.id), 'Marked as not applying to this home')}>
              {step.optional.label}
            </button>
          )}
          {(na || (done && !step.auto)) && (
            <button type="button" className="text-button" onClick={() => void run(() => reopenStep(store, step.id), `${step.title}: marked not done`)}>
              {na ? 'It does apply' : 'Mark not done'}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/** The sheet behind a step's button. */
function StepSheet({ step, onClose }: { step: StarterStep; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [where, setWhere] = useState(step.saved?.note ?? '');
  const [error, setError] = useState('');
  const action = step.action;

  if (action.type === 'system') {
    return (
      <SystemSheet
        draftKind={action.kind}
        onClose={onClose}
        onSave={async (system) => {
          await store.put('systems', system);
          await store.log('item-added', `Health Check: added ${system.name}`, `/property/systems/${system.id}`);
          onClose();
          toast(`${system.name} saved. Step done.`, { action: { label: 'Open', run: () => navigate(`/property/systems/${system.id}`) } });
        }}
      />
    );
  }

  if (action.type === 'contact') {
    return (
      <RecordForm
        draft={{ kind: 'contractor' }}
        onClose={onClose}
        onSaved={(r) => {
          onClose();
          toast(`${r.title} saved. Step done.`, { action: { label: 'Open', run: () => navigate(`/records/${r.id}`) } });
        }}
      />
    );
  }

  if (action.type === 'locate') {
    return (
      <Sheet
        title={step.title}
        onClose={onClose}
        leading={<button type="button" className="sheet-action" onClick={onClose}>Cancel</button>}
        trailing={
          <button
            type="button"
            className="sheet-action is-strong"
            onClick={async () => {
              if (!where.trim()) return setError('Say where it is, even roughly. You can change it later.');
              try {
                const undo = await saveLocation(store, step.id, where.trim());
                onClose();
                toast(`Saved. The Assistant will remind you where it is.`, { action: { label: 'Undo', run: () => void undo() } });
              } catch {
                setError('That wasn’t saved. Try again.');
              }
            }}
          >
            Save
          </button>
        }
      >
        <p className="sheet-lead">{step.why}</p>
        <h3 className="sheet-subhead">Where to look</h3>
        <ul className="plain-list">
          {action.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
        <div className="form-group">
          <TextArea label={action.prompt} value={where} onChange={(e) => setWhere(e.target.value)} placeholder={action.placeholder} rows={3} error={error} />
        </div>
        <p className="section-foot">Saved as a household note in Records, so it’s in your backup too.</p>
      </Sheet>
    );
  }

  // Alarm tests.
  const coStep = step.id === 'co-alarms';
  return (
    <Sheet title={step.title} onClose={onClose}>
      <p className="sheet-lead">{step.why}</p>
      <h3 className="sheet-subhead">How to test</h3>
      <ol className="plain-list is-numbered">
        {action.how.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
      <div className="button-stack">
        <button
          type="button"
          className="button is-primary is-block"
          onClick={async () => {
            try {
              const { undo } = await markTested(store, step.id);
              onClose();
              toast(`Logged, and a monthly job is on your list.`, { action: { label: 'Undo', run: () => void undo() } });
            } catch {
              toast('That wasn’t saved. Try again.', { tone: 'error' });
            }
          }}
        >
          <Check size={18} /> All tested and working
        </button>
        <button
          type="button"
          className="button is-secondary is-block"
          onClick={async () => {
            const now = new Date().toISOString();
            const task: Task = {
              id: uid(),
              kind: 'repair',
              name: coStep ? 'Buy and install CO alarms' : 'Replace a failed smoke alarm',
              typeId: 'custom',
              location: '',
              lastDoneAt: toDateInput(),
              intervalDays: 30,
              recurring: false,
              dueDate: toDateInput(addDays(new Date(), 3)),
              status: 'open',
              priority: 'high',
              category: 'safety',
              notes: coStep ? 'One on every level and near sleeping areas.' : 'Replace alarms over 10 years old. Check the date on the back.',
              createdAt: now,
              updatedAt: now,
            };
            await store.put('tasks', task);
            await store.log('task-added', `Added: ${task.name}`, `/tasks/${task.id}`);
            onClose();
            toast(`${task.name} added, due in 3 days`, { action: { label: 'Open', run: () => navigate(`/tasks/${task.id}`) } });
          }}
        >
          {coStep ? 'We don’t have one yet: add a task' : 'One failed: add a repair task'}
        </button>
      </div>
    </Sheet>
  );
}
