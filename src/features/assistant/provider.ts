import type { HomeData } from '../../data/store';
import { addDays, formatCurrency, formatDate, toDateInput } from '../../lib/dates';
import { annualCost, compareUrgency, countdownText, withInfo } from '../tasks/taskMath';
import { GUIDES, type Guide, type GuideAction } from './guides';

export interface Answer {
  title?: string;
  text: string;
  steps?: string[];
  safety?: string;
  actions?: GuideAction[];
  /** Where the answer came from, shown under it. */
  source: string;
}

/**
 * Anything that can answer a homeowner's question. LocalGuideProvider works offline from the guide
 * library and the home's own data; a future AI provider gets the same question and context.
 */
export interface AssistantProvider {
  name: string;
  answer(question: string, data: HomeData, now: number): Promise<Answer>;
}

const words = (s: string) => s.toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9/]+/).filter(Boolean);

function scoreGuide(guide: Guide, question: string): number {
  const q = question.toLowerCase();
  const tokens = new Set(words(question));
  let score = 0;
  for (const keyword of guide.keywords) {
    if (keyword.includes(' ') ? q.includes(keyword) : tokens.has(keyword)) score += keyword.includes(' ') ? 3 : 2;
  }
  return score;
}

/** Questions about the home itself, answered from its own data. */
function answerFromData(question: string, data: HomeData, now: number): Answer | null {
  const q = question.toLowerCase();
  const open = withInfo(data.tasks.filter((t) => t.status === 'open'), now).sort(compareUrgency);

  if (/\b(due|overdue|to do|todo|next|this week|upcoming)\b/.test(q) && !/warrant/.test(q)) {
    const horizon = /week/.test(q) ? 7 : 30;
    const due = open.filter((i) => i.info.daysLeft <= horizon);
    if (due.length === 0) {
      return { text: `Nothing is due in the next ${horizon === 7 ? 'week' : 'month'}. ${open.length ? `The next task is ${open[0].task.name}, ${countdownText(open[0].info)}.` : 'Add tasks and they’ll show here.'}`, source: 'Your tasks', actions: [{ label: 'Open Tasks', href: '/tasks' }] };
    }
    return {
      title: `${due.length} ${due.length === 1 ? 'task' : 'tasks'} due ${horizon === 7 ? 'this week' : 'in the next month'}`,
      text: 'Soonest first:',
      steps: due.slice(0, 8).map((i) => `${i.task.name}: ${countdownText(i.info)}`),
      source: 'Your tasks',
      actions: [{ label: 'Open Tasks', href: '/tasks' }],
    };
  }

  if (/warrant|expir|insurance/.test(q)) {
    const today = toDateInput(new Date(now));
    const soon = toDateInput(addDays(new Date(now), 90));
    const ending = data.records.filter((r) => r.expiresAt && r.expiresAt >= today && r.expiresAt <= soon);
    if (data.records.filter((r) => r.kind === 'warranty').length === 0) {
      return { text: 'You haven’t saved any warranties yet. Add one with its end date and Homebase reminds you two months before it runs out.', source: 'Your records', actions: [{ label: 'Add a warranty', href: '/records?new=warranty' }] };
    }
    return ending.length
      ? { title: `${ending.length} ending in the next 90 days`, text: 'Check what’s covered before they end:', steps: ending.map((r) => `${r.title}: ends ${formatDate(r.expiresAt!)}`), source: 'Your records', actions: [{ label: 'Open the Warranty Vault', href: '/records' }] }
      : { text: 'No warranties end in the next 90 days.', source: 'Your records', actions: [{ label: 'Open the Warranty Vault', href: '/records' }] };
  }

  if (/(how much|spend|spending|upkeep cost|yearly cost|budget for upkeep)/.test(q)) {
    const yearly = open.reduce((sum, i) => sum + annualCost(i.task), 0);
    return { text: yearly ? `Based on the costs you’ve entered, recurring upkeep runs about ${formatCurrency(Math.round(yearly))} a year.` : 'Add costs to your tasks and Homebase will estimate your yearly upkeep.', source: 'Your tasks', actions: [{ label: 'See costs', href: '/tasks?view=costs' }] };
  }

  return null;
}

export const LocalGuideProvider: AssistantProvider = {
  name: 'Homebase guides',
  async answer(question, data, now) {
    const fromData = answerFromData(question, data, now);
    if (fromData) return fromData;
    const ranked = GUIDES.map((g) => ({ g, score: scoreGuide(g, question) })).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
    const best = ranked[0]?.g;
    if (!best) {
      return {
        text: 'I don’t have a guide for that yet. I can help with leaks, heating and hot water, power and breakers, alarms, frozen pipes, clogs, air conditioning, keys and lockouts, and planning projects. You can also ask what’s due or which warranties are ending.',
        source: 'Homebase guides',
      };
    }
    return { title: best.title, text: best.summary, steps: best.steps, safety: best.safety, actions: best.actions, source: `Guide: ${best.title}` };
  },
};
