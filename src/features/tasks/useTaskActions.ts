import { useCallback } from 'react';
import { useStore } from '../../data/DataProvider';
import type { Task } from '../../data/types';
import { useToast } from '../../ui/overlays';
import { completeTask, type CompletionInput } from './actions';

/** Quick completion with an Undo toast, used by swipe-to-done on Home and Tasks. */
export function useTaskActions() {
  const store = useStore();
  const toast = useToast();

  const complete = useCallback(
    async (task: Task, input?: CompletionInput) => {
      try {
        const { message, undo } = await completeTask(store, task, input);
        toast(message, { action: { label: 'Undo', run: () => void undo() } });
      } catch {
        toast('That wasn’t saved. Try again.', { tone: 'error' });
      }
    },
    [store, toast],
  );

  return { complete };
}
