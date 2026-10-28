import { useEffect } from 'react';
import { useData } from '../data/DataProvider';
import { toDateInput } from '../lib/dates';
import { getTaskInfo } from '../features/tasks/taskMath';

const SENT_KEY = 'homebase:last-reminder';

/** Once a day, while Homebase is open, a notification lists what's due or overdue. */
export function useReminders() {
  const { settings, tasks, records } = useData();

  useEffect(() => {
    if (!settings.reminders || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      if (localStorage.getItem(SENT_KEY) === toDateInput()) return;
    } catch {
      return;
    }
    const now = Date.now();
    const due = tasks.filter((task) => task.status === 'open' && getTaskInfo(task, now).status !== 'healthy');
    const soon = new Date(now + 30 * 86_400_000).toISOString().slice(0, 10);
    const expiring = records.filter((record) => record.expiresAt && record.expiresAt <= soon && record.expiresAt >= toDateInput());
    if (due.length === 0 && expiring.length === 0) return;
    const parts = [
      due.length ? `${due.length} ${due.length === 1 ? 'task is' : 'tasks are'} due: ${due.slice(0, 3).map((t) => t.name).join(', ')}` : null,
      expiring.length ? `${expiring.length} ${expiring.length === 1 ? 'warranty or document expires' : 'warranties or documents expire'} soon` : null,
    ].filter(Boolean);
    try {
      new Notification('Homebase', { body: parts.join('. ') + '.', tag: 'homebase-daily' });
      localStorage.setItem(SENT_KEY, toDateInput());
    } catch {
      // Home still shows everything due.
    }
  }, [settings.reminders, tasks, records]);
}
