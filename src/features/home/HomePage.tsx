import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { QuickAdd } from '../../app/QuickAdd';
import { useData, useNow } from '../../data/DataProvider';
import { useSession } from '../../session/session';
import { useToast } from '../../ui/overlays';
import { backupNudge, dataSafetyRow, deviceLabel, installRowCopy, readDeviceEnv } from '../../lib/dataSafety';
import { Share } from '../../ui/Icons';
import { Group, Page, Row } from '../../ui/layout';
import { InstallSheet } from '../settings/InstallSheet';
import { useSaveBackup } from '../settings/useSaveBackup';
import { TaskRow } from '../tasks/components';
import { compareUrgency, withInfo } from '../tasks/taskMath';
import { useTaskActions } from '../tasks/useTaskActions';
import { HomeAlertRow, HomeAlertRows, HomeStatusLine } from './HomeSections';
import { arrangeAttention, attentionFor, comingUpSub, homeStatusFor, seasonalTipsFor, timelineFor, type AttentionItem } from './insights';
import { healthRowText, starterCheckFor } from './starter';
import { StarterJobs } from './StarterJobs';
import { useAlertDismissals } from './useAlertDismissals';
import { useInstallRow } from './useInstallRow';

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
  const toast = useToast();
  const { dismissed, backupDismissedAt, dismiss, restore, dismissBackup, restoreBackup } = useAlertDismissals();
  const install = useInstallRow();
  const [installOpen, setInstallOpen] = useState(false);
  const { save: saveBackup, dialog: backupDialog } = useSaveBackup();
  // After a row is hidden, focus moves to the row now in its place, else the one before it, else Ask Homebase.
  const focusRow = useRef<number | null>(null);
  const alertsRef = useRef<HTMLDivElement>(null);
  // After starter jobs are added, focus moves to the jobs list that replaces the block.
  const nextRef = useRef<HTMLElement>(null);

  const next = useMemo(() => withInfo(data.tasks.filter((t) => t.status === 'open'), now).sort(compareUrgency).slice(0, UP_NEXT), [data.tasks, now]);
  // One data-safety row at a time: while the install row shows (a Safari tab), the backup row waits.
  const safetyRow = dataSafetyRow({ installMatters: install.matters, installDismissed: install.dismissed, nudge: backupNudge(data, now, backupDismissedAt) });
  const attention = useMemo(() => {
    const items = attentionFor(data, now, backupDismissedAt);
    return safetyRow === 'install' ? items.filter((item) => item.kind !== 'backup') : items;
  }, [data, now, backupDismissedAt, safetyRow]);
  const { rows, more, counted } = useMemo(() => arrangeAttention(attention, dismissed), [attention, dismissed]);
  const status = useMemo(() => homeStatusFor(data, now, counted), [data, now, counted]);
  const starter = useMemo(() => starterCheckFor(data), [data]);
  const season = useMemo(() => seasonalTipsFor(data, now).tips.filter((t) => !t.status).length, [data, now]);
  const comingUp = useMemo(() => timelineFor(data, now).reduce((sum, m) => sum + m.entries.length, 0), [data, now]);

  const ending = counted.filter((a) => a.kind === 'warranty').length;

  useEffect(() => {
    if (focusRow.current === null) return;
    const index = Math.min(focusRow.current, rows.length - 1);
    focusRow.current = null;
    const target = index >= 0 ? alertsRef.current?.querySelectorAll<HTMLElement>('.home-alert-row > .row')[index] : document.querySelector<HTMLElement>('a#home-ask');
    target?.focus();
  }, [rows]);

  function hide(item: AttentionItem) {
    focusRow.current = rows.indexOf(item);
    if (item.kind === 'backup') {
      dismissBackup();
      toast('Hidden from Home. It’s still in Settings.', { action: { label: 'Undo', run: restoreBackup } });
    } else if (item.dismissKey) {
      const key = item.dismissKey;
      dismiss(key);
      toast(`Hidden from Home. It’s still in ${item.kind === 'warranty' ? 'Coming up' : 'Systems'}.`, { action: { label: 'Undo', run: () => restore(key) } });
    }
  }

  // The install row is outside the alert slot, so focus goes to Ask Homebase once it is gone.
  function focusAsk() {
    requestAnimationFrame(() => document.querySelector<HTMLElement>('a#home-ask')?.focus());
  }

  const installCopy = useMemo(() => installRowCopy(deviceLabel(readDeviceEnv())), []);

  function hideInstall() {
    install.dismiss();
    toast('Hidden from Home. The steps are still in Settings.', { action: { label: 'Undo', run: install.restore } });
    focusAsk();
  }

  return (
    <Page
      title={`${greeting(now)}, ${session.firstName ?? 'there'}`}
      subtitle={<HomeStatusLine status={status} />}
      profile
      compact
      actions={
        <span className="mobile-only">
          <QuickAdd variant="header" />
        </span>
      }
    >
      <section className="home-next" aria-label="Next jobs" ref={nextRef} tabIndex={-1}>
        {next.length === 0 ? (
          <StarterJobs onAdded={() => requestAnimationFrame(() => nextRef.current?.focus())} />
        ) : (
          <>
            <Group>
              {next.map(({ task, info }, index) => (
                <TaskRow key={task.id} task={task} info={info} now={now} featured={index === 0} onDone={() => complete(task)} />
              ))}
            </Group>
            <p className="section-foot">
              <Link to="/tasks">All tasks</Link>
            </p>
            <p className="section-hint">
              <span className="hint-touch">Tap the circle or swipe left to mark a job done.</span>
              <span className="hint-pointer">Click the circle to mark a job done.</span>
            </p>
          </>
        )}
      </section>

      <div ref={alertsRef}>
        <HomeAlertRows rows={rows} more={more} onDismiss={hide} onBackup={() => void saveBackup()} />
      </div>

      {safetyRow === 'install' && (
        <section className="section home-alerts" aria-label="This device">
          <ul className="group">
            <HomeAlertRow
              title={installCopy.title}
              detail={installCopy.detail}
              lead={<Share size={18} />}
              onSelect={() => setInstallOpen(true)}
              onDismiss={hideInstall}
            />
          </ul>
        </section>
      )}

      <section className="section home-more" aria-labelledby="home-more-title">
        <div className="section-head">
          <h2 id="home-more-title" className="section-title">
            More
          </h2>
        </div>
        <Group>
          <Row id="home-ask" title="Ask Homebase" sub="Something broken, leaking or beeping? Get steps, or look up a warranty." to="/assistant" wrap />
          <Row title="Home Health Check" sub={healthRowText(starter)} to="/home/health" />
          <Row title="This season" sub={season ? `${season} seasonal ${season === 1 ? 'job' : 'jobs'} to plan` : 'All planned or done'} to="/home/season" />
          <Row title="Coming up" sub={comingUpSub(comingUp, ending)} to="/home/coming-up" wrap />
          <Row title="Activity" sub={data.activity.length ? 'What’s been done and added' : 'Fills in as you mark jobs done'} to="/home/activity" />
        </Group>
      </section>
      {installOpen && (
        <InstallSheet
          onClose={() => {
            // The steps have been seen, and Settings keeps the way back.
            setInstallOpen(false);
            install.dismiss();
            focusAsk();
          }}
        />
      )}
      {backupDialog}
    </Page>
  );
}
