import type { HomeData } from '../../data/store';
import { addDays, formatCurrency, formatDate, toDateInput } from '../../lib/dates';
import { SYSTEM_LABEL, SYSTEM_LIFESPAN } from '../property/labels';
import { RECORD_KIND_LABEL } from '../records/labels';
import { recommendationsFor } from '../home/insights';
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

const STOP = new Set(['the', 'for', 'my', 'our', 'a', 'an', 'of', 'to', 'is', 'where', 'find', 'what', 'whats', 'which', 'when', 'was', 'did', 'do', 'i', 'we', 'have', 'show', 'me', 'get', 'last', 'and', 'on', 'in', 'warranty', 'warranties', 'manual', 'manuals', 'receipt', 'receipts', 'document', 'documents', 'record', 'records', 'contractor', 'contractors', 'number', 'info', 'details', 'done', 'time', 'it', 'ok', 'are', 'ending', 'end', 'ends', 'soon', 'expire', 'expiring', 'coming', 'any', 'this', 'next', 'up', 'there', 'who', 'whos', 'our', 'can', 'you', 'please', 'old', 'how', 'year', 'age', 'should', 'serviced', 'cleaned', 'changed', 'replaced', 'swapped', 'fixed', 'checked', 'tested', 'flushed']);

/** The words in a question that name a thing ("water", "heater"), with simple plurals folded. */
function subjectWords(question: string): string[] {
  return words(question)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w));
}

function mentions(haystack: (string | undefined)[], subject: string[]): number {
  const text = haystack.filter(Boolean).join(' ').toLowerCase();
  return subject.filter((w) => text.includes(w)).length;
}

/** Records that match a question, best first: by title, vendor, notes and the item they cover. */
function findRecords(question: string, data: HomeData, kinds?: string[]) {
  const subject = subjectWords(question);
  return data.records
    .filter((r) => !kinds || kinds.includes(r.kind))
    .map((r) => {
      const item = data.items.find((i) => i.id === r.itemId);
      return { r, score: mentions([r.title, r.vendor, r.notes, item?.name, item?.brand, item?.model], subject) };
    })
    .filter((x) => subject.length === 0 || x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r);
}

