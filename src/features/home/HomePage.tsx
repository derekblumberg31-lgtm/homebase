import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { QuickAdd } from '../../app/QuickAdd';
import { useData, useNow } from '../../data/DataProvider';
import { useSession } from '../../session/session';
import { useToast } from '../../ui/overlays';
import { backupNudge, dataSafetyRow } from '../../lib/dataSafety';
import { MessageCircle, Share } from '../../ui/Icons';
import { Group, Page, Row } from '../../ui/layout';
import { InstallSheet } from '../settings/InstallSheet';
import { useSaveBackup } from '../settings/useSaveBackup';
import { TaskRow } from '../tasks/components';
import { compareUrgency, withInfo } from '../tasks/taskMath';
import { useTaskActions } from '../tasks/useTaskActions';
import { HomeAlertRow, HomeAlertRows, HomeStatusLine } from './HomeSections';
import { arrangeAttention, attentionFor, healthCheckFor, homeStatusFor, seasonalTipsFor, timelineFor, type AttentionItem } from './insights';
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
  const health = useMemo(() => healthCheckFor(data, now), [data, now]);
  const season = useMemo(() => seasonalTipsFor(data, now).tips.filter((t) => !t.status).length, [data, now]);
  const comingUp = useMemo(() => timelineFor(data, now).reduce((sum, m) => sum + m.entries.length, 0), [data, now]);

  const ending = counted.filter((a) => a.kind === 'warranty').length;

  useEffect(() => {
    if (focusRow.current === null) return;
    const index = Math.min(focusRow.current, rows.length - 1);
    focusRow.current = null;
    const target = index >= 0 ? alertsRef.current?.querySelectorAll<HTMLElement>('.home-alert-row > .row')[index] : document.querySelector<HTMLElement>('#home-ask a');
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
    setTimeout(() => document.querySelector<HTMLElement>('#home-ask a')?.focus(), 0);
  }

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
      actions={
        <span className="mobile-only">
          <QuickAdd variant="header" />
        </span>
      }
    >
      <section className="home-next" aria-label="Next jobs" ref={nextRef} tabIndex={-1}>
        {next.length === 0 ? (
          <StarterJobs onAdded={() => setTimeout(() => nextRef.current?.focus(), 0)} />
        ) : (
          <>
            <Group>
              {next.map(({ task, info }, index) => (
                <TaskRow key={task.id} task={task} info={info} now={now} featured={index === 0} onDone={() => complete(task)} />
              ))}
            </Group>
            <p className="section-foot">
              Tap the circle or swipe left to mark a job done. <Link to="/tasks">All tasks</Link>
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
              title="Add Homebase to your Home Screen"
              detail="So Safari doesn’t clear your data"
              lead={<Share size={18} />}
              onSelect={() => setInstallOpen(true)}
              onDismiss={hideInstall}
            />
          </ul>
        </section>
      )}

      <div className="section" id="home-ask">
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
