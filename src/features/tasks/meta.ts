import type { Task, TaskCategory, TaskPriority } from '../../data/types';
import { formatCurrency, formatDateShort } from '../../lib/dates';
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
 * The short line under a task's name: where, what kind, when, how much, and whether it's seasonal.
 * Normal priority isn't mentioned, so only the exceptions stand out.
 */
export function taskMetaParts(task: Task, info: TaskInfo): string[] {
  const category = taskCategory(task);
  return [
    task.location || null,
    task.kind === 'repair' ? 'Repair' : task.kind === 'project' ? 'Project' : category !== 'other' ? CATEGORY_META[category].label : null,
    task.status === 'done' ? null : `${info.status === 'overdue' ? 'Was due' : 'Due'} ${formatDateShort(info.dueDate)}`,
    task.cost ? formatCurrency(task.cost) : null,
    task.seasonal ? 'Seasonal' : null,
  ].filter((part): part is string => Boolean(part));
}
