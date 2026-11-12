import { useState, type ComponentType, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData, useStore } from '../../data/DataProvider';
import type { ActivityKind, Task } from '../../data/types';
import { formatDateShort, formatRelativeTime, toDateInput } from '../../lib/dates';
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronRight,
  CircleCheck,
  Clock,
  Download,
  FileText,
  Key,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
  type IconProps,
} from '../../ui/Icons';
import { Group, Row, Section } from '../../ui/layout';
import { Menu } from '../../ui/menu';
import { useToast } from '../../ui/overlays';
import { TaskForm } from '../tasks/TaskForm';
import { getTaskInfo } from '../tasks/taskMath';
import type { Alert, AttentionItem, HomeStatus, SeasonalTip, SnapshotFact, TimelineMonth } from './insights';
import { completeTip, hideTip, planDraftFor, planTip, resetTip, snoozeTip, wakeSnoozedTips } from './tipActions';

// ---------- Home status sentence and alert rows ----------

/** The sentence under the greeting. Only the overdue clause is brick; the rest stays grey. */
export function HomeStatusLine({ status }: { status: HomeStatus }) {
  if (status.tone !== 'overdue') return <span className="home-status">{status.text}</span>;
  const [first, second] = status.clauses;
  return (
    <span className="home-status">
      <span className="home-status-clause is-overdue">{first}</span>
      {second && `, and ${second}`}
    </span>
  );
}

export function HomeAlertRow({
  title,
  detail,
  lead,
  href,
  onSelect,
  onDismiss,
}: {
  title: string;
  detail: string;
  lead: ReactNode;
  href?: string;
  onSelect?: () => void;
  onDismiss: () => void;
}) {
  const body = (
    <>
      <span className="row-lead">{lead}</span>
      <span className="row-main">
        <span className="row-title is-wrap">{title}</span>
        <span className="row-sub">{detail}</span>
      </span>
      <ChevronRight size={17} className="row-chevron" />
    </>
  );
  return (
    <li className="row-wrap home-alert-row">
      {onSelect || !href ? (
        <button type="button" className="row" onClick={onSelect}>
          {body}
        </button>
      ) : (
        <Link className="row" to={href}>
          {body}
        </Link>
      )}
      <button type="button" className="home-alert-dismiss" aria-label={`Hide from Home: ${title}`} onClick={onDismiss}>
        <X size={16} />
      </button>
    </li>
  );
}

export function HomeAlertRows({
  rows,
  more,
  onDismiss,
  onBackup,
}: {
  rows: AttentionItem[];
  more: AttentionItem[];
  onDismiss: (item: AttentionItem) => void;
  /** Tap on the backup row. Until it is passed, the backup row links to its href. */
  onBackup?: () => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="section home-alerts" aria-labelledby="home-alerts-title">
      <h2 id="home-alerts-title" className="visually-hidden">
        Needs a look
      </h2>
      <ul className="group">
        {rows.map((item) => (
          <HomeAlertRow
            key={item.id}
            title={item.title}
            detail={item.detail}
            lead={item.kind === 'backup' ? <Download size={18} /> : <AlertTriangle size={18} className="home-alert-icon" />}
            href={item.href}
            onSelect={item.kind === 'backup' ? onBackup : undefined}
            onDismiss={() => onDismiss(item)}
          />
        ))}
      </ul>
      {more.length > 0 && (
        <p className="section-foot">
          <Link to={more.length === 1 ? more[0].href : '/home/health'}>{more.length === 1 ? '1 more needs a look' : `${more.length} more need a look`}</Link>
        </p>
      )}
    </section>
  );
}

// ---------- Home overview: the one primary panel ----------

/** The home at a glance: plain key and value rows, then what needs a look. No tiles, no icons. */
export function HomeOverview({ facts, alerts }: { facts: SnapshotFact[]; alerts: Alert[] }) {
  return (
    <>
      <Section title="Your home at a glance">
        <Group>
          {facts.map((fact) => {
            const none = fact.id === 'rooms' && fact.value === '0';
            return (
              <Row
                key={fact.id}
                title={fact.label}
                sub={none ? undefined : fact.detail}
                value={<span className={fact.tone ? `kv-value is-${fact.tone}` : 'kv-value'}>{none ? 'None yet' : fact.value}</span>}
                to={fact.href}
                chevron
              />
            );
          })}
        </Group>
      </Section>
      {alerts.length > 0 && (
        <Section title="Needs attention">
          <Group>
            {alerts.map((alert) => (
              <Row key={alert.id} title={alert.title} sub={alert.detail} lead={<AlertTriangle size={18} className="home-alert-icon" />} to={alert.href} wrap />
            ))}
          </Group>
        </Section>
      )}
    </>
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
                      ? 'Done this season. Logged in Service history.'
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
                              hint: 'Log it in Service history',
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
          draft={planDraftFor(planning, Date.now())}
          onClose={() => setPlanning(null)}
          onSave={async (task: Task) => {
            await planTip(store, planning, task);
            setPlanning(null);
            toast(`${task.name} added to Tasks`, { action: { label: 'Open', run: () => navigate(`/tasks/${task.id}`) } });
          }}
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

export function ActivityFeed({ now, limit = 5 }: { now: number; limit?: number }) {
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
            Service history
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

