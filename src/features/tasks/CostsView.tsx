import { useState } from 'react';
import type { HomeSystem, Item, ServiceEvent, Task } from '../../data/types';
import { addDays, formatCurrency, startOfDay } from '../../lib/dates';
import { Segmented } from '../../ui/controls';
import { EmptyState, Group, Row, Section } from '../../ui/layout';
import { CATEGORY_META, findType } from './presets';
import { hasLoggedCosts, spentBySystem, spentByYear } from './spent';
import { annualCost, dueDateOf } from './taskMath';

const ALL = 'all';

/** What was actually spent: only costs entered in Service history, by year and by system. */
function SpentSection({ events, systems, items, tasks, now }: { events: ServiceEvent[]; systems: HomeSystem[]; items: Item[]; tasks: Task[]; now: number }) {
  const years = spentByYear(events);
  const currentYear = String(new Date(now).getFullYear());
  const [picked, setPicked] = useState<string | undefined>();
  if (!hasLoggedCosts(events)) {
    return (
      <Section title="What you’ve spent">
        <p className="section-foot">No costs logged yet. Add what a job cost when you mark it done, or in Service history.</p>
      </Section>
    );
  }
  const withCosts = years.filter((y) => y.count > 0);
  const fallback = withCosts.some((y) => y.year === currentYear) ? currentYear : withCosts[0].year;
  const choice = picked && (picked === ALL || years.some((y) => y.year === picked)) ? picked : fallback;
  const shown = choice === ALL ? years : years.filter((y) => y.year === choice);
  const total = shown.reduce((sum, y) => sum + y.total, 0);
  const priced = shown.reduce((sum, y) => sum + y.count, 0);
  const jobs = priced + shown.reduce((sum, y) => sum + y.unpriced, 0);
  const bySystem = spentBySystem(events, systems, items, tasks, choice === ALL ? undefined : choice);

  return (
    <Section title="What you’ve spent" foot="Totals of the costs entered in Service history. Jobs saved without a cost aren’t counted.">
      {years.length > 1 && (
        <Segmented
          label="Year"
          value={choice}
          onChange={setPicked}
          options={[...years.map((y) => ({ value: y.year, label: y.year })), { value: ALL, label: 'All years' }]}
        />
      )}
      <Group>
        <Row title="Total" value={<strong className="figure">{formatCurrency(Math.round(total * 100) / 100)}</strong>} />
        <Row title="Jobs with a cost" value={`${priced} of ${jobs}`} />
      </Group>
      {bySystem.length > 0 && (
        <>
          <h3 className="spent-sub">By system</h3>
          <Group>
            {bySystem.map((row) => (
              <Row key={row.key} title={row.label} value={formatCurrency(Math.round(row.total * 100) / 100)} to={row.href} />
            ))}
          </Group>
        </>
      )}
    </Section>
  );
}

interface Props {
  tasks: Task[];
  serviceEvents: ServiceEvent[];
  systems: HomeSystem[];
  items: Item[];
  /** Every task, open or not: a finished job's system is found through its task. */
  allTasks: Task[];
  now: number;
}

/** Costs: what was spent (from Service history), then what upkeep is planned to cost (estimates). */
export function CostsView({ tasks, serviceEvents, systems, items, allTasks, now }: Props) {
  const spent = <SpentSection events={serviceEvents} systems={systems} items={items} tasks={allTasks} now={now} />;
  const priced = tasks.filter((task) => task.cost);
  if (tasks.length === 0) {
    return (
      <>
        {spent}
        <div className="section">
          <EmptyState title="No costs yet" body="Add a task with its cost and you’ll see what upkeep runs each year." />
        </div>
      </>
    );
  }

  const yearly = tasks.reduce((sum, task) => sum + annualCost(task), 0);
  const today = startOfDay(now);
  const horizon = addDays(today, 90).getTime();
  const soon = tasks.filter((task) => dueDateOf(task).getTime() <= horizon);
  const soonCost = soon.reduce((sum, task) => sum + (task.cost ?? 0), 0);
  const jobsPerYear = tasks.filter((t) => t.recurring).reduce((sum, task) => sum + 365 / task.intervalDays, 0);
  const oneOff = tasks.filter((t) => !t.recurring).reduce((sum, task) => sum + (task.cost ?? 0), 0);

  const byCategory = new Map<string, number>();
  for (const task of tasks) {
    const label = task.recurring ? CATEGORY_META[findType(task.typeId).category].label : task.kind === 'repair' ? 'Repairs' : 'Projects';
    byCategory.set(label, (byCategory.get(label) ?? 0) + 1);
  }
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

  const months = Array.from({ length: 6 }, (_, i) => {
    const start = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const end = new Date(today.getFullYear(), today.getMonth() + i + 1, 1);
    const count = tasks.filter((task) => {
      const due = dueDateOf(task);
      return (i === 0 ? due < end : due >= start && due < end);
    }).length;
    return { key: start.toISOString(), label: start.toLocaleDateString(undefined, { month: 'short' }), count };
  });
  const max = Math.max(1, ...months.map((m) => m.count));

  return (
    <>
      {spent}
      <Section
        title="Planned upkeep"
        foot={
          priced.length === tasks.length
            ? 'Based on the cost you entered for each task. These are estimates, not what you spent.'
            : `Based on ${priced.length} of ${tasks.length} tasks with a cost. These are estimates, not what you spent.`
        }
      >
        <Group>
          <Row title="Upkeep per year" value={<strong className="figure">{formatCurrency(Math.round(yearly))}</strong>} />
          <Row title="Next 90 days" value={`${formatCurrency(Math.round(soonCost))} · ${soon.length} ${soon.length === 1 ? 'task' : 'tasks'}`} />
          {oneOff > 0 && <Row title="Open repairs and projects" value={formatCurrency(Math.round(oneOff))} />}
          <Row title="Recurring jobs per year" value={Math.round(jobsPerYear)} />
        </Group>
      </Section>

      <Section title="By category" aside={`${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`}>
        <div className="group chart-card">
          {categories.map(([label, count]) => (
            <div className="bar-row" key={label}>
              <span>{label}</span>
              <span className="bar-track">
                <span style={{ width: `${Math.max(6, Math.round((count / tasks.length) * 100))}%` }} />
              </span>
              <span className="bar-count">{count}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Next 6 months" foot="Based on the due dates in Homebase.">
        <div className="group chart-card">
          <div className="months" role="img" aria-label={months.map((m) => `${m.label}: ${m.count}`).join(', ')}>
            {months.map((month) => (
              <div className="month" key={month.key}>
                <span className="month-count">{month.count || ''}</span>
                <span className="month-track">
                  <span style={{ height: `${month.count ? Math.max(14, Math.round((month.count / max) * 100)) : 4}%` }} />
                </span>
                <span className="month-label">{month.label}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </>
  );
}
