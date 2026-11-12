import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData, useStore } from '../../data/DataProvider';
import { uid } from '../../data/ids';
import type { Task } from '../../data/types';
import { addDays, toDateInput } from '../../lib/dates';
import { TextArea } from '../../ui/controls';
import { Check, Clock } from '../../ui/Icons';
import { Sheet, useToast } from '../../ui/overlays';
import { SystemSheet } from '../property/SystemsPage';
import { RecordForm } from '../records/RecordForm';
import { starterCheckFor, type StarterStep } from './starter';
import { markNotApplicable, markTested, reopenStep, saveLocation } from './starterActions';

/**
 * The starter Home Health Check. Every step says why it matters, how long it takes, how urgent it
 * is, whether it's done, and has one clear button that does the job (or saves the result).
 */
export function StarterChecklist({ compact = false }: { compact?: boolean }) {
  const data = useData();
  const check = useMemo(() => starterCheckFor(data), [data]);
  const [active, setActive] = useState<StarterStep | null>(null);

  const open = check.steps.filter((s) => s.status === 'todo');
  // On Home: the next three open steps, most urgent first. On its own page: all of them.
  const shown = compact ? [...open].sort((a, b) => Number(b.priority === 'high') - Number(a.priority === 'high')).slice(0, 3) : check.steps;

  return (
    <section className="module health" aria-labelledby={compact ? 'health-title' : undefined} aria-label={compact ? undefined : 'Starter checklist'}>
      {compact && (
        <header className="module-head">
          <h2 id="health-title" className="module-title">
            Home Health Check
          </h2>
          <Link className="module-aside is-link" to="/home/health">
            All {check.steps.length} steps
          </Link>
        </header>
      )}
      <div className="health-meter">
        <span className="health-score">
          {check.done} of {check.total} done
        </span>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={check.total} aria-valuenow={check.done} aria-label="Home Health Check progress">
          <span style={{ width: `${check.score}%` }} />
        </div>
        {!check.complete && <span className="health-time">About {check.minutesLeft} min left</span>}
      </div>
      {compact && check.done === 0 && (
        <p className="module-lead">
          <span className="health-tag">Starter checklist</span> Eight things every home should have sorted before something goes wrong. Start with the first one; it takes about 10 minutes.
        </p>
      )}
      {check.complete ? (
        <p className="module-lead">Every step is done. Your shutoffs, alarms, systems and an emergency contact are on record.</p>
      ) : (
        <ol className="health-steps">
          {shown.map((step) => (
            <HealthStepCard key={step.id} step={step} onStart={() => setActive(step)} />
          ))}
        </ol>
      )}
      {active && <StepSheet step={active} onClose={() => setActive(null)} />}
    </section>
  );
}

function HealthStepCard({ step, onStart }: { step: StarterStep; onStart: () => void }) {
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
    <li className={`health-step ${done ? 'is-done' : ''} ${na ? 'is-na' : ''} ${step.priority === 'high' && !done && !na ? 'is-high' : ''}`}>
      <span className="health-mark" aria-hidden="true">
        {done && <Check size={15} strokeWidth={2.6} />}
      </span>
      <div className="health-body">
        <h3 className="health-title">
          {step.title}
          <span className="visually-hidden">{done ? ' (done)' : na ? ' (doesn’t apply)' : ' (not done)'}</span>
        </h3>
        <p className="health-meta">
          {done ? (
            <span className="pill is-good">Done</span>
          ) : na ? (
            <span className="pill">Doesn’t apply</span>
          ) : (
            <>
              <span className="pill">{step.priority === 'high' ? 'High priority' : 'Normal priority'}</span>
              <span className="pill is-plain">
                <Clock size={14} /> About {step.minutes} min
              </span>
            </>
          )}
        </p>
        {done && step.saved?.note ? <p className="health-why">Saved: {step.saved.note}</p> : !done && !na && <p className="health-why">{step.why}</p>}
        {done && step.auto && <p className="health-why">Done because it’s already in Homebase.</p>}
        <div className="health-actions">
          {!done && !na && (
            <button type="button" className="button is-primary is-small" onClick={onStart}>
              {step.action.label}
            </button>
          )}
          {!done && !na && step.optional && (
            <button type="button" className="button is-quiet is-small" onClick={() => void run(() => markNotApplicable(store, step.id), 'Marked as not applying to this home')}>
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
