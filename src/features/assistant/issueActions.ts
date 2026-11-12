import { uid } from '../../data/ids';
import type { HomeStore } from '../../data/store';
import type { HomeRecord, ServiceEvent, Task } from '../../data/types';
import { addDays, formatDate, toDateInput } from '../../lib/dates';
import type { Guide } from './guides';
import type { IssueSubject } from './issueContext';

/**
 * Turns an Assistant answer into home records: a repair task, a note, a shopping list, a
 * follow-up reminder, or a resolved entry in Service history. Everything the homeowner told the
 * Assistant (their question and answers) goes into the notes, so the next person, or the
 * plumber, sees the whole story.
 */

export interface Issue {
  guide: Guide;
  question: string;
  /** "Is water still coming out?: Stopped after closing a valve" */
  answers: string[];
  subject?: IssueSubject;
}

export function issueSummary(issue: Issue, date = toDateInput()): string {
  return [`Reported ${formatDate(date)}: “${issue.question}”`, ...issue.answers].join('\n');
}

const subjectLinks = (subject?: IssueSubject) => (subject?.kind === 'system' ? { systemId: subject.id } : subject?.kind === 'item' ? { itemId: subject.id } : {});

function baseTask(issue: Issue, over: Partial<Task>): Task {
  const now = new Date().toISOString();
  return {
    id: uid(),
    kind: 'repair',
    name: issue.guide.repairName ?? `Fix: ${issue.guide.title.toLowerCase()}`,
    typeId: 'custom',
    location: '',
    lastDoneAt: toDateInput(),
    intervalDays: 30,
    recurring: false,
    status: 'open',
    category: issue.guide.trade === 'plumber' ? 'water' : issue.guide.trade === 'hvac' ? 'air' : issue.guide.trade === 'electrician' ? 'safety' : issue.guide.trade === 'appliance' ? 'appliance' : 'maintenance',
    ...subjectLinks(issue.subject),
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

/** A repair task due in two days (today if anything was an emergency), with the full story. */
export async function createRepairTask(store: HomeStore, issue: Issue, urgent: boolean) {
  const task = baseTask(issue, {
    dueDate: toDateInput(addDays(new Date(), urgent ? 0 : 2)),
    priority: urgent ? 'high' : 'normal',
    notes: [issueSummary(issue), issue.guide.safety ? `When to call a pro: ${issue.guide.safety}` : null].filter(Boolean).join('\n\n'),
  });
  await store.put('tasks', task);
  await store.log('task-added', `Repair added from the Assistant: ${task.name}`, `/tasks/${task.id}`);
  return task;
}

/** A one-off check a few days out: "Check the leak area is dry". */
export async function createFollowUp(store: HomeStore, issue: Issue) {
  const days = issue.guide.followUpDays ?? 3;
  const task = baseTask(issue, {
    kind: 'repair',
    name: issue.guide.followUpName ?? `Check on: ${issue.guide.title.toLowerCase()}`,
    dueDate: toDateInput(addDays(new Date(), days)),
    priority: 'normal',
    notes: issueSummary(issue),
  });
  await store.put('tasks', task);
  await store.log('task-added', `Follow-up added: ${task.name}`, `/tasks/${task.id}`);
  return task;
}

function note(title: string, notes: string, issue: Issue): HomeRecord {
  const now = new Date().toISOString();
  return { id: uid(), kind: 'note', title, notes, ...subjectLinks(issue.subject), fileIds: [], date: toDateInput(), createdAt: now, updatedAt: now };
}

export async function saveIssueNote(store: HomeStore, issue: Issue) {
  const record = note(`${issue.guide.title}, ${formatDate(toDateInput())}`, issueSummary(issue), issue);
  await store.put('records', record);
  await store.log('record-added', `Note saved: ${record.title}`, `/records/${record.id}`);
  return record;
}

export async function createShoppingList(store: HomeStore, issue: Issue) {
  const items = issue.guide.shopping ?? [];
  const record = note(`Shopping list: ${issue.guide.title.toLowerCase()}`, items.map((i) => `☐ ${i}`).join('\n'), issue);
  await store.put('records', record);
  await store.log('record-added', `Shopping list saved: ${issue.guide.title.toLowerCase()}`, `/records/${record.id}`);
  return record;
}

/** Fixed: kept in Service history with what happened, and in recent activity. */
export async function resolveIssue(store: HomeStore, issue: Issue, input: { provider?: string; notes?: string; cost?: number } = {}) {
  const event: ServiceEvent = {
    id: uid(),
    date: toDateInput(),
    title: `Resolved: ${issue.guide.title}`,
    ...subjectLinks(issue.subject),
    provider: input.provider?.trim() || undefined,
    cost: input.cost,
    notes: [input.notes?.trim(), issueSummary(issue)].filter(Boolean).join('\n'),
    createdAt: new Date().toISOString(),
  };
  await store.put('serviceEvents', event);
  await store.log('task-done', `Resolved: ${issue.guide.title}`, '/records/service-history');
  return { event, undo: () => store.remove('serviceEvents', event.id) };
}
