import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { QuickAdd } from '../../app/QuickAdd';
import { useData, useNow } from '../../data/DataProvider';
import { formatCurrency } from '../../lib/dates';
import { useSession } from '../../session/session';
import { EmptyState, Group, Page } from '../../ui/layout';
import { TaskRow } from '../tasks/components';
import { annualCost, compareUrgency, withInfo } from '../tasks/taskMath';
import { useTaskActions } from '../tasks/useTaskActions';
import { ActivityFeed, HealthModule, HomeOverview, MaintenanceTimeline, SeasonalSection } from './HomeSections';
import { alertsFor, currentSeason, healthCheckFor, seasonalTipsFor, snapshotFor, timelineFor } from './insights';

const UP_NEXT = 3;

function greeting(now: number) {
  const hour = new Date(now).getHours();
  return hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

const PROPERTY_TYPE: Record<string, string> = { house: 'House', townhouse: 'Townhouse', condo: 'Condo', apartment: 'Apartment', other: 'Home' };

/**
 * Home: one overview panel that says how the home is doing, then the work (up next, coming up,
 * this season) on the left and setup progress and activity on the right.
 */
export function HomePage() {
  const data = useData();
  const session = useSession();
  const now = useNow();
  const { complete } = useTaskActions();

  const alerts = useMemo(() => alertsFor(data, now), [data, now]);
  const health = useMemo(() => healthCheckFor(data, now), [data, now]);
  const facts = useMemo(() => snapshotFor(data, now, health), [data, now, health]);
  const { tips, snoozed } = useMemo(() => seasonalTipsFor(data, now), [data, now]);
  const upNext = useMemo(
    () => withInfo(data.tasks.filter((t) => t.status === 'open'), now).sort(compareUrgency).filter((i) => i.info.status !== 'overdue').slice(0, UP_NEXT),
    [data.tasks, now],
  );
  const months = useMemo(() => {
    const shown = new Set(upNext.map((i) => `task-${i.task.id}`));
    // Overdue items already lead the overview, and Up next has the soonest three.
    return timelineFor(data, now)
      .filter((m) => m.key !== 'overdue')
      .map((m) => ({ ...m, entries: m.entries.filter((e) => !shown.has(e.id)) }))
      .filter((m) => m.entries.length > 0);
  }, [data, now, upNext]);
  const yearly = data.tasks.filter((t) => t.status === 'open').reduce((sum, t) => sum + annualCost(t), 0);

  const overdue = alerts.filter((a) => a.tone === 'overdue').length;
  const headline = overdue
    ? `${overdue} ${overdue === 1 ? 'job is' : 'jobs are'} overdue`
    : alerts.length
      ? `${alerts.length} ${alerts.length === 1 ? 'thing' : 'things'} to look at soon`
      : data.tasks.length
        ? 'Your home is on track'
        : 'Let’s get your home set up';
  const place = [data.property?.nickname, data.property?.type ? PROPERTY_TYPE[data.property.type] : null, data.property?.ownership === 'rent' ? 'Rented' : null]
    .filter(Boolean)
    .join(' · ');
  const today = new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <Page title={`${greeting(now)}, ${session.firstName ?? 'there'}`} subtitle={today} profile wide actions={<span className="mobile-only"><QuickAdd variant="header" /></span>}>
      <HomeOverview headline={headline} place={place || undefined} facts={facts} alerts={alerts} />

      <div className="home-columns">
        <div className="home-main">
          <section className="module" aria-labelledby="upnext-title">
            <header className="module-head">
              <h2 id="upnext-title" className="module-title">
                Up next
              </h2>
              {data.tasks.length > 0 && (
                <Link className="module-aside is-link" to="/tasks">
                  All tasks
                </Link>
              )}
            </header>
            {upNext.length === 0 ? (
              data.tasks.length ? (
                <p className="module-empty">Nothing else is coming up soon. Anything overdue is listed above.</p>
              ) : (
                <EmptyState
                  inline
                  title="Start with the jobs you always forget"
                  body="Furnace filters, smoke alarm batteries, the dryer vent. Add one and Homebase counts down to it."
                  action={{ label: 'Add a maintenance reminder', to: '/tasks?new=1&kind=maintenance' }}
                />
              )
            ) : (
              <Group>
                {upNext.map(({ task, info }, index) => (
                  <TaskRow key={task.id} task={task} info={info} now={now} featured={index === 0} onDone={() => complete(task)} />
                ))}
              </Group>
            )}
            {yearly > 0 && (
              <p className="module-note">
                Recurring upkeep runs about {formatCurrency(Math.round(yearly))} a year. <Link to="/tasks?view=costs">See costs</Link>
              </p>
            )}
          </section>

          {data.tasks.length > 0 && <MaintenanceTimeline months={months} />}

          <SeasonalSection season={currentSeason(now)} tips={tips} snoozed={snoozed} />
        </div>

        <div className="home-side">
          <HealthModule health={health} />
          <ActivityFeed now={now} health={health} />
        </div>
      </div>
    </Page>
  );
}
