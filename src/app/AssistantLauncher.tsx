import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useData, useNow } from '../data/DataProvider';
import { AssistantChat } from '../features/assistant/AssistantChat';
import { recommendationsFor } from '../features/home/insights';
import { getTaskInfo } from '../features/tasks/taskMath';
import { MessageCircle, X } from '../ui/Icons';
import { useDialogFocus } from '../ui/overlays';

const SEEN_KEY = 'homebase:launcher-seen';

/** What the launcher would bring up first, if anything: overdue work, then seasonal suggestions. */
function useSuggestion() {
  const data = useData();
  const now = useNow();
  return useMemo(() => {
    const overdue = data.tasks.filter((t) => t.status === 'open' && getTaskInfo(t, now).status === 'overdue');
    if (overdue.length) {
      return {
        key: `overdue:${overdue.map((t) => t.id).sort().join(',')}`,
        nudge: { text: overdue.length === 1 ? `${overdue[0].name} is overdue.` : `${overdue.length} jobs are overdue.`, href: overdue.length === 1 ? `/tasks/${overdue[0].id}` : '/tasks', label: overdue.length === 1 ? 'Open it' : 'See them' },
      };
    }
    const tips = recommendationsFor(data, now);
    if (tips.length) {
      return { key: `tips:${tips.map((t) => t.id).join(',')}`, nudge: { text: `${tips.length} seasonal ${tips.length === 1 ? 'job is' : 'jobs are'} worth doing now.`, href: '/home', label: 'See them' } };
    }
    return null;
  }, [data, now]);
}

function readSeen() {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Ask Homebase: a docked launcher in the bottom-right corner on tablet and desktop. The main column
 * keeps a lane clear for it, so it never sits over content. It moves only when there's a new
 * suggestion, and only once. On phones the Assistant tab does this job.
 */
export function AssistantLauncher() {
  const { pathname } = useLocation();
  const suggestion = useSuggestion();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(readSeen);
  const tipId = useId();
  const fresh = Boolean(suggestion && suggestion.key !== seen);

  function openPanel() {
    setOpen(true);
    if (suggestion) {
      setSeen(suggestion.key);
      try {
        localStorage.setItem(SEEN_KEY, suggestion.key);
      } catch {
        // Not remembering is fine: the dot shows again next time.
      }
    }
  }

  if (pathname.startsWith('/assistant')) return null;

  return (
    <>
      <div className="launcher-dock">
        <button
          type="button"
          className={`launcher ${fresh ? 'has-news' : ''}`}
          aria-describedby={tipId}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => (open ? setOpen(false) : openPanel())}
        >
          <MessageCircle size={22} />
          {fresh && <span className="launcher-dot" aria-hidden="true" />}
          <span className="visually-hidden">Ask Homebase{fresh ? ', 1 new suggestion' : ''}</span>
        </button>
        <span id={tipId} role="tooltip" className="launcher-tip">
          Ask Homebase{fresh ? ' · new suggestion' : ''}
        </span>
      </div>
      {open && <AssistantPanel nudge={suggestion?.nudge} onClose={() => setOpen(false)} />}
    </>
  );
}

function AssistantPanel({ nudge, onClose }: { nudge?: { text: string; href: string; label: string }; onClose: () => void }) {
  const ref = useDialogFocus(onClose, false);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const { pathname } = useLocation();
  const first = useRef(pathname);

  // Following a link from an answer closes the panel.
  useEffect(() => {
    if (pathname !== first.current) closeRef.current();
  }, [pathname]);

  return createPortal(
    <div ref={ref} className="assistant-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="assistant-panel-head">
        <h2 id={titleId}>Ask Homebase</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <AssistantChat compact nudge={nudge} onNavigate={onClose} />
    </div>,
    document.body,
  );
}
