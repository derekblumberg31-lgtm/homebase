import { useState } from 'react';
import { useData } from '../../data/DataProvider';
import { exportSchedule } from '../../lib/calendar';
import { readDeviceEnv } from '../../lib/dataSafety';
import { Segmented } from '../../ui/controls';
import { Page, Section } from '../../ui/layout';
import { useToast } from '../../ui/overlays';
import { CALENDAR_GUIDES, defaultPlatform, PLATFORM_OPTIONS, SNAPSHOT_SENTENCE, type CalendarPlatform } from './calendarGuide';

/** How to get every open job into the calendar app on a phone or computer. The file is a snapshot. */
export function CalendarGuidePage() {
  const data = useData();
  const toast = useToast();
  const [platform, setPlatform] = useState<CalendarPlatform>(() => defaultPlatform(readDeviceEnv()));
  const openTasks = data.tasks.filter((t) => t.status === 'open');
  const empty = openTasks.length === 0;
  const guide = CALENDAR_GUIDES[platform];

  function download() {
    if (empty) return;
    try {
      exportSchedule(openTasks);
      toast('Calendar file saved. Open it to add the jobs.');
    } catch {
      toast('The calendar file couldn’t be saved. Try again.', { tone: 'error' });
    }
  }

  return (
    <Page title="Add jobs to your calendar" subtitle="Homebase can’t remind you while it’s closed. Your phone’s calendar can." back={{ to: '/settings', label: 'Settings' }}>
      <div className="section">
        <button type="button" className="button is-primary is-block" aria-disabled={empty || undefined} aria-describedby={empty ? 'calendar-empty' : undefined} onClick={download}>
          Download the calendar file
        </button>
        {empty && (
          <p className="section-foot" id="calendar-empty">
            Add a job first
          </p>
        )}
        <p className="section-foot">{SNAPSHOT_SENTENCE}</p>
      </div>

      <Section title="How to add it">
        <Segmented label="Calendar app" value={platform} options={PLATFORM_OPTIONS} onChange={setPlatform} />
        <ol className="guide-steps">
          {guide.steps.map((step) => (
            <li key={step.text}>{step.text}</li>
          ))}
        </ol>
        {guide.note && <p className="section-foot">{guide.note}</p>}
      </Section>
    </Page>
  );
}
