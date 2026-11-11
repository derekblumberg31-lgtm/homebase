import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useData } from "../../data/DataProvider";
import { formatCurrency, formatDate } from "../../lib/dates";
import { CircleCheck } from "../../ui/Icons";
import { EmptyState, Group, Page, Row, Section } from "../../ui/layout";
import { useToast } from "../../ui/overlays";
import { LogJobSheet } from "./LogJobSheet";

/** Service History: every time something was done around the home, newest first, by year. */
export function ServiceHistoryPage() {
  const { serviceEvents, tasks } = useData();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const logging = params.get("log") === "1";
  const closeLog = () => setParams({}, { replace: true });
  const years = useMemo(() => {
    const byYear = new Map<string, typeof serviceEvents>();
    for (const event of [...serviceEvents].sort((a, b) =>
      b.date.localeCompare(a.date),
    )) {
      const year = event.date.slice(0, 4);
      byYear.set(year, [...(byYear.get(year) ?? []), event]);
    }
    return [...byYear.entries()];
  }, [serviceEvents]);

  return (
    <Page
      title="Service History"
      subtitle="Jobs done around the home, newest first."
      back={{ to: "/records", label: "Records" }}
    >
      {years.length === 0 ? (
        <div className="section">
          <EmptyState
            title="Nothing recorded yet"
            body="Jobs you mark done, and jobs you log here, are kept with the date, who did it and the cost."
            action={{
              label: "Log something done",
              onClick: () => setParams({ log: "1" }, { replace: true }),
            }}
            secondary={{ label: "Go to Tasks", to: "/tasks" }}
          />
        </div>
      ) : (
        <>
          <div className="section">
            <Group>
              <Row
                title="Log something done"
                tone="action"
                lead={<CircleCheck size={20} />}
                chevron={false}
                onClick={() => setParams({ log: "1" }, { replace: true })}
              />
            </Group>
          </div>
          {years.map(([year, events]) => {
            const spent = events.reduce((sum, e) => sum + (e.cost ?? 0), 0);
            return (
              <Section
                key={year}
                title={year}
                aside={
                  spent
                    ? `${formatCurrency(Math.round(spent))} spent`
                    : `${events.length} ${events.length === 1 ? "visit" : "visits"}`
                }
              >
                <Group>
                  {events.map((event) => {
                    const live = tasks.some((t) => t.id === event.taskId);
                    return (
                      <Row
                        key={event.id}
                        title={event.title}
                        sub={[
                          formatDate(event.date),
                          event.provider,
                          event.notes,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        value={
                          event.cost != null
                            ? formatCurrency(event.cost)
                            : undefined
                        }
                        to={live ? `/tasks/${event.taskId}` : undefined}
                      />
                    );
                  })}
                </Group>
              </Section>
            );
          })}
        </>
      )}
      {logging && (
        <LogJobSheet
          itemId={params.get("itemId") ?? undefined}
          onClose={closeLog}
          onLogged={(event, undo) => {
            closeLog();
            toast(`${event.title} logged`, {
              action: {
                label: "Undo",
                run: () => {
                  undo().then(
                    () => toast("Undone"),
                    () =>
                      toast("That wasn’t undone. Try again.", {
                        tone: "error",
                      }),
                  );
                },
              },
            });
          }}
        />
      )}
    </Page>
  );
}
