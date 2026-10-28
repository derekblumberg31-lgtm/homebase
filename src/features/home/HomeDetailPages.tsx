import { useMemo } from 'react';
import { useData, useNow } from '../../data/DataProvider';
import { Page } from '../../ui/layout';
import { ActivityFeed, HealthModule, HomeOverview, MaintenanceTimeline, SeasonalSection } from './HomeSections';
import { alertsFor, currentSeason, healthCheckFor, seasonalTipsFor, snapshotFor, timelineFor } from './insights';

const back = { to: '/home', label: 'Home' };

const PROPERTY_TYPE: Record<string, string> = { house: 'House', townhouse: 'Townhouse', condo: 'Condo', apartment: 'Apartment', other: 'Home' };

/** Home Health Check: the snapshot of the home, then the setup steps. */
export function HomeHealthPage() {
  const data = useData();
  const now = useNow();
  const health = useMemo(() => healthCheckFor(data, now), [data, now]);
  const facts = useMemo(() => snapshotFor(data, now, health), [data, now, health]);
  const alerts = useMemo(() => alertsFor(data, now).filter((a) => a.tone !== 'overdue'), [data, now]);
  const place = [data.property?.nickname, data.property?.type ? PROPERTY_TYPE[data.property.type] : null].filter(Boolean).join(' · ');
  return (
    <Page title="Home Health Check" subtitle="How complete your home’s record is, and what to add next." back={back}>
      <HomeOverview headline={health.done === health.total ? 'Your home’s record is complete' : `${health.score}% set up`} place={place || undefined} facts={facts} alerts={alerts} />
      <HealthModule health={health} />
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
  const data = useData();
  const now = useNow();
  const health = useMemo(() => healthCheckFor(data, now), [data, now]);
  return (
    <Page title="Activity" subtitle="What’s been done and added around the home." back={back}>
      <ActivityFeed now={now} health={health} limit={30} />
    </Page>
  );
}
