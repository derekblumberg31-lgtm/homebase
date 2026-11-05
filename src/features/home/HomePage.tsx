import { useMemo, type ComponentType } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { QuickAdd } from '../../app/QuickAdd';
import { useData, useNow, useStore } from '../../data/DataProvider';
import type { Task } from '../../data/types';
import { formatDate, formatRelativeTime, toDateInput } from '../../lib/dates';
import { useSession } from '../../session/session';
import {
  AlertTriangle,
  Camera,
  Check,
  CircleCheck,
  Clock,
  FileText,
  Folder,
  Key,
  MessageCircle,
  Phone,
  Plus,
  Thermometer,
  User,
  Wrench,
  X,
  type IconProps,
} from '../../ui/Icons';
import { useToast } from '../../ui/overlays';
import { snoozeTask } from '../tasks/actions';
import { TaskRow } from '../tasks/components';
import { compareUrgency, countdownText, withInfo, type TaskItem } from '../tasks/taskMath';
import { taskPriority } from '../tasks/meta';
import { useTaskActions } from '../tasks/useTaskActions';
import { StarterChecklist } from './HealthCheck';
import { alertsFor, seasonalTipsFor, type Alert } from './insights';
import { starterCheckFor } from './starter';

function greeting(now: number) {
  const hour = new Date(now).getHours();
  return hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

function endOfMonth(now: number) {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
}

const today = () => toDateInput();

/** The quick actions on Home. Each opens the same form its area uses. */
export const QUICK_ACTIONS: { id: string; label: string; hint: string; to: string; icon: ComponentType<IconProps> }[] = [
  { id: 'ask', label: 'Ask about a problem', hint: 'Leak, no heat, beeping', to: '/assistant', icon: MessageCircle },
  { id: 'task', label: 'Add a task', hint: 'Repair or reminder', to: '/tasks?new=1', icon: Plus },
  { id: 'system', label: 'Add a home system', hint: 'Furnace, AC, water heater', to: '/property/systems?new=heating', icon: Thermometer },
  { id: 'paper', label: 'Upload a warranty or manual', hint: 'Photo or PDF', to: '/records?new=warranty', icon: FileText },
  { id: 'contractor', label: 'Save a contractor', hint: 'Plumber, electrician', to: '/records?new=contractor', icon: Phone },
  { id: 'damage', label: 'Document damage', hint: 'Photos for insurance', to: '', icon: Camera },
];

export function damageReportHref(what = '') {
  const date = today();
  const title = `Damage report${what ? `: ${what}` : ''}, ${formatDate(date)}`;
  const notes = ['What happened:', 'When it was noticed:', 'Rooms and items affected:', 'What was done to stop it:', 'Insurance claim number:'].join('\n');
  return `/records?new=other&title=${encodeURIComponent(title)}&notes=${encodeURIComponent(notes)}`;
}

/**
 * Home answers "what should I do next?": what needs attention, what's due this month, the Health
 * Check's next steps, quick actions, the home's records, and recent activity.
 */
export function HomePage() {
  const data = useData();
  const session = useSession();
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const welcome = params.get('welcome') === '1';

  const open = useMemo(() => withInfo(data.tasks.filter((t) => t.status === 'open'), now).sort(compareUrgency), [data.tasks, now]);
  const alerts = useMemo(() => alertsFor(data, now), [data, now]);
  const starter = useMemo(() => starterCheckFor(data), [data]);
  const seasonal = useMemo(() => seasonalTipsFor(data, now).tips.filter((t) => !t.status), [data, now]);

  const overdue = open.filter((i) => i.info.status === 'overdue');
  // Urgent but not yet late: high-priority jobs due within a week.
  const urgentSoon = open.filter((i) => i.info.status !== 'overdue' && taskPriority(i.task) === 'high' && i.info.daysLeft <= 7);
  const otherAlerts = alerts.filter((a) => a.tone !== 'overdue');
  const attentionCount = overdue.length + urgentSoon.length + otherAlerts.length;
  const monthEnd = endOfMonth(now);
  const shownInAttention = new Set([...overdue, ...urgentSoon].map((i) => i.task.id));
  const dueThisMonth = open.filter((i) => !shownInAttention.has(i.task.id) && i.info.dueDate.getTime() <= monthEnd);

  const status = overdue.length
    ? `${overdue.length} overdue · ${dueThisMonth.length} more due this month`
    : attentionCount
      ? `${attentionCount} ${attentionCount === 1 ? 'thing needs' : 'things need'} attention`
      : !starter.complete
        ? `Next: ${starter.next?.title.toLowerCase()} (about ${starter.next?.minutes} min)`
        : open.length
          ? `Nothing urgent. Next job: ${open[0].task.name}, ${countdownText(open[0].info)}`
          : 'Nothing urgent';

  return (
    <div className="page is-wide home">
      <header className="page-head">
        <div>
          <h1 className="page-title">
            {greeting(now)}, {session.firstName ?? 'there'}
          </h1>
          <p className={`page-sub home-status ${overdue.length ? 'is-overdue' : ''}`}>{status}</p>
        </div>
        <div className="page-actions">
          <span className="mobile-only">
            <QuickAdd variant="header" />
          </span>
          <Link className="round-button profile-button" to="/settings" aria-label="Settings">
            <User size={19} />
          </Link>
        </div>
      </header>

      {welcome && (
        <div className="welcome-banner" role="status">
          <CircleCheck size={22} />
          <div>
            <p className="welcome-title">Your starter Home Health Check is ready</p>
            <p className="welcome-body">
              {starter.total} steps, about {starter.minutesLeft} minutes in all. Do the high-priority ones first; each one saves something you’ll want in an emergency.
            </p>
          </div>
          <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setParams({}, { replace: true })}>
            <X size={18} />
          </button>
        </div>
      )}

      <div className="home-layout">
        <div className="home-primary">
          {attentionCount === 0 && !starter.complete ? (
            // Nothing urgent yet: the Health Check is the most useful thing to do, so it leads.
            <>
              <StarterChecklist compact />
              <DueThisMonth items={dueThisMonth} now={now} hasTasks={open.length > 0} seasonal={seasonal.length} />
              <NeedsAttention overdue={overdue} urgentSoon={urgentSoon} alerts={otherAlerts} now={now} />
            </>
          ) : (
            <>
              <NeedsAttention overdue={overdue} urgentSoon={urgentSoon} alerts={otherAlerts} now={now} />
              <DueThisMonth items={dueThisMonth} now={now} hasTasks={open.length > 0} seasonal={seasonal.length} />
              <StarterChecklist compact />
            </>
          )}
        </div>
        <div className="home-secondary">
          <QuickActions />
          <YourHome />
          <BackupNote now={now} />
          <RecentActivity now={now} />
        </div>
      </div>
    </div>
  );
}


