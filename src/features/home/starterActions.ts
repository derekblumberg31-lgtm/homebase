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
 * Saves the ticked jobs as recurring tasks in one write. Once it succeeds, a failure in the extras
 * (tip state, activity entries) is swallowed, because reporting "not saved" would invite a duplicate.
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

  const entries: { id: string; taskId: string }[] = [];
  for (const [i, task] of tasks.entries()) {
    const text = `${picks[i].job.seasonal ? 'Planned' : 'Added'}: ${task.name}`;
    const href = `/tasks/${task.id}`;
    try {
      await store.log('task-added', text, href);
      const id = newEntryId(activityBefore, store.getSnapshot().activity, { kind: 'task-added', text, href });
      if (id) entries.push({ id, taskId: task.id });
    } catch {
      /* the activity line is optional */
    }
  }

  writeFlag('homebase:starter-dismissed', '1');

  return {
    count: tasks.length,
    undo: async () => {
      // First, so the starter block that returns when the last task goes reads the flag as cleared.
      clearFlag('homebase:starter-dismissed');
      // Only tasks still as they were added: one done or edited since is the user's now.
      const current = store.getSnapshot().tasks;
      const removable = tasks.filter((task) => current.some((t) => t.id === task.id && t.updatedAt === task.updatedAt));
      const removedIds = new Set(removable.map((t) => t.id));
      for (const task of removable) await store.remove('tasks', task.id);
      const undoneTips = Object.keys(planned).filter((tipId) => removedIds.has(planned[tipId].taskId!));
      if (undoneTips.length > 0) {
        const tipStates = { ...(store.getSnapshot().settings.tipStates ?? {}) };
        for (const tipId of undoneTips) {
          if (previousTipStates?.[tipId]) tipStates[tipId] = previousTipStates[tipId];
          else delete tipStates[tipId];
        }
        await store.updateSettings({ tipStates });
      }
      for (const entry of entries) if (removedIds.has(entry.taskId)) await store.remove('activity', entry.id);
    },
  };
}
