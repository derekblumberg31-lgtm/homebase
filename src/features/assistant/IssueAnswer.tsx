import { useState, type ReactNode } from 'react';
import { useStore } from '../../data/DataProvider';
import { TextField } from '../../ui/controls';
import { AlertTriangle, Camera, Check, ChevronRight, CircleCheck, Clock, FileText, MoreHorizontal, NotePad, Phone, Receipt, Wrench } from '../../ui/Icons';
import { Sheet, useToast } from '../../ui/overlays';
import { damageReportHref } from '../records/damageReport';
import { TRADE_LABEL } from './guides';
import { telHref } from '../safety/safety';
import { createFollowUp, createRepairTask, createShoppingList, resolveIssue, saveIssueNote, type Issue } from './issueActions';
import type { Answer } from './provider';
import { isCriticalGuide, type ContextFact } from './issueContext';

const VISIBLE_ACTIONS = 4;
const SHUTOFF_LABELS = ['Main water shutoff', 'Gas shutoff'];

export interface IssueState {
  /** Picked option index per question id. */
  picks: Record<string, number>;
  /** Actions already taken in this answer, with where the result lives. */
  done: Record<string, { label: string; href: string }>;
}

interface Props {
  answer: Answer & { issue: NonNullable<Answer['issue']> };
  state: IssueState;
  onChange: (next: IssueState) => void;
  /** Follow an in-app link (the panel closes itself). */
  go: (href: string) => void;
}

/**
 * A homeowner problem, in the order it matters: emergency boundaries, what to do now, what
 * Homebase already knows, questions that change the advice, safe steps, professional-only work,
 * then actions that turn it into tasks, notes and history.
 */
