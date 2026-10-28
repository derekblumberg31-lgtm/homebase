import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData, useNow } from '../../data/DataProvider';
import { uid } from '../../data/ids';
import { Send } from '../../ui/Icons';
import { Page } from '../../ui/layout';
import { LocalGuideProvider, type Answer, type AssistantProvider } from './provider';
import { SUGGESTED_QUESTIONS } from './guides';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  answer?: Answer;
}

// The conversation lasts while Homebase is open; nothing here is stored or sent anywhere.
let conversation: Message[] = [];

/** Ask Assistant: help with fixes, planning and questions about this home. Works offline. */
export function AssistantPage({ provider = LocalGuideProvider }: { provider?: AssistantProvider }) {
  const data = useData();
  const now = useNow();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>(conversation);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const end = useRef<HTMLDivElement>(null);

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
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  return (
    <Page title="Assistant" subtitle="Help with fixes, planning and questions about your home." profile>
      <div className="chat" aria-live="polite">
        {messages.length === 0 && (
          <div className="bubble is-assistant">
            <p>Hi{data.household?.members[0] ? ` ${data.household.members[0].name}` : ''}. Tell me what’s going on, or try one of these:</p>
            <div className="bubble-actions">
              {SUGGESTED_QUESTIONS.map((q) => (
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
                      <Link key={action.label} to={action.href}>
                        {action.label}
                      </Link>
                    ) : action.task ? (
                      <button key={action.label} type="button" onClick={() => navigate(`/tasks?new=1&kind=${action.task!.kind}&name=${encodeURIComponent(action.task!.name)}`)}>
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
        <label className="visually-hidden" htmlFor="assistant-question">
          Ask a question
        </label>
        <input id="assistant-question" className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask about a fix, a plan or your home" autoComplete="off" />
        <button type="submit" className="round-button" aria-label="Send" disabled={!draft.trim() || thinking}>
          <Send size={19} />
        </button>
      </form>
      <p className="local-note">Guidance is general. For gas, electrical or structural problems, call a licensed professional.</p>
    </Page>
  );
}
