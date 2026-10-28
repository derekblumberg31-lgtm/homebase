import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData, useNow } from '../../data/DataProvider';
import { uid } from '../../data/ids';
import { useSession } from '../../session/session';
import { House, Send } from '../../ui/Icons';
import { SUGGESTED_QUESTIONS } from './guides';
import { LocalGuideProvider, type Answer, type AssistantProvider } from './provider';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  answer?: Answer;
}

// One conversation while Homebase is open, shared by the Assistant page and the Ask Homebase panel.
// Nothing here is stored or sent anywhere.
let conversation: Message[] = [];

interface AssistantChatProps {
  provider?: AssistantProvider;
  /** The panel version: tighter spacing, fewer suggestions, focus goes straight to the question. */
  compact?: boolean;
  /** Shown before the first message, e.g. "1 job is overdue". */
  nudge?: { text: string; href: string; label: string };
  /** Called when an answer's link moves away (the panel closes itself). */
  onNavigate?: () => void;
}

export function AssistantChat({ provider = LocalGuideProvider, compact = false, nudge, onNavigate }: AssistantChatProps) {
  const data = useData();
  const now = useNow();
  const session = useSession();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>(conversation);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    conversation = messages;
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || thinking) return;
    setDraft('');
    setMessages((m) => [...m, { id: uid(), role: 'user', text }]);
    setThinking(true);
    try {
      const answer = await provider.answer(text, data, now);
      setMessages((m) => [...m, { id: uid(), role: 'assistant', answer }]);
    } catch {
      setMessages((m) => [...m, { id: uid(), role: 'assistant', answer: { text: 'Something went wrong answering that. Try asking another way.', source: provider.name } }]);
    } finally {
      setThinking(false);
      input.current?.focus();
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  const go = (href: string) => {
    onNavigate?.();
    navigate(href);
  };
  const suggestions = SUGGESTED_QUESTIONS.slice(0, 4);

  return (
    <div className={`assistant ${compact ? 'is-compact' : ''}`}>
      <div className="chat" aria-live="polite">
        {messages.length === 0 && (
          <div className="assistant-welcome">
            <span className="assistant-mark" aria-hidden="true">
              <House size={22} />
            </span>
            <h2 className="assistant-hello">How can I help with your home{session.firstName ? `, ${session.firstName}` : ''}?</h2>
            <p>I know your tasks, records and home details, and I have step-by-step help for leaks, heating, power and more.</p>
            {nudge && (
              <p className="bubble-nudge">
                {nudge.text}{' '}
                <button type="button" className="text-button" onClick={() => go(nudge.href)}>
                  {nudge.label}
                </button>
              </p>
            )}
            <div className="suggestions">
              {suggestions.map((q) => (
                <button key={q} type="button" onClick={() => void ask(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) =>
          message.role === 'user' ? (
            <div key={message.id} className="bubble is-user">
              {message.text}
            </div>
          ) : (
            <div key={message.id} className="bubble is-assistant">
              {message.answer?.title && <h3>{message.answer.title}</h3>}
              <p>{message.answer?.text}</p>
              {message.answer?.steps && (
                <ol>
                  {message.answer.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              )}
              {message.answer?.safety && (
                <p className="bubble-safety">
                  <b>Safety first.</b> {message.answer.safety}
                </p>
              )}
              {message.answer?.actions && (
                <div className="bubble-actions">
                  {message.answer.actions.map((action) =>
                    action.href ? (
                      <Link key={action.label} to={action.href} onClick={onNavigate}>
                        {action.label}
                      </Link>
                    ) : action.task ? (
                      <button key={action.label} type="button" onClick={() => go(`/tasks?new=1&kind=${action.task!.kind}&name=${encodeURIComponent(action.task!.name)}`)}>
                        {action.label}
                      </button>
                    ) : null,
                  )}
                </div>
              )}
              <p className="bubble-note">{message.answer?.source}</p>
            </div>
          ),
        )}
        {thinking && (
          <div className="bubble is-assistant" role="status">
            <span className="muted">Looking that up…</span>
          </div>
        )}
        <div ref={end} />
      </div>

      <form className="composer" onSubmit={submit}>
        <label className="visually-hidden" htmlFor={compact ? 'assistant-panel-question' : 'assistant-question'}>
          Ask a question
        </label>
        <input
          ref={input}
          id={compact ? 'assistant-panel-question' : 'assistant-question'}
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about a fix, a plan or your home"
          autoComplete="off"
          data-autofocus={compact ? '' : undefined}
        />
        <button type="submit" className="round-button is-send" aria-label="Send" disabled={!draft.trim() || thinking}>
          <Send size={19} />
        </button>
      </form>
      <p className="local-note">Guidance is general. For gas, electrical or structural problems, call a licensed professional.</p>
    </div>
  );
}
