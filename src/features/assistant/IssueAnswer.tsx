import { useState, type ReactNode } from 'react';
import { useStore } from '../../data/DataProvider';
import { TextField } from '../../ui/controls';
import { AlertTriangle, Camera, Check, CircleCheck, Clock, FileText, NotePad, Phone, Receipt, Wrench } from '../../ui/Icons';
import { Sheet, useToast } from '../../ui/overlays';
import { damageReportHref } from '../home/HomePage';
import { TRADE_LABEL } from './guides';
import { createFollowUp, createRepairTask, createShoppingList, resolveIssue, saveIssueNote, type Issue } from './issueActions';
import type { Answer } from './provider';

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
  // Gas, carbon monoxide and fire: getting out and calling for help is the whole answer.
  const critical = Boolean(guide.urgentWhen) && !guide.questions?.length;

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

  const done = (id: string) => state.done[id];
  const contractorHref = `/records?new=contractor${guide.trade ? `&vendor=${encodeURIComponent(TRADE_LABEL[guide.trade])}` : ''}`;

  return (
    <div className="issue">
      <h3>{guide.title}</h3>
      <p>{guide.summary}</p>

      {guide.emergency && (
        <div className={`callout is-danger ${emergency ? 'is-active' : ''}`} role={emergency ? 'alert' : undefined}>
          <p className="callout-head">
            <AlertTriangle size={17} /> Get help now if
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

      {context.facts.length > 0 && (
        <IssueBlock title="From your home">
          <ul className="facts">
            {context.facts.map((f) => (
              <li key={f.label} className={f.warn ? 'is-warn' : undefined}>
                <span className="fact-label">{f.label}</span>{' '}
                {f.href ? (
                  <button type="button" className="text-button" onClick={() => go(f.href!)}>
                    {f.text}
                  </button>
                ) : (
                  <span>{f.text}</span>
                )}
              </li>
            ))}
          </ul>
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

      {critical && (
        <div className="critical-call">
          {guide.actions
            ?.filter((a) => a.tel)
            .map((a) => (
              <a key={a.label} className="button is-block is-call" href={`tel:${a.tel}`}>
                <Phone size={18} /> {a.label}
              </a>
            ))}
        </div>
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
        <div className="issue-action-grid">
          {guide.repairName && (
            <ActionButton
              icon={<Wrench size={17} />}
              label={needsPro ? 'Create urgent repair task' : 'Create repair task'}
              done={done('repair')}
              go={go}
              onClick={() =>
                act('repair', async () => {
                  const task = await createRepairTask(store, issue, emergency);
                  return { label: `${task.name} added`, href: `/tasks/${task.id}` };
                })
              }
            />
          )}
          <ActionButton
            icon={<NotePad size={17} />}
            label="Save a note"
            done={done('note')}
            go={go}
            onClick={() =>
              act('note', async () => {
                const r = await saveIssueNote(store, issue);
                return { label: 'Note saved in Records', href: `/records/${r.id}` };
              })
            }
          />
          {context.warranty && (
            <button type="button" className="issue-action" onClick={() => go(context.warranty!.href)}>
              <FileText size={17} />
              {context.warranty.found ? context.warranty.label : 'Find related warranty'}
            </button>
          )}
          {context.contractor ? (
            context.contractor.phone ? (
              <a className="issue-action" href={`tel:${context.contractor.phone.replace(/[^\d+]/g, '')}`}>
                <Phone size={17} /> Call {context.contractor.title}
              </a>
            ) : (
              <button type="button" className="issue-action" onClick={() => go(`/records/${context.contractor!.id}`)}>
                <Phone size={17} /> Open {context.contractor.title}
              </button>
            )
          ) : (
            guide.trade && (
              <button type="button" className="issue-action" onClick={() => go(contractorHref)}>
                <Phone size={17} /> Save your {tradeWord(guide.trade)}
              </button>
            )
          )}
          {guide.shopping && (
            <ActionButton
              icon={<Receipt size={17} />}
              label="Create a shopping list"
              done={done('shopping')}
              go={go}
              onClick={() =>
                act('shopping', async () => {
                  const r = await createShoppingList(store, issue);
                  return { label: 'Shopping list saved in Records', href: `/records/${r.id}` };
                })
              }
            />
          )}
          {guide.damage && (
            <button type="button" className="issue-action" onClick={() => go(damageReportHref(guide.title.toLowerCase()))}>
              <Camera size={17} /> Document damage
            </button>
          )}
          {guide.followUpDays && (
            <ActionButton
              icon={<Clock size={17} />}
              label={`Remind me in ${guide.followUpDays} ${guide.followUpDays === 1 ? 'day' : 'days'}`}
              done={done('followup')}
              go={go}
              onClick={() =>
                act('followup', async () => {
                  const task = await createFollowUp(store, issue);
                  return { label: `Reminder added: ${task.name}`, href: `/tasks/${task.id}` };
                })
              }
            />
          )}
          {guide.actions
            ?.filter((a) => a.tel)
            .map((a) => (
              <a key={a.label} className="issue-action is-call" href={`tel:${a.tel}`}>
                <Phone size={17} /> {a.label}
              </a>
            ))}
          {guide.actions
            ?.filter((a) => !a.tel && (a.task || a.href))
            .map((a) => (
              <button
                key={a.label}
                type="button"
                className="issue-action"
                onClick={() => go(a.href ?? `/tasks?new=1&kind=${a.task!.kind}&name=${encodeURIComponent(a.task!.name)}`)}
              >
                {a.label}
              </button>
            ))}
        </div>
        <div className="issue-resolve">
          {done('resolved') ? (
            <p className="issue-done">
              <CircleCheck size={17} /> Marked resolved and saved in{' '}
              <button type="button" className="text-button" onClick={() => go('/records/service-history')}>
                Service History
              </button>
            </p>
          ) : (
            <button type="button" className="button is-secondary is-block" onClick={() => setResolving(true)}>
              <Check size={18} /> It’s fixed: save to Service History
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
              return { label: `${guide.title} saved to Service History`, href: '/records/service-history' };
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

function IssueBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="issue-block">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function ActionButton({ icon, label, done, onClick, go }: { icon: ReactNode; label: string; done?: { label: string; href: string }; onClick: () => void; go: (href: string) => void }) {
  if (done) {
    return (
      <button type="button" className="issue-action is-done" onClick={() => go(done.href)}>
        <CircleCheck size={17} /> {done.label}. Open
      </button>
    );
  }
  return (
    <button type="button" className="issue-action" onClick={onClick}>
      {icon} {label}
    </button>
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
      <p className="sheet-lead">Saved in Service History with your answers, so next time you know what happened and who fixed it.</p>
      <div className="form-group form-gap">
        <TextField label="Who fixed it?" optional value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Me, or Rivera Plumbing" />
        <TextField label="What was the fix?" optional value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Replaced the supply line under the sink" />
        <TextField label="Cost" optional inputMode="decimal" prefix="$" value={cost} onChange={(e) => setCost(e.target.value)} />
      </div>
    </Sheet>
  );
}
