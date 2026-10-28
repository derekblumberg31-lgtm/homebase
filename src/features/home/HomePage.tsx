import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData, useNow, useStore } from '../../data/DataProvider';
import { formatCurrency, formatRelativeTime } from '../../lib/dates';
import { useSession } from '../../session/session';
import { EmptyState, Group, Page, Row, Section } from '../../ui/layout';
import { TaskRow } from '../tasks/components';
import { annualCost, compareUrgency, withInfo } from '../tasks/taskMath';
import { useTaskActions } from '../tasks/useTaskActions';
import { alertsFor, healthCheckFor, recommendationsFor } from './insights';

function greeting(now: number) {
  const hour = new Date(now).getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

/** Home: a calm overview of what needs you, what's next, and what's been done. */
export function HomePage() {
  const data = useData();
  const store = useStore();
  const session = useSession();
  const navigate = useNavigate();
  const now = useNow();
  const { complete } = useTaskActions();

  const alerts = useMemo(() => alertsFor(data, now), [data, now]);
  const tips = useMemo(() => recommendationsFor(data, now), [data, now]);
  const health = useMemo(() => healthCheckFor(data, now), [data, now]);
  const upNext = useMemo(
    () => withInfo(data.tasks.filter((t) => t.status === 'open'), now).sort(compareUrgency).filter((i) => i.info.status !== 'overdue').slice(0, 3),
    [data.tasks, now],
  );
  const yearly = data.tasks.filter((t) => t.status === 'open').reduce((sum, t) => sum + annualCost(t), 0);
  const firstName = session.member?.name;
  const summary = alerts.length
    ? `${alerts.length} ${alerts.length === 1 ? 'thing needs' : 'things need'} you`
    : data.tasks.length
      ? 'Everything is on track'
      : 'Let’s set up your home';

  return (
    <Page title={`${greeting(now)}${firstName ? `, ${firstName}` : ''}`} subtitle={[data.property?.nickname, summary].filter(Boolean).join(' · ')} profile wide>
      <div className="home-grid">
        <div>
          {alerts.length > 0 && (
            <Section title="Needs attention">
              <Group>
                {alerts.map((alert) => (
                  <Row key={alert.id} title={alert.title} sub={alert.detail} to={alert.href} lead={<span className={`alert-dot is-${alert.tone}`} aria-hidden="true" />} />
                ))}
              </Group>
            </Section>
          )}

          <Section title="Up next" aside={data.tasks.length ? <Link to="/tasks">All tasks</Link> : undefined}>
            {upNext.length === 0 ? (
              <EmptyState
                title={data.tasks.length ? 'Nothing else coming up' : 'No tasks yet'}
                body={data.tasks.length ? 'Overdue items are above. Everything else is done or far off.' : 'Add the jobs your home needs and Homebase counts down to each one.'}
                action={data.tasks.length ? undefined : { label: 'Add a task', to: '/tasks?new=1' }}
              />
            ) : (
              <Group>
                {upNext.map(({ task, info }, index) => (
                  <TaskRow key={task.id} task={task} info={info} now={now} featured={index === 0} onDone={() => complete(task)} />
                ))}
              </Group>
            )}
            {yearly > 0 && (
              <p className="section-foot">
                Upkeep runs about {formatCurrency(Math.round(yearly))} a year. <Link to="/tasks?view=costs">See costs</Link>
              </p>
            )}
          </Section>

          {tips.length > 0 && (
            <Section title="For this season">
              <Group>
                {tips.map((tip) => (
                  <div className="row-wrap" key={tip.id}>
                    <div className="row">
                      <span className="row-main">
                        <span className="row-title">{tip.title}</span>
                        <span className="row-sub">{tip.why}</span>
                      </span>
                      <span className="row-actions">
                        <button type="button" className="button is-quiet" onClick={() => navigate(`/tasks?new=1&name=${encodeURIComponent(tip.taskName)}`)}>
                          Plan it
                        </button>
                        <button type="button" className="button is-danger-quiet" aria-label={`Hide: ${tip.title}`} onClick={() => store.updateSettings({ dismissedTips: [...data.settings.dismissedTips, tip.id] })}>
                          Hide
                        </button>
                      </span>
                    </div>
                  </div>
                ))}
              </Group>
            </Section>
          )}
        </div>

        <div>
          <Section title="Home Health Check">
            <div className="group">
              <div className="health">
                <p className="row-title">{health.score === 100 ? 'Your home’s record is complete' : `${health.done} of ${health.total} steps done`}</p>
                <p className="row-sub">The more Homebase knows about your home, the better it can remind you.</p>
              </div>
              {health.next.map((step) => (
                <Row key={step.title} title={step.title} to={step.href} />
              ))}
            </div>
          </Section>

          <Section title="Recent activity">
            {data.activity.length === 0 ? (
              <div className="group">
                <EmptyState inline title="Nothing yet" body="Tasks you finish and things you add will show here." />
              </div>
            ) : (
              <Group>
                {data.activity.slice(0, 6).map((entry) => (
                  <Row key={entry.id} title={entry.text} sub={formatRelativeTime(entry.at, now)} to={entry.href} />
                ))}
              </Group>
            )}
          </Section>

          <Section title="Ask Assistant">
            <Group>
              <Row title="Something broken or leaking?" sub="Step-by-step help, offline" to="/assistant" />
            </Group>
          </Section>
        </div>
      </div>
    </Page>
  );
}
