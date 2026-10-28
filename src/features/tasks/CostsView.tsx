import type { Task } from '../../data/types';
import { addDays, formatCurrency, startOfDay } from '../../lib/dates';
import { EmptyState, Group, Row, Section } from '../../ui/layout';
import { CATEGORY_META, findType } from './presets';
import { annualCost, dueDateOf } from './taskMath';

/** What upkeep costs: per year, the next 90 days, by category, and what's due each month. */
export function CostsView({ tasks, now }: { tasks: Task[]; now: number }) {
  const priced = tasks.filter((task) => task.cost);
  if (tasks.length === 0) {
    return (
      <div className="section">
        <EmptyState title="No costs yet" body="Add a task with its cost and you’ll see what upkeep runs each year." />
      </div>
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
      <Section
        title="Costs"
        foot={priced.length === tasks.length ? 'Based on the cost entered for each task. Actual prices vary.' : `Based on ${priced.length} of ${tasks.length} tasks with a cost.`}
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
