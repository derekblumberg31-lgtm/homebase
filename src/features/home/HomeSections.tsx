import { useState, type ComponentType } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData, useStore } from '../../data/DataProvider';
import type { ActivityKind, Task } from '../../data/types';
import { addDays, formatDateShort, formatRelativeTime, toDateInput } from '../../lib/dates';
import {
  AlertTriangle,
  Calendar,
  Check,
  CircleCheck,
  Clock,
  DoorOpen,
  FileText,
  HeartPulse,
  House,
  Key,
  MoreHorizontal,
  Pencil,
  Plus,
  Thermometer,
  Trash2,
  Upload,
  type IconProps,
} from '../../ui/Icons';
import { Menu } from '../../ui/menu';
import { useToast } from '../../ui/overlays';
import { TaskForm } from '../tasks/TaskForm';
import { getTaskInfo } from '../tasks/taskMath';
import type { Alert, HealthCheck, SeasonalTip, SnapshotFact, TimelineMonth } from './insights';
import { completeTip, hideTip, planTip, resetTip, snoozeTip, wakeSnoozedTips } from './tipActions';

// ---------- Home overview: the one primary panel ----------

const FACT_ICON: Record<SnapshotFact['id'], ComponentType<IconProps>> = {
  age: House,
  rooms: DoorOpen,
  hvac: Thermometer,
  next: Calendar,
  health: HeartPulse,
};

