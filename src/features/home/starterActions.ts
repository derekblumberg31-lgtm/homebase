import type { HomeStore } from '../../data/store';
import { clearFlag, writeFlag } from '../../lib/deviceFlags';
import { newEntryId } from '../records/serviceLog';
import { buildStarterTask, type StarterJob } from './starter';
import type { LastDoneChoice } from '../tasks/lastDone';

export interface StarterPick {
  job: StarterJob;
  choice: LastDoneChoice;
}

/**
 * Saves the ticked jobs as ordinary recurring tasks in one write. If that write throws nothing is
 * kept and the starter flag is untouched. Once it succeeds, a failure in the extras (marking seasonal
 * tips as planned, the activity entries) is swallowed: the tasks are saved, and a tip with a similar
 * open task is hidden anyway. Returns an undo that puts everything back, including the flag.
 */
export async function addStarterJobs(store: HomeStore, picks: StarterPick[], now = Date.now()) {
  const tasks = picks.map(({ job, choice }) => buildStarterTask(job, choice, now));
  const before = store.getSnapshot();
  const previousTipStates = before.settings.tipStates;
  const activityBefore = new Set(before.activity.map((a) => a.id));

  await store.putMany('tasks', tasks);

  const stamp = new Date(now).toISOString();
  const planned = Object.fromEntries(
    picks.flatMap(({ job }, i) => (job.tipId ? [[job.tipId, { state: 'planned' as const, taskId: tasks[i].id, at: stamp }]] : [])),
  );
  if (Object.keys(planned).length > 0) {
    await store.updateSettings({ tipStates: { ...(previousTipStates ?? {}), ...planned } }).catch(() => {});
  }

  const activityIds: string[] = [];
  for (const [i, task] of tasks.entries()) {
    const text = `${picks[i].job.seasonal ? 'Planned' : 'Added'}: ${task.name}`;
    const href = `/tasks/${task.id}`;
    try {
      await store.log('task-added', text, href);
      const id = newEntryId(activityBefore, store.getSnapshot().activity, { kind: 'task-added', text, href });
      if (id) activityIds.push(id);
    } catch {
      /* the task is saved; the activity line is a nicety */
    }
  }

  writeFlag('homebase:starter-dismissed', '1');

  return {
    count: tasks.length,
    undo: async () => {
      for (const task of tasks) await store.remove('tasks', task.id);
      if (Object.keys(planned).length > 0) await store.updateSettings({ tipStates: previousTipStates });
      for (const id of activityIds) await store.remove('activity', id);
      clearFlag('homebase:starter-dismissed');
    },
  };
}
