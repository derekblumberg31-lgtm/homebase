import { useMemo } from 'react';
import { useData, useNow } from '../../data/DataProvider';
import { Page } from '../../ui/layout';
import { ActivityFeed, HomeOverview, MaintenanceTimeline, SeasonalSection } from './HomeSections';
import { StarterChecklist } from './HealthCheck';
import { healthPageSummary, starterCheckFor } from './starter';
import { alertsFor, currentSeason, seasonalTipsFor, snapshotFor, timelineFor } from './insights';

const back = { to: '/home', label: 'Home' };

/** Home Health Check: the starter safety checklist, the home's snapshot, then the record steps. */
export function HomeHealthPage() {
  const data = useData();
  const now = useNow();
  const starter = useMemo(() => starterCheckFor(data), [data]);
  const facts = useMemo(() => snapshotFor(data, now), [data, now]);
  const alerts = useMemo(() => alertsFor(data, now).filter((a) => a.tone !== 'overdue'), [data, now]);
  return (
    <Page
      title="Home Health Check"
      subtitle={healthPageSummary(starter)}
      back={back}
    >
      <StarterChecklist />
      <HomeOverview facts={facts} alerts={alerts} />
    </Page>
  );
}

export function HomeSeasonPage() {
  const data = useData();
  const now = useNow();
  const { tips, snoozed } = useMemo(() => seasonalTipsFor(data, now), [data, now]);
  const season = currentSeason(now);
  return (
    <Page title="This season" subtitle={`Jobs worth doing this ${season}. Plan one and it joins your tasks.`} back={back}>
      {tips.length === 0 && snoozed === 0 ? (
        <p className="page-note">You’ve planned, done or hidden everything for this {season}. New suggestions arrive with the next season.</p>
      ) : (
        <SeasonalSection season={season} tips={tips} snoozed={snoozed} />
      )}
    </Page>
  );
}

export function HomeComingUpPage() {
  const data = useData();
  const now = useNow();
  const months = useMemo(() => timelineFor(data, now), [data, now]);
  return (
    <Page title="Coming up" subtitle="Tasks and warranty end dates over the next three months." back={back}>
      <MaintenanceTimeline months={months} />
    </Page>
  );
}

export function HomeActivityPage() {
  const now = useNow();
  return (
    <Page title="Activity" subtitle="What’s been done and added around the home." back={back}>
      <ActivityFeed now={now} limit={30} />
    </Page>
  );
}
