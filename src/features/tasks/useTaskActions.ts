import { useCallback } from 'react';
import { useStore } from '../../data/DataProvider';
import type { Task } from '../../data/types';
import { useToast } from '../../ui/overlays';
import { completeTask, type CompletionInput } from './actions';

/** Quick completion with an Undo toast, used by the check and swipe-to-done. Resolves false if it was not saved. */
export function useTaskActions() {
  const store = useStore();
  const toast = useToast();

  const complete = useCallback(
    async (task: Task, input?: CompletionInput): Promise<boolean> => {
      try {
        const { message, undo } = await completeTask(store, task, input);
        toast(message, {
          action: {
            label: 'Undo',
            run: () => {
              undo().then(
                () => toast('Undone'),
                () => toast('That wasn’t undone. Try again.', { tone: 'error' }),
              );
            },
          },
        });
        return true;
      } catch {
        toast('That wasn’t saved. Try again.', { tone: 'error' });
        return false;
      }
    },
    [store, toast],
  );

  return { complete };
}
