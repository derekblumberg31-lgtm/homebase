import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { QuickAdd } from '../../app/QuickAdd';
import { useData, useNow } from '../../data/DataProvider';
import { useSession } from '../../session/session';
import { MessageCircle } from '../../ui/Icons';
import { EmptyState, Group, Page, Row } from '../../ui/layout';
import { TaskRow } from '../tasks/components';
import { compareUrgency, withInfo } from '../tasks/taskMath';
import { useTaskActions } from '../tasks/useTaskActions';
import { alertsFor, healthCheckFor, seasonalTipsFor, timelineFor } from './insights';

const UP_NEXT = 3;

function greeting(now: number) {
  const hour = new Date(now).getHours();
  return hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

/**
 * Home is for a few seconds in front of the thing that needs doing: one line on whether anything
 * is overdue, the next three jobs (swipe to mark done), and Ask Homebase for when something breaks.
 * Everything else about the home is one tap away, below.
 */
export function HomePage() {
  const data = useData();
  const session = useSession();
  const now = useNow();
  const { complete } = useTaskActions();

  const next = useMemo(() => withInfo(data.tasks.filter((t) => t.status === 'open'), now).sort(compareUrgency).slice(0, UP_NEXT), [data.tasks, now]);
  const alerts = useMemo(() => alertsFor(data, now), [data, now]);
  const health = useMemo(() => healthCheckFor(data, now), [data, now]);
  const season = useMemo(() => seasonalTipsFor(data, now).tips.filter((t) => !t.status).length, [data, now]);
  const comingUp = useMemo(() => timelineFor(data, now).reduce((sum, m) => sum + m.entries.length, 0), [data, now]);

  const overdue = alerts.filter((a) => a.tone === 'overdue').length;
  const ending = alerts.filter((a) => a.id.startsWith('record-')).length;
  const status = overdue
    ? `${overdue} ${overdue === 1 ? 'job is' : 'jobs are'} overdue`
    : data.tasks.length
      ? 'Nothing is overdue'
      : 'Add the jobs your home needs';

  return (
    <Page
      title={`${greeting(now)}, ${session.firstName ?? 'there'}`}
      subtitle={<span className={overdue ? 'home-status is-overdue' : 'home-status'}>{status}</span>}
      profile
      actions={
        <span className="mobile-only">
          <QuickAdd variant="header" />
        </span>
      }
    >
      <section className="home-next" aria-label="Next jobs">
        {next.length === 0 ? (
          <EmptyState
            title="Start with the jobs you always forget"
            body="The furnace filter, smoke alarm batteries, the gutters. Add one and Homebase counts down to it."
            action={{ label: 'Add a maintenance reminder', to: '/tasks?new=1&kind=maintenance' }}
          />
        ) : (
          <>
            <Group>
              {next.map(({ task, info }, index) => (
                <TaskRow key={task.id} task={task} info={info} now={now} featured={index === 0} onDone={() => complete(task)} />
              ))}
            </Group>
            <p className="section-foot">
              Swipe a job left to mark it done. <Link to="/tasks">All tasks</Link>
            </p>
          </>
        )}
      </section>

      <div className="section">
        <Group>
          <Row title="Ask Homebase" sub="Something broken, leaking or beeping? Get steps, or look up a warranty." lead={<MessageCircle size={20} />} to="/assistant" wrap />
        </Group>
      </div>

      <div className="section home-more">
        <Group>
          <Row title="Home Health Check" sub={health.done === health.total ? 'Your home’s record is complete' : `${health.score}% set up · ${health.total - health.done} steps left`} to="/home/health" />
          <Row title="This season" sub={season ? `${season} seasonal ${season === 1 ? 'job' : 'jobs'} to plan` : 'All planned or done'} to="/home/season" />
          <Row title="Coming up" sub={comingUp ? `${comingUp} in the next three months${ending ? ` · ${ending} warranty ending` : ''}` : 'Nothing in the next three months'} to="/home/coming-up" />
          <Row title="Activity" sub={data.activity.length ? 'What’s been done and added' : 'Fills in as you mark jobs done'} to="/home/activity" />
        </Group>
      </div>
    </Page>
  );
}