/** Questions about the home itself, answered from its own data. */
function answerFromData(question: string, data: HomeData, now: number): Answer | null {
  const q = question.toLowerCase();
  const open = withInfo(data.tasks.filter((t) => t.status === 'open'), now).sort(compareUrgency);
  const year = new Date(now).getFullYear();

  // "What should I maintain this month?"
  if (/(maintain|maintenance|upkeep|look after|take care of|work on)/.test(q) && /(month|season|now|soon|should|next)/.test(q)) {
    const due = open.filter((i) => i.info.daysLeft <= 31);
    const seasonal = recommendationsFor(data, now);
    const aging = data.systems.filter((s) => s.installYear && year - s.installYear >= (SYSTEM_LIFESPAN[s.kind] ?? 99));
    const steps = [
      ...due.slice(0, 6).map((i) => `${i.task.name}: ${countdownText(i.info)}`),
      ...seasonal.slice(0, 3).map((r) => `${r.title} (seasonal): ${r.why}`),
      ...aging.map((s) => `${s.name} is ${year - s.installYear!} years old. Book an inspection before it fails.`),
    ];
    if (steps.length === 0) {
      return {
        text: open.length
          ? `Nothing needs you this month. The next job is ${open[0].task.name}, ${countdownText(open[0].info)}.`
          : 'You don’t have any tasks yet. Start with your HVAC filter, smoke alarms and gutters, and I’ll keep track of when each is due.',
        source: 'Your tasks and this season’s checklist',
        actions: [{ label: open.length ? 'Open Tasks' : 'Add a maintenance reminder', href: open.length ? '/tasks' : '/tasks?new=1&kind=maintenance' }],
      };
    }
    return {
      title: 'This month at home',
      text: due.length ? `${due.length} ${due.length === 1 ? 'task is' : 'tasks are'} due in the next month${seasonal.length ? ', plus a few seasonal jobs' : ''}:` : 'Nothing on your list is due, but these are worth doing this season:',
      steps,
      source: 'Your tasks, systems and this season’s checklist',
      actions: [{ label: 'Open Tasks', href: '/tasks' }, ...(seasonal.length ? [{ label: 'See seasonal jobs', href: '/home' }] : [])],
    };
  }

  // "Find the warranty for my water heater", "Where's the dishwasher manual?", "Who's our plumber?"
  const kindAsked = /warrant/.test(q) ? 'warranty' : /manual/.test(q) ? 'manual' : /receipt|invoice/.test(q) ? 'receipt' : /(contractor|plumber|electrician|roofer|handyman|hvac company|who did)/.test(q) ? 'contractor' : null;
  if (kindAsked && subjectWords(question).length > 0 && /(find|where|which|who|show|have|look up|get)/.test(q)) {
    const kinds = kindAsked === 'warranty' ? ['warranty', 'insurance'] : kindAsked === 'receipt' ? ['receipt', 'invoice'] : [kindAsked];
    const matches = findRecords(question.replace(/plumber|electrician|roofer|handyman/g, (m) => `${m} contractor`), data, kinds).slice(0, 4);
    const label = RECORD_KIND_LABEL[kinds[0] as keyof typeof RECORD_KIND_LABEL].toLowerCase();
    const subject = subjectWords(question).join(' ');
    if (matches.length) {
      return {
        title: matches.length === 1 ? matches[0].title : `${matches.length} matching records`,
        text: matches.length === 1 ? 'Here’s what you saved:' : 'Best match first:',
        steps: matches.map((r) => [r.title, r.expiresAt ? `ends ${formatDate(r.expiresAt)}` : null, r.vendor, r.phone].filter(Boolean).join(' · ')),
        source: 'Your records',
        actions: matches.slice(0, 2).map((r) => ({ label: `Open ${r.title}`, href: `/records/${r.id}` })),
      };
    }
    const system = data.systems.find((s) => mentions([s.name, SYSTEM_LABEL[s.kind], s.brand], subjectWords(question)) > 0);
    return {
      text: `I couldn’t find a ${label} that mentions “${subject}”.${system ? ` You have ${system.name}${system.installYear ? `, installed ${system.installYear}` : ''} in Home Systems; save its ${label} so it’s here next time.` : ' If you have it on paper, snap a photo and save it in Records.'}`,
      source: 'Your records',
      actions: [{ label: `Add a ${label}`, href: `/records?new=${kinds[0]}` }],
    };
  }

  // "When was the gutter last cleaned?"
  if (/(when|last time).*(last|done|cleaned|serviced|changed|replaced|swapped|did)/.test(q)) {
    const subject = subjectWords(question);
    const events = data.serviceEvents
      .map((e) => ({ e, score: mentions([e.title, e.notes, e.provider], subject) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.e.date.localeCompare(a.e.date));
    if (events.length) {
      const latest = events[0].e;
      return {
        text: `${latest.title} was last done on ${formatDate(latest.date)}${latest.provider ? ` by ${latest.provider}` : ''}${latest.cost ? `, for ${formatCurrency(latest.cost)}` : ''}.`,
        source: 'Service History',
        actions: [{ label: 'Open Service History', href: '/records/service-history' }],
      };
    }
    if (subject.length) {
      return { text: `I don’t see “${subject.join(' ')}” in your Service History yet. Mark the task done next time and it’ll be recorded.`, source: 'Service History', actions: [{ label: 'Open Service History', href: '/records/service-history' }] };
    }
  }

  // "How old is my house / furnace?"
  if (/how old|what year|age of/.test(q)) {
    const subject = subjectWords(question);
    const system = data.systems.find((s) => mentions([s.name, SYSTEM_LABEL[s.kind], s.brand], subject) > 0);
    if (system) {
      const life = SYSTEM_LIFESPAN[system.kind];
      return system.installYear
        ? { text: `${system.name} was installed in ${system.installYear}, so it’s about ${year - system.installYear} years old${life ? `. These usually last around ${life} years` : ''}.`, source: 'Home Systems', actions: [{ label: 'Open Home Systems', href: '/property/systems' }] }
        : { text: `I don’t know when ${system.name} was installed. Add the year and I’ll warn you as it ages.`, source: 'Home Systems', actions: [{ label: 'Add the install year', href: '/property/systems' }] };
    }
    if (/(house|home|place|building)/.test(q)) {
      const built = data.property?.yearBuilt;
      return built
        ? { text: `Your home was built in ${built}, so it’s about ${year - built} years old.${year - built >= 40 ? ' Homes this age are worth a wiring, plumbing and roof check if you haven’t had one recently.' : ''}`, source: 'Home details', actions: [{ label: 'Open home details', href: '/property/details' }] }
        : { text: 'I don’t know when your home was built yet.', source: 'Home details', actions: [{ label: 'Add the year built', href: '/property/details' }] };
    }
  }

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
        text: 'I don’t have a guide for that yet. I can help with leaks, heating and hot water, power and breakers, alarms, frozen pipes, clogs, air conditioning, keys and lockouts, and planning projects. I can also look things up in your home: what to maintain this month, a warranty or manual, when a job was last done, or how old a system is.',
        source: 'Homebase guides',
      };
    }
    return { title: best.title, text: best.summary, steps: best.steps, safety: best.safety, actions: best.actions, source: `Guide: ${best.title}` };
  },
};
