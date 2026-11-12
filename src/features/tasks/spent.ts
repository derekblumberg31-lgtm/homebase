import type { HomeSystem, Item, ServiceEvent, Task } from '../../data/types';

/** What was spent is only ever a cost the homeowner entered on a Service history entry. An estimate on a task never counts. */
const priced = (event: ServiceEvent) => typeof event.cost === 'number';

export interface YearSpent {
  year: string;
  total: number;
  /** Jobs that have a cost. */
  count: number;
  /** Jobs saved without one. */
  unpriced: number;
}

/** Totals by year, newest first. A cost of 0 counts as a cost (a free warranty repair). */
export function spentByYear(events: ServiceEvent[]): YearSpent[] {
  const years = new Map<string, YearSpent>();
  for (const event of events) {
    const year = event.date.slice(0, 4);
    const row = years.get(year) ?? { year, total: 0, count: 0, unpriced: 0 };
    if (priced(event)) {
      row.total += event.cost!;
      row.count += 1;
    } else row.unpriced += 1;
    years.set(year, row);
  }
  return [...years.values()].sort((a, b) => b.year.localeCompare(a.year));
}

export interface SystemSpent {
  key: string;
  label: string;
  total: number;
  count: number;
  /** The system or item page, when it still exists. */
  href?: string;
}

export const NOT_LINKED = 'Not linked to a system';

/** Costs grouped by what they were spent on: the event's system, the task's system, the item, then nothing. Biggest first. */
export function spentBySystem(events: ServiceEvent[], systems: HomeSystem[], items: Item[], tasks: Task[], year?: string): SystemSpent[] {
  const groups = new Map<string, SystemSpent>();
  for (const event of events) {
    if (!priced(event) || (year && event.date.slice(0, 4) !== year)) continue;
    const task = tasks.find((t) => t.id === event.taskId);
    const systemId = event.systemId ?? task?.systemId;
    const itemId = systemId ? undefined : (event.itemId ?? task?.itemId);
    let key = 'none';
    let label = NOT_LINKED;
    let href: string | undefined;
    if (systemId) {
      const system = systems.find((s) => s.id === systemId);
      key = `s:${systemId}`;
      label = system?.name ?? 'Removed system';
      href = system ? `/property/systems/${system.id}` : undefined;
    } else if (itemId) {
      const item = items.find((i) => i.id === itemId);
      if (item && item.kind !== 'key') {
        key = `i:${itemId}`;
        label = item.name;
        href = `/property/items/${item.id}`;
      }
    }
    const group = groups.get(key) ?? { key, label, total: 0, count: 0, href };
    group.total += event.cost!;
    group.count += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

/** True when any entry in Service history has a cost. */
export const hasLoggedCosts = (events: ServiceEvent[]) => events.some(priced);
