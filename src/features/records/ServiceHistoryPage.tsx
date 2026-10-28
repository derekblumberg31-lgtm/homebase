import { useMemo } from 'react';
import { useData } from '../../data/DataProvider';
import { formatCurrency, formatDate } from '../../lib/dates';
import { EmptyState, Group, Page, Row, Section } from '../../ui/layout';

/** Service History: every time something was done around the home, newest first, by year. */
export function ServiceHistoryPage() {
  const { serviceEvents, tasks } = useData();
  const years = useMemo(() => {
    const byYear = new Map<string, typeof serviceEvents>();
    for (const event of [...serviceEvents].sort((a, b) => b.date.localeCompare(a.date))) {
      const year = event.date.slice(0, 4);
      byYear.set(year, [...(byYear.get(year) ?? []), event]);
    }
    return [...byYear.entries()];
  }, [serviceEvents]);

  return (
    <Page title="Service History" subtitle="Built up as you mark tasks done." back={{ to: '/records', label: 'Records' }}>
      {years.length === 0 ? (
        <div className="section">
          <EmptyState title="Nothing recorded yet" body="When you mark a task done, the date, who did it, the cost and a note are kept here." action={{ label: 'Go to Tasks', to: '/tasks' }} />
        </div>
      ) : (
        years.map(([year, events]) => {
          const spent = events.reduce((sum, e) => sum + (e.cost ?? 0), 0);
          return (
            <Section key={year} title={year} aside={spent ? `${formatCurrency(Math.round(spent))} spent` : `${events.length} ${events.length === 1 ? 'visit' : 'visits'}`}>
              <Group>
                {events.map((event) => {
                  const live = tasks.some((t) => t.id === event.taskId);
                  return (
                    <Row
                      key={event.id}
                      title={event.title}
                      sub={[formatDate(event.date), event.provider, event.notes].filter(Boolean).join(' · ')}
                      value={event.cost != null ? formatCurrency(event.cost) : undefined}
                      to={live ? `/tasks/${event.taskId}` : undefined}
                    />
                  );
                })}
              </Group>
            </Section>
          );
        })
      )}
    </Page>
  );
}
