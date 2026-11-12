import type { Task, TaskCategory, TaskPriority } from '../../data/types';
import { formatDateShort } from '../../lib/dates';
import { CATEGORY_META, findType } from './presets';
import type { TaskInfo } from './taskMath';

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: 'High priority',
  normal: 'Normal priority',
  low: 'Low priority',
};

/** Older tasks have no category: use their preset's, or Other. */
export function taskCategory(task: Pick<Task, 'category' | 'typeId'>): TaskCategory {
  if (task.category) return task.category;
  return task.typeId && task.typeId !== 'custom' ? findType(task.typeId).category : 'other';
}

export const taskPriority = (task: Pick<Task, 'priority'>): TaskPriority => task.priority ?? 'normal';

/**
 * The short line under a task's name: what kind and when, nothing more. The place, the cost and
 * whether it's seasonal are on the task's own page. Normal priority isn't mentioned.
 */
export function taskMetaParts(task: Task, info: TaskInfo): string[] {
  const category = taskCategory(task);
  return [
    task.kind === 'repair' ? 'Repair' : task.kind === 'project' ? 'Project' : category !== 'other' ? CATEGORY_META[category].label : null,
    task.status === 'done' ? null : `${info.status === 'overdue' ? 'Was due' : 'Due'} ${formatDateShort(info.dueDate)}`,
  ].filter((part): part is string => Boolean(part));
}