// ---------- Needs attention ----------

function NeedsAttention({ overdue, urgentSoon, alerts, now }: { overdue: TaskItem[]; urgentSoon: TaskItem[]; alerts: Alert[]; now: number }) {
  const total = overdue.length + urgentSoon.length + alerts.length;
  return (
    <section className="module attention-module" aria-labelledby="attention-title">
      <header className="module-head">
        <h2 id="attention-title" className="module-title">
          Needs attention
        </h2>
        {total > 0 && <span className="count-badge is-urgent">{total}</span>}
      </header>
      {total === 0 ? (
        <p className="module-empty is-good">
          <CircleCheck size={18} /> Nothing is overdue or urgent. Overdue jobs, ending warranties and aging systems will show here.
        </p>
      ) : (
        <ul className="attention-list">
          {overdue.map((item) => (
            <TaskAttention key={item.task.id} item={item} tone="overdue" now={now} />
          ))}
          {urgentSoon.map((item) => (
            <TaskAttention key={item.task.id} item={item} tone="soon" now={now} />
          ))}
          {alerts.map((alert) => (
            <li key={alert.id}>
              <Link to={alert.href} className="alert-card is-soon">
                <AlertTriangle size={18} />
                <span className="alert-text">
                  <span className="alert-label">{alert.id.startsWith('system-') ? 'Aging system' : 'Ending soon'}</span>
                  <span className="alert-title">{alert.title}</span>
                  <span className="alert-detail">{alert.detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TaskAttention({ item, tone, now }: { item: TaskItem; tone: 'overdue' | 'soon'; now: number }) {
  const store = useStore();
  const toast = useToast();
  const { complete } = useTaskActions();
  const { task, info } = item;

  async function snooze(t: Task) {
    try {
      const { nextDue, undo } = await snoozeTask(store, t, 7, now);
      toast(`${t.name} moved to ${formatDate(nextDue, false)}`, { action: { label: 'Undo', run: () => void undo() } });
    } catch {
      toast('That wasn’t saved. Try again.', { tone: 'error' });
    }
  }

  return (
    <li className={`alert-card is-${tone} has-actions`}>
      {tone === 'overdue' ? <AlertTriangle size={18} /> : <Clock size={18} />}
      <Link to={`/tasks/${task.id}`} className="alert-text">
        <span className="alert-label">{tone === 'overdue' ? `Overdue · ${countdownText(info).replace(' over', '')} late` : `High priority · ${countdownText(info) === 'Today' ? 'due today' : `due in ${countdownText(info)}`}`}</span>
        <span className="alert-title">{task.name}</span>
        {task.location && <span className="alert-detail">{task.location}</span>}
      </Link>
      <div className="alert-actions">
        <button type="button" className="button is-small is-primary" onClick={() => void complete(task)} aria-label={`Mark ${task.name} done`}>
          <Check size={16} /> Done
        </button>
        <button type="button" className="button is-small is-quiet" onClick={() => void snooze(task)} aria-label={`Snooze ${task.name} for a week`}>
          <Clock size={16} /> Snooze 1 wk
        </button>
      </div>
    </li>
  );
}

// ---------- Due this month ----------

function DueThisMonth({ items, now, hasTasks, seasonal }: { items: TaskItem[]; now: number; hasTasks: boolean; seasonal: number }) {
  const { complete } = useTaskActions();
  const month = new Date(now).toLocaleDateString('en-US', { month: 'long' });
  return (
    <section className="module" aria-labelledby="month-title">
      <header className="module-head">
        <h2 id="month-title" className="module-title">
          Due this month
        </h2>
        <span className="module-links">
          <Link className="module-aside is-link" to="/home/coming-up">
            Next 3 months
          </Link>
          <Link className="module-aside is-link" to="/tasks">
            All tasks
          </Link>
        </span>
      </header>
      {items.length === 0 ? (
        <div className="module-empty">
          <p>{hasTasks ? `Nothing else is due in ${month}.` : 'No tasks yet. Start with one job you always forget, like the furnace filter.'}</p>
          <div className="inline-actions">
            <Link className="button is-small is-secondary" to="/tasks?new=1">
              <Plus size={16} /> Add a task
            </Link>
            {seasonal > 0 && (
              <Link className="button is-small is-quiet" to="/home/season">
                {seasonal} seasonal {seasonal === 1 ? 'job' : 'jobs'} to plan
              </Link>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="group">
            {items.slice(0, 6).map(({ task, info }) => (
              <TaskRow key={task.id} task={task} info={info} now={now} onDone={() => complete(task)} />
            ))}
          </div>
          <p className="module-note">
            Tap a job for details, snooze or reschedule. Swipe left to mark it done.
            {items.length > 6 && (
              <>
                {' '}
                <Link to="/tasks">{items.length - 6} more</Link>
              </>
            )}
          </p>
        </>
      )}
    </section>
  );
}

// ---------- Quick actions ----------

function QuickActions() {
  return (
    <section className="module" aria-labelledby="quick-title">
      <header className="module-head">
        <h2 id="quick-title" className="module-title">
          Quick actions
        </h2>
      </header>
      <ul className="quick-grid">
        {QUICK_ACTIONS.map(({ id, label, hint, to, icon: Icon }) => (
          <li key={id}>
            <Link className="quick-action" to={id === 'damage' ? damageReportHref() : to}>
              <Icon size={22} />
              <span className="quick-label">{label}</span>
              <span className="quick-hint">{hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- Your home: the property model, one tap away ----------

function YourHome() {
  const data = useData();
  const warranties = data.records.filter((r) => r.kind === 'warranty' || r.kind === 'insurance').length;
  const paperwork = data.records.filter((r) => ['manual', 'receipt', 'invoice'].includes(r.kind)).length;
  const contractors = data.records.filter((r) => r.kind === 'contractor').length;
  const belongings = data.items.filter((i) => i.kind !== 'key').length;
  const keys = data.items.length - belongings;
  const rows: { title: string; sub: string; count: number; to: string; icon: ComponentType<IconProps>; empty?: string }[] = [
    { title: 'Home systems', sub: data.systems.length ? data.systems.map((s) => s.name).slice(0, 3).join(', ') : 'Heating, cooling, water heater', count: data.systems.length, to: '/property/systems', icon: Thermometer },
    { title: 'Inventory', sub: belongings ? 'Appliances and valuables' : 'Appliances with model and serial', count: belongings, to: '/property/inventory', icon: Folder },
    { title: 'Warranties and manuals', sub: warranties || paperwork ? `${warranties} warranties · ${paperwork} manuals and receipts` : 'Find them when something breaks', count: warranties + paperwork, to: '/records', icon: FileText },
    { title: 'Contractors', sub: contractors ? 'Who to call' : 'Save the plumber you trust', count: contractors, to: '/records?show=contractors', icon: Phone },
    { title: 'Service history', sub: data.serviceEvents.length ? 'Who did what, and when' : 'Fills in as jobs get done', count: data.serviceEvents.length, to: '/records/service-history', icon: Wrench, empty: 'None yet' },
    { title: 'Keys and locks', sub: keys ? 'Which key is which' : 'Photo a key to identify it', count: keys, to: '/property/keys', icon: Key },
  ];
  return (
    <section className="module" aria-labelledby="yourhome-title">
      <header className="module-head">
        <h2 id="yourhome-title" className="module-title">
          Your home
        </h2>
        <Link className="module-aside is-link" to="/property">
          Property
        </Link>
      </header>
      <div className="group">
        {rows.map(({ title, sub, count, to, icon: Icon, empty }) => (
          <Link key={title} className="row" to={to} aria-label={`${title}, ${count ? `${count} saved` : 'none yet'}`}>
            <span className="row-lead">
              <Icon size={19} />
            </span>
            <span className="row-main">
              <span className="row-title">{title}</span>
              <span className="row-sub">{sub}</span>
            </span>
            <span className={`row-value ${count || empty ? '' : 'is-empty'}`}>{count || empty || 'Add'}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ---------- Recent activity ----------

function RecentActivity({ now }: { now: number }) {
  const { activity } = useData();
  const entries = activity.slice(0, 5);
  return (
    <section className="module" aria-labelledby="recent-title">
      <header className="module-head">
        <h2 id="recent-title" className="module-title">
          Recent activity
        </h2>
        {activity.length > 0 && (
          <Link className="module-aside is-link" to="/home/activity">
            All activity
          </Link>
        )}
      </header>
      {entries.length === 0 ? (
        <p className="module-empty">Nothing yet. Finished Health Check steps, completed jobs and saved records show up here.</p>
      ) : (
        <ul className="feed">
          {entries.map((entry) => {
            const body = (
              <>
                <span className="feed-text">{entry.text}</span>
                <time className="feed-time" dateTime={entry.at}>
                  {formatRelativeTime(entry.at, now)}
                </time>
              </>
            );
            return <li key={entry.id}>{entry.href ? <Link className="feed-row" to={entry.href}>{body}</Link> : <div className="feed-row">{body}</div>}</li>;
          })}
        </ul>
      )}
    </section>
  );
}

// ---------- Backup reminder: local-only data needs a copy somewhere else ----------

const BACKUP_STALE_DAYS = 30;

function BackupNote({ now }: { now: number }) {
  const data = useData();
  const last = data.settings.lastBackupAt;
  const amount = data.tasks.length + data.systems.length + data.items.length + data.records.length + data.serviceEvents.length;
  const stale = !last || now - new Date(last).getTime() > BACKUP_STALE_DAYS * 86_400_000;
  if (amount === 0 || !stale) return null;
  return (
    <section className="module backup-note" aria-labelledby="backup-title">
      <h2 id="backup-title" className="module-title">
        {last ? `Last backup ${formatRelativeTime(last, now).toLowerCase()}` : 'No backup yet'}
      </h2>
      <p className="module-lead">Everything lives only in this browser. If its data is cleared, a backup file is the only way to get it back.</p>
      <div className="inline-actions">
        <Link className="button is-small is-secondary" to="/settings#data">
          Save a backup
        </Link>
      </div>
    </section>
  );
}