export function IssueAnswer({ answer, state, onChange, go }: Props) {
  const store = useStore();
  const toast = useToast();
  const { guide, question, context } = answer.issue;
  const [resolving, setResolving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Gas, carbon monoxide and fire: getting out and calling for help is the whole answer.
  const critical = isCriticalGuide(guide);

  const picked = (guide.questions ?? []).flatMap((q) => (state.picks[q.id] !== undefined ? [{ q, o: q.options[state.picks[q.id]] }] : []));
  const emergency = picked.some((p) => p.o.tone === 'emergency');
  const needsPro = emergency || picked.some((p) => p.o.tone === 'pro');
  const issue: Issue = { guide, question, answers: picked.map((p) => `${p.q.text} ${p.o.label}`), subject: context.subject };

  function pick(questionId: string, index: number) {
    onChange({ ...state, picks: { ...state.picks, [questionId]: index } });
  }

  async function act(id: string, run: () => Promise<{ label: string; href: string }>) {
    try {
      const result = await run();
      onChange({ ...state, done: { ...state.done, [id]: result } });
      toast(result.label, { action: { label: 'Open', run: () => go(result.href) } });
    } catch {
      toast('That wasn’t saved. Try again.', { tone: 'error' });
    }
  }

  // Closing the valve is the first step, so where it is comes before "Do this first".
  const shutoffFacts = critical ? [] : context.facts.filter((f) => SHUTOFF_LABELS.includes(f.label));
  const otherFacts = critical ? [] : context.facts.filter((f) => !SHUTOFF_LABELS.includes(f.label));

  const done = (id: string) => state.done[id];
  const contractorHref = `/records?new=contractor${guide.trade ? `&vendor=${encodeURIComponent(TRADE_LABEL[guide.trade])}` : ''}`;

  // One list of rows, four at a time: a wall of equal buttons hides which one matters.
  const actions: ReactNode[] = [];
  if (guide.repairName) {
    actions.push(
      <ActionRow
        key="repair"
        icon={<Wrench size={18} />}
        label={needsPro ? 'Create urgent repair task' : 'Create repair task'}
        done={done('repair')}
        go={go}
        onClick={() =>
          act('repair', async () => {
            const task = await createRepairTask(store, issue, emergency);
            return { label: `${task.name} added`, href: `/tasks/${task.id}` };
          })
        }
      />,
    );
  }
  actions.push(
    <ActionRow
      key="note"
      icon={<NotePad size={18} />}
      label="Save a note"
      done={done('note')}
      go={go}
      onClick={() =>
        act('note', async () => {
          const r = await saveIssueNote(store, issue);
          return { label: 'Note saved in Records', href: `/records/${r.id}` };
        })
      }
    />,
  );
  if (context.warranty) {
    actions.push(<ActionRow key="warranty" icon={<FileText size={18} />} label={context.warranty.found ? context.warranty.label : 'Find related warranty'} go={go} onClick={() => go(context.warranty!.href)} />);
  }
  if (context.contractor) {
    const contractor = context.contractor;
    actions.push(
      telHref(contractor.phone) ? (
        <ActionRow key="contractor" icon={<Phone size={18} />} label={`Call ${contractor.title}`} href={telHref(contractor.phone)} go={go} />
      ) : (
        <ActionRow key="contractor" icon={<Phone size={18} />} label={`Open ${contractor.title}`} go={go} onClick={() => go(`/records/${contractor.id}`)} />
      ),
    );
  } else if (guide.trade) {
    actions.push(<ActionRow key="contractor" icon={<Phone size={18} />} label={`Save your ${tradeWord(guide.trade)}`} go={go} onClick={() => go(contractorHref)} />);
  }
  if (guide.shopping) {
    actions.push(
      <ActionRow
        key="shopping"
        icon={<Receipt size={18} />}
        label="Create a shopping list"
        done={done('shopping')}
        go={go}
        onClick={() =>
          act('shopping', async () => {
            const r = await createShoppingList(store, issue);
            return { label: 'Shopping list saved in Records', href: `/records/${r.id}` };
          })
        }
      />,
    );
  }
  if (guide.damage) {
    actions.push(<ActionRow key="damage" icon={<Camera size={18} />} label="Document damage" go={go} onClick={() => go(damageReportHref(guide.title.toLowerCase()))} />);
  }
  if (guide.followUpDays) {
    actions.push(
      <ActionRow
        key="followup"
        icon={<Clock size={18} />}
        label={`Remind me in ${guide.followUpDays} ${guide.followUpDays === 1 ? 'day' : 'days'}`}
        done={done('followup')}
        go={go}
        onClick={() =>
          act('followup', async () => {
            const task = await createFollowUp(store, issue);
            return { label: `Reminder added: ${task.name}`, href: `/tasks/${task.id}` };
          })
        }
      />,
    );
  }
  for (const a of guide.actions?.filter((a) => a.tel) ?? []) {
    actions.push(<ActionRow key={a.label} icon={<Phone size={18} />} label={a.label} href={`tel:${a.tel}`} go={go} />);
  }
  for (const a of guide.actions?.filter((a) => !a.tel && (a.task || a.href)) ?? []) {
    actions.push(<ActionRow key={a.label} icon={<ChevronRight size={18} />} label={a.label} go={go} onClick={() => go(a.href ?? `/tasks?new=1&kind=${a.task!.kind}&name=${encodeURIComponent(a.task!.name)}`)} />);
  }

  return (
    <div className={`issue ${critical ? 'is-emergency' : ''}`}>
      <h3>{guide.title}</h3>
      <p>{guide.summary}</p>
      {critical && <CriticalCall guide={guide} />}
      {critical && context.facts.length > 0 && (
        <IssueBlock title="From your home">
          <FactRows facts={context.facts} go={go} />
        </IssueBlock>
      )}
      {!critical && shutoffFacts.length > 0 && <FactRows facts={shutoffFacts} go={go} />}

      {guide.emergency && (
        <div className={`callout is-danger ${emergency ? 'is-active' : ''}`} role={emergency ? 'alert' : undefined}>
          <p className="callout-head">
            <AlertTriangle size={18} /> Get help now if
          </p>
          <p>{guide.emergency}</p>
        </div>
      )}

      {guide.now && guide.now.length > 0 && (
        <IssueBlock title="Do this first">
          <ol>
            {guide.now.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </IssueBlock>
      )}

      {!critical && otherFacts.length > 0 && (
        <IssueBlock title="From your home">
          <FactRows facts={otherFacts} go={go} />
        </IssueBlock>
      )}

      {guide.questions && guide.questions.length > 0 && (
        <IssueBlock title="A few questions">
          {guide.questions.map((q) => {
            const chosen = state.picks[q.id];
            const option = chosen !== undefined ? q.options[chosen] : undefined;
            return (
              <fieldset key={q.id} className="issue-q">
                <legend>{q.text}</legend>
                <div className="chips">
                  {q.options.map((o, i) => (
                    <button key={o.label} type="button" className="chip" aria-pressed={chosen === i} onClick={() => pick(q.id, i)}>
                      {o.label}
                    </button>
                  ))}
                </div>
                {option && (
                  <p className={`issue-reply is-${option.tone}`} aria-live="polite">
                    {option.tone === 'emergency' ? <AlertTriangle size={16} /> : option.tone === 'pro' ? <Phone size={16} /> : <CircleCheck size={16} />}
                    <span>{option.reply}</span>
                  </p>
                )}
              </fieldset>
            );
          })}
        </IssueBlock>
      )}

      <IssueBlock title={critical ? 'Do this now' : 'Safe for you to try'}>
        <ol>
          {guide.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </IssueBlock>

      {(guide.proOnly?.length || guide.safety) && (
        <IssueBlock title={critical ? 'Remember' : `Leave to a professional${guide.trade ? ` (${tradeWord(guide.trade)})` : ''}`}>
          {guide.proOnly && (
            <ul>
              {guide.proOnly.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
          {guide.safety && <p className={`call-pro ${needsPro ? 'is-active' : ''}`}>{guide.safety}</p>}
        </IssueBlock>
      )}

      {critical ? (
        <p className="issue-later">Once everyone is safe and the emergency services have been, come back here to save what happened.</p>
      ) : (
      <div className="issue-actions" role="group" aria-label="What to do with this">
        <p className="issue-actions-title">{needsPro ? 'Your answers suggest calling a professional. Next steps:' : 'Next steps'}</p>
        <div className="group issue-action-group">
          {(expanded ? actions : actions.slice(0, VISIBLE_ACTIONS)).map((node) => node)}
          {actions.length > VISIBLE_ACTIONS && !expanded && (
            <button type="button" className="row issue-action" onClick={() => setExpanded(true)}>
              <span className="row-lead">
                <MoreHorizontal size={18} />
              </span>
              <span className="row-main">
                <span className="row-title">More</span>
              </span>
            </button>
          )}
        </div>
        <div className="issue-resolve">
          {done('resolved') ? (
            <p className="issue-done">
              <CircleCheck size={17} /> Marked resolved and saved in{' '}
              <button type="button" className="text-button" onClick={() => go('/records/service-history')}>
                Service history
              </button>
            </p>
          ) : (
            <button type="button" className="button is-secondary is-block" onClick={() => setResolving(true)}>
              <Check size={18} /> It’s fixed: save to Service history
            </button>
          )}
        </div>
      </div>
      )}

      {resolving && (
        <ResolveSheet
          title={guide.title}
          onClose={() => setResolving(false)}
          onSave={async (input) => {
            setResolving(false);
            await act('resolved', async () => {
              await resolveIssue(store, issue, input);
              return { label: `${guide.title} saved to Service history`, href: '/records/service-history' };
            });
          }}
        />
      )}
    </div>
  );
}

/** "plumber", "HVAC technician": lower case mid-sentence, keeping acronyms. */
function tradeWord(trade: keyof typeof TRADE_LABEL) {
  const label = TRADE_LABEL[trade];
  return /^[A-Z]{2}/.test(label) ? label : label.toLowerCase();
}

/** What Homebase knows, as a compact open list. Somebody to call is a phone link; a shutoff with a photo says so. */
function FactRows({ facts, go }: { facts: ContextFact[]; go: (href: string) => void }) {
  return (
    <div className="group facts">
      {facts.map((f) => (
        <div key={f.label} className={`row kv-row ${f.warn ? 'is-warn' : ''}`}>
          <span className="row-title">{f.label}</span>
          {f.tel ? (
            <a className="fact-call row-value" href={`tel:${f.tel}`} aria-label={`Call ${f.callName ?? f.text}, ${f.tel}`}>
              Call {f.callName ?? f.text}
            </a>
          ) : f.href ? (
            <button type="button" className="text-button row-value" onClick={() => go(f.href!)}>
              {f.text}
            </button>
          ) : (
            <span className="row-value">{f.text}</span>
          )}
          {f.photoRecordId && (
            <button type="button" className="text-button fact-photo" onClick={() => go(`/records/${f.photoRecordId}`)}>
              See photo <ChevronRight size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function IssueBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="issue-block">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function ActionRow({ icon, label, done, onClick, href, go }: { icon: ReactNode; label: string; done?: { label: string; href: string }; onClick?: () => void; href?: string; go: (href: string) => void }) {
  const body = (
    <>
      <span className="row-lead">{done ? <CircleCheck size={18} /> : icon}</span>
      <span className="row-main">
        <span className="row-title">{done ? `${done.label}. Open` : label}</span>
      </span>
    </>
  );
  if (href && !done) {
    return (
      <a className="row issue-action" href={href}>
        {body}
      </a>
    );
  }
  return (
    <button type="button" className={`row issue-action ${done ? 'is-done' : ''}`} onClick={done ? () => go(done.href) : onClick}>
      {body}
    </button>
  );
}

function CriticalCall({ guide }: { guide: Props['answer']['issue']['guide'] }) {
  return (
    <div className="critical-call">
      {guide.actions
        ?.filter((a) => a.tel)
        .map((a) => (
          <a key={a.label} className="button is-block is-call" href={`tel:${a.tel}`}>
            <Phone size={18} /> {a.label}
          </a>
        ))}
    </div>
  );
}

function ResolveSheet({ title, onClose, onSave }: { title: string; onClose: () => void; onSave: (input: { provider?: string; notes?: string; cost?: number }) => void }) {
  const [provider, setProvider] = useState('');
  const [notes, setNotes] = useState('');
  const [cost, setCost] = useState('');
  return (
    <Sheet
      title={`${title}: fixed`}
      onClose={onClose}
      leading={<button type="button" className="sheet-action" onClick={onClose}>Cancel</button>}
      trailing={
        <button type="button" className="sheet-action is-strong" onClick={() => onSave({ provider, notes, cost: cost.trim() && Number(cost) >= 0 ? Number(cost) : undefined })}>
          Save
        </button>
      }
    >
      <p className="sheet-lead">Saved in Service history with your answers, so next time you know what happened and who fixed it.</p>
      <div className="form-group form-gap">
        <TextField label="Who fixed it?" optional value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Me, or Rivera Plumbing" />
        <TextField label="What was the fix?" optional value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Replaced the supply line under the sink" />
        <TextField label="Cost" optional inputMode="decimal" prefix="$" value={cost} onChange={(e) => setCost(e.target.value)} />
      </div>
    </Sheet>
  );
}