export function HomeOverview({ headline, place, facts, alerts }: { headline: string; place?: string; facts: SnapshotFact[]; alerts: Alert[] }) {
  return (
    <section className="overview" aria-labelledby="overview-title">
      <div className="overview-head">
        <h2 id="overview-title" className="overview-title">
          {headline}
        </h2>
        {place && <p className="overview-place">{place}</p>}
      </div>

      <dl className="snapshot" aria-label="Home snapshot">
        {facts.map((fact) => {
          const Icon = FACT_ICON[fact.id];
          const body = (
            <>
              <dt>
                <Icon size={16} />
                {fact.label}
              </dt>
              <dd className={fact.tone ? `is-${fact.tone}` : undefined}>{fact.value}</dd>
              <dd className="snapshot-detail">{fact.detail}</dd>
            </>
          );
          return fact.href.startsWith('#') ? (
            <a key={fact.id} className="snapshot-fact" href={fact.href}>
              {body}
            </a>
          ) : (
            <Link key={fact.id} className="snapshot-fact" to={fact.href}>
              {body}
            </Link>
          );
        })}
      </dl>

      {alerts.length > 0 && (
        <div className="overview-alerts">
          <h3 className="overview-label">Needs attention</h3>
          <ul>
            {alerts.map((alert) => (
              <li key={alert.id}>
                <Link to={alert.href} className={`attention is-${alert.tone}`}>
                  <AlertTriangle size={16} />
                  <span className="attention-title">{alert.title}</span>
                  <span className="attention-detail">{alert.detail}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ---------- Home Health Check ----------

export function HealthModule({ health }: { health: HealthCheck }) {
  const [showAll, setShowAll] = useState(false);
  const next = health.next[0];
  const steps = showAll ? health.steps : health.next;
  const complete = health.done === health.total;

  return (
    <section className="module" id="home-health" aria-labelledby="health-title" tabIndex={-1}>
      <header className="module-head">
        <h2 id="health-title" className="module-title">
          Home Health Check
        </h2>
        <span className="module-aside">
          {health.done} of {health.total} steps
        </span>
      </header>

      <div className="health-meter">
        <span className="health-score">{health.score}%</span>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={health.score} aria-label="Home record complete">
          <span style={{ width: `${health.score}%` }} />
        </div>
      </div>
      <p className="module-lead">
        {complete ? 'Your home’s record is complete. Homebase has what it needs to remind you at the right time.' : 'Each step helps Homebase remind you about the right things at the right time.'}
      </p>

      {steps.length > 0 && (
        <ol className="steps">
          {steps.map((step) => (
            <li key={step.title} className={step.ok ? 'is-done' : undefined}>
              <Link to={step.href} className="step">
                <span className="step-mark" aria-hidden="true">
                  {step.ok && <Check size={13} strokeWidth={2.4} />}
                </span>
                <span className="step-text">
                  <span className="step-title">
                    {step.title}
                    {step.ok && <span className="visually-hidden"> (done)</span>}
                  </span>
                  {!step.ok && <span className="step-why">{step.why}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      <div className="module-foot">
        {next && (
          <Link className="button is-outline" to={next.href}>
            Continue setup
          </Link>
        )}
        <button type="button" className="text-button" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `See all ${health.total} steps`}
        </button>
      </div>
    </section>
  );
}

// ---------- Maintenance timeline ----------

export function MaintenanceTimeline({ months }: { months: TimelineMonth[] }) {
  return (
    <section className="module" aria-labelledby="timeline-title">
      <header className="module-head">
        <h2 id="timeline-title" className="module-title">
          Coming up
        </h2>
        <Link className="module-aside is-link" to="/tasks?view=schedule">
          Schedule
        </Link>
      </header>
      {months.length === 0 ? (
        <p className="module-empty">Nothing else is due in the next three months. Recurring tasks reappear here as they come due.</p>
      ) : (
        <div className="timeline">
          {months.map((month) => (
            <div key={month.key} className={`timeline-month ${month.key === 'overdue' ? 'is-overdue' : ''}`}>
              <h3 className="timeline-label">{month.label}</h3>
              <ol>
                {month.entries.map((entry) => (
                  <li key={entry.id} className={`timeline-entry is-${entry.kind} ${entry.overdue ? 'is-overdue' : ''}`}>
                    <Link to={entry.href}>
                      <time dateTime={toDateInput(entry.date)} className="timeline-date">
                        {entry.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </time>
                      <span className="timeline-text">
                        <span className="timeline-title">{entry.title}</span>
                        {entry.detail && <span className="timeline-detail">{entry.detail}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------- Seasonal recommendations ----------

export function SeasonalSection({ season, tips, snoozed }: { season: string; tips: SeasonalTip[]; snoozed: number }) {
  const store = useStore();
  const data = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const [planning, setPlanning] = useState<SeasonalTip | null>(null);

  if (tips.length === 0 && snoozed === 0) return null;

  async function act(run: () => Promise<unknown>, error = 'That wasn’t saved. Try again.') {
    try {
      await run();
    } catch {
      toast(error, { tone: 'error' });
    }
  }

  return (
    <section className="module" aria-labelledby="season-title">
      <header className="module-head">
        <h2 id="season-title" className="module-title">
          For {season}
        </h2>
        <span className="module-aside">Seasonal</span>
      </header>

      {tips.length > 0 && (
        <ul className="tips">
          {tips.map((tip) => {
            const task = tip.status?.taskId ? data.tasks.find((t) => t.id === tip.status!.taskId) : undefined;
            const state = tip.status?.state;
            return (
              <li key={tip.id} className={`tip ${state ? `is-${state}` : ''}`}>
                <span className="tip-mark" aria-hidden="true">
                  {state === 'done' ? <CircleCheck size={18} /> : state === 'planned' ? <Calendar size={18} /> : <span className="tip-dot" />}
                </span>
                <div className="tip-text">
                  <p className="tip-title">{tip.title}</p>
                  <p className="tip-why">
                    {state === 'done'
                      ? 'Done this season. Logged in Service History.'
                      : state === 'planned'
                        ? task
                          ? `Planned · due ${formatDateShort(getTaskInfo(task, Date.now()).dueDate)}`
                          : 'Planned'
                        : tip.why}
                  </p>
                </div>
                <div className="tip-actions">
                  {!state && (
                    <button type="button" className="button is-small is-quiet" onClick={() => setPlanning(tip)}>
                      Plan
                    </button>
                  )}
                  {state === 'planned' && task && (
                    <Link className="button is-small is-quiet" to={`/tasks/${task.id}`}>
                      Open
                    </Link>
                  )}
                  <Menu
                    label={`More for ${tip.title}`}
                    triggerClassName="icon-button"
                    trigger={<MoreHorizontal size={18} />}
                    items={
                      state
                        ? [{ id: 'reset', label: state === 'done' ? 'Not done after all' : 'Back to suggestions', icon: Clock, onSelect: () => void act(() => resetTip(store, tip)) }]
                        : [
                            {
                              id: 'snooze',
                              label: 'Snooze for two weeks',
                              icon: Clock,
                              onSelect: () =>
                                void act(async () => {
                                  const { until, undo } = await snoozeTip(store, tip);
                                  toast(`Snoozed until ${formatDateShort(until)}`, { action: { label: 'Undo', run: () => void undo() } });
                                }),
                            },
                            {
                              id: 'done',
                              label: 'Already done',
                              hint: 'Log it in Service History',
                              icon: Check,
                              onSelect: () =>
                                void act(async () => {
                                  const undo = await completeTip(store, tip);
                                  toast(`${tip.taskName} logged`, { action: { label: 'Undo', run: () => void undo() } });
                                }),
                            },
                            {
                              id: 'hide',
                              label: 'Hide for this season',
                              icon: Trash2,
                              tone: 'danger',
                              onSelect: () =>
                                void act(async () => {
                                  const undo = await hideTip(store, tip);
                                  toast('Hidden until next season', { action: { label: 'Undo', run: () => void undo() } });
                                }),
                            },
                          ]
                    }
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {snoozed > 0 && (
        <p className="module-note">
          {snoozed} snoozed for now.{' '}
          <button type="button" className="text-button" onClick={() => void act(() => wakeSnoozedTips(store))}>
            Show {snoozed === 1 ? 'it' : 'them'} again
          </button>
        </p>
      )}

      {planning && (
        <TaskForm
          // A seasonal job comes round once a year; start it two weeks out so it's on the list now.
          draft={{ name: planning.taskName, kind: 'maintenance', category: planning.category, seasonal: true, intervalDays: 365, lastDoneAt: toDateInput(addDays(new Date(), 14 - 365)) }}
          onClose={() => setPlanning(null)}
          onSave={(task: Task) =>
            void act(async () => {
              await planTip(store, planning, task);
              setPlanning(null);
              toast(`${task.name} added to Tasks`, { action: { label: 'Open', run: () => navigate(`/tasks/${task.id}`) } });
            })
          }
        />
      )}
    </section>
  );
}

// ---------- Activity ----------

const ACTIVITY_ICON: Partial<Record<ActivityKind, ComponentType<IconProps>>> = {
  'task-done': CircleCheck,
  'task-added': Plus,
  'task-removed': Trash2,
  'item-added': Plus,
  'key-added': Key,
  'record-added': FileText,
  'property-updated': Pencil,
  import: Upload,
};

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export function ActivityFeed({ now, health, limit = 5 }: { now: number; health: HealthCheck; limit?: number }) {
  const data = useData();
  const since = new Date(now - MONTH_MS).toISOString();
  const doneCount = data.serviceEvents.filter((e) => e.createdAt >= since).length;
  const addedCount = data.activity.filter((a) => a.at >= since && (a.kind === 'record-added' || a.kind === 'item-added' || a.kind === 'key-added' || a.kind === 'task-added' || a.kind === 'import')).length;
  const entries = data.activity.slice(0, limit);

  return (
    <section className="module" aria-labelledby="activity-title">
      <header className="module-head">
        <h2 id="activity-title" className="module-title">
          Activity
        </h2>
        {data.serviceEvents.length > 0 && (
          <Link className="module-aside is-link" to="/records/service-history">
            Service History
          </Link>
        )}
      </header>

      <dl className="tally" aria-label="Last 30 days">
        <div>
          <dt>Jobs done</dt>
          <dd>{doneCount}</dd>
        </div>
        <div>
          <dt>Things added</dt>
          <dd>{addedCount}</dd>
        </div>
        <div>
          <dt>Setup</dt>
          <dd>{health.score}%</dd>
        </div>
      </dl>
      <p className="tally-note">Last 30 days</p>

      {entries.length === 0 ? (
        <p className="module-empty">
          When you finish a job or file a receipt, it shows up here.{' '}
          {data.tasks.length ? <Link to="/tasks">Mark something done</Link> : <Link to="/tasks?new=1&kind=maintenance">Add your first task</Link>} to start your home’s history.
        </p>
      ) : (
        <ul className="feed">
          {entries.map((entry) => {
            const Icon = ACTIVITY_ICON[entry.kind] ?? Clock;
            const content = (
              <>
                <Icon size={16} className="feed-icon" />
                <span className="feed-text">{entry.text}</span>
                <time className="feed-time" dateTime={entry.at}>
                  {formatRelativeTime(entry.at, now)}
                </time>
              </>
            );
            return (
              <li key={entry.id}>
                {entry.href ? (
                  <Link className="feed-row" to={entry.href}>
                    {content}
                  </Link>
                ) : (
                  <div className="feed-row">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

