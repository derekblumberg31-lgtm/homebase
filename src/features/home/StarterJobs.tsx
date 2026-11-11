import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useData, useNow, useStore } from '../../data/DataProvider';
import { clearFlag, readFlag, writeFlag } from '../../lib/deviceFlags';
import { Check } from '../../ui/Icons';
import { nextRadioIndex } from '../../ui/radioKeys';
import { EmptyState } from '../../ui/layout';
import { useToast } from '../../ui/overlays';
import { LAST_DONE_OPTIONS, type LastDoneChoice } from '../tasks/lastDone';
import { chooseStarter, starterJobsFor, starterSubLine, toggleStarter, type StarterJob, type StarterPicks } from './starter';
import { addStarterJobs } from './starterActions';

interface StarterListProps {
  jobs: StarterJob[];
  picks: StarterPicks;
  now: number;
  busy?: boolean;
  onToggle: (key: string) => void;
  onChoose: (key: string, choice: LastDoneChoice) => void;
  onAdd: () => void;
  onDismiss: () => void;
}

function Choices({ jobKey, value, labelId, onChoose }: { jobKey: string; value: LastDoneChoice; labelId: string; onChoose: (key: string, choice: LastDoneChoice) => void }) {
  const group = useRef<HTMLDivElement>(null);
  // Arrow keys move and select, as native radios do; Tab leaves the group.
  function onKeyDown(event: KeyboardEvent) {
    const radios = Array.from(group.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []);
    const index = nextRadioIndex(event.key, radios.indexOf(document.activeElement as HTMLElement), LAST_DONE_OPTIONS.length);
    if (index === null) return;
    event.preventDefault();
    onChoose(jobKey, LAST_DONE_OPTIONS[index].value);
    radios[index]?.focus();
  }
  return (
    <div className="starter-choices" role="radiogroup" aria-labelledby={labelId} ref={group} onKeyDown={onKeyDown}>
      {LAST_DONE_OPTIONS.map((option) => (
        <button key={option.value} type="button" role="radio" className="chip" aria-checked={value === option.value} tabIndex={value === option.value ? 0 : -1} onClick={() => onChoose(jobKey, option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The block itself, with no data access, so it can be rendered and tested on its own. */
export function StarterList({ jobs, picks, now, busy, onToggle, onChoose, onAdd, onDismiss }: StarterListProps) {
  const uidBase = useId();
  const count = Object.keys(picks).length;
  return (
    <section className="starter" aria-labelledby={`${uidBase}-h`}>
      <h2 id={`${uidBase}-h`}>Start with a few common jobs</h2>
      <p>Choose the ones that apply. Nothing is saved until you add them.</p>
      <ul className="group starter-list">
        {jobs.map((job, i) => {
          const choice = picks[job.key];
          const ticked = choice !== undefined;
          const titleId = `${uidBase}-title-${i}`;
          const subId = `${uidBase}-sub-${i}`;
          const questionId = `${uidBase}-q-${i}`;
          return (
            <li key={job.key} className="starter-item">
              <button type="button" role="checkbox" aria-checked={ticked} aria-labelledby={titleId} aria-describedby={subId} className="starter-row" onClick={() => onToggle(job.key)}>
                <span className="starter-tick" aria-hidden="true">
                  {ticked && <Check size={14} strokeWidth={2.4} />}
                </span>
                <span className="row-main">
                  <span className="row-title is-wrap" id={titleId}>
                    {job.name}
                  </span>
                  <span className="row-sub is-wrap" id={subId}>
                    {starterSubLine(job, choice, now)}
                  </span>
                </span>
              </button>
              {ticked && (
                <div className="starter-when">
                  <p id={questionId}>When did you last do this?</p>
                  <Choices jobKey={job.key} value={choice} labelId={questionId} onChoose={onChoose} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="starter-footer">
        <button type="button" className="button is-primary is-block" disabled={count === 0 || busy} onClick={onAdd}>
          {count === 0 ? 'Add jobs' : `Add ${count} ${count === 1 ? 'job' : 'jobs'}`}
        </button>
        <div className="starter-links">
          <Link className="text-button" to="/tasks?new=1&kind=maintenance">
            Add your own
          </Link>
          <button type="button" className="text-button" onClick={onDismiss}>
            Not now
          </button>
        </div>
      </div>
    </section>
  );
}

const readDismissed = () => readFlag('homebase:starter-dismissed') === '1';

/**
 * Home's empty state for a first-time user: common jobs to tick, or (once dismissed, or when tasks
 * exist but none is open) the plain empty state. `onAdded` lets Home move focus to the new list.
 */
export function StarterJobs({ onAdded }: { onAdded: () => void }) {
  const data = useData();
  const store = useStore();
  const now = useNow();
  const toast = useToast();
  const [picks, setPicks] = useState<StarterPicks>({});
  const [dismissed, setDismissed] = useState(readDismissed);
  const [busy, setBusy] = useState(false);
  const focusFallback = useRef(false);
  const root = useRef<HTMLDivElement>(null);

  const jobs = useMemo(() => starterJobsFor(data, now), [data, now]);
  // A job that left the list (the season turned) drops its tick.
  const live = useMemo(() => Object.fromEntries(Object.entries(picks).filter(([key]) => jobs.some((j) => j.key === key))) as StarterPicks, [picks, jobs]);

  useEffect(() => {
    if (!dismissed || !focusFallback.current) return;
    focusFallback.current = false;
    root.current?.querySelector<HTMLElement>('.empty .button')?.focus();
  }, [dismissed]);

  async function add() {
    const chosen = jobs.filter((j) => j.key in live).map((job) => ({ job, choice: live[job.key] }));
    if (chosen.length === 0 || busy) return;
    setBusy(true);
    try {
      const { count, undo } = await addStarterJobs(store, chosen, Date.now());
      onAdded();
      toast(`${count} ${count === 1 ? 'job' : 'jobs'} added`, {
        action: {
          label: 'Undo',
          run: () => {
            undo().then(
              () => {
                setPicks({});
                setDismissed(false);
              },
              () => toast('That wasn’t undone. Try again.', { tone: 'error' }),
            );
          },
        },
      });
    } catch {
      toast('Those jobs weren’t added. Try again.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    writeFlag('homebase:starter-dismissed', '1');
    focusFallback.current = true;
    setDismissed(true);
    toast('Suggestions hidden', {
      action: {
        label: 'Undo',
        run: () => {
          clearFlag('homebase:starter-dismissed');
          setDismissed(false);
        },
      },
    });
  }

  if (dismissed || jobs.length === 0) {
    return (
      <div ref={root}>
        <EmptyState
          title="Start with the jobs you always forget"
          body="The furnace filter, smoke alarm batteries, the gutters. Add one and Homebase counts down to it."
          action={{ label: 'Add a maintenance job', to: '/tasks?new=1&kind=maintenance' }}
        />
      </div>
    );
  }

  return (
    <div ref={root}>
      <StarterList
        jobs={jobs}
        picks={live}
        now={now}
        busy={busy}
        onToggle={(key) => setPicks((p) => toggleStarter(p, key))}
        onChoose={(key, choice) => setPicks((p) => chooseStarter(p, key, choice))}
        onAdd={add}
        onDismiss={dismiss}
      />
    </div>
  );
}
