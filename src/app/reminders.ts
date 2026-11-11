import { useEffect } from 'react';
import { useData, useNow } from '../data/DataProvider';
import { toDateInput } from '../lib/dates';
import { showNotification } from '../lib/notify';
import type { HomeRecord, Task } from '../data/types';
import { endingSoon } from '../features/home/insights';
import { getTaskInfo } from '../features/tasks/taskMath';

const SENT_KEY = 'homebase:last-reminder';

/** The daily notification's text, or null when nothing is due or ending. Uses the app's warranty window. */
export function reminderBody(tasks: Task[], records: HomeRecord[], now: number): string | null {
  const due = tasks.filter((task) => task.status === 'open' && getTaskInfo(task, now).status !== 'healthy');
  const expiring = endingSoon(records, now);
  if (due.length === 0 && expiring.length === 0) return null;
  const parts = [
    due.length ? `${due.length} ${due.length === 1 ? 'task is' : 'tasks are'} due: ${due.slice(0, 3).map((t) => t.name).join(', ')}` : null,
    expiring.length ? `${expiring.length} ${expiring.length === 1 ? 'warranty or document expires' : 'warranties or documents expire'} soon` : null,
  ].filter(Boolean);
  return parts.join('. ') + '.';
}

/** Once a day, while Homebase is open, a notification lists what's due or overdue. */
export function useReminders() {
  const { settings, tasks, records } = useData();
  // A phone can keep Homebase suspended for days, so the check also runs when the date changes.
  const today = toDateInput(new Date(useNow()));

  useEffect(() => {
    if (!settings.reminders || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      if (localStorage.getItem(SENT_KEY) === today) return;
    } catch {
      return;
    }
    const body = reminderBody(tasks, records, Date.now());
    if (!body) return;
    // Marked before sending because sending is async and this can re-run meanwhile; undone on failure.
    try {
      localStorage.setItem(SENT_KEY, today);
    } catch {
      return;
    }
    showNotification('Homebase', { body, tag: 'homebase-daily' }).catch(() => {
      // Home still shows everything due. Clearing the mark lets the next check try again.
      try {
        localStorage.removeItem(SENT_KEY);
      } catch {
        // Nothing more to do.
      }
    });
  }, [settings.reminders, tasks, records, today]);
}
