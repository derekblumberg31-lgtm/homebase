import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

/** Close on Escape, trap Tab inside, and give focus back to whatever opened the overlay. */
function useDialogFocus(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>('[autofocus], input, select, textarea, button, a[href]');
    first?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !node) return;
      const focusable = [...node.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
        (el) => !el.hasAttribute('disabled'),
      );
      if (focusable.length === 0) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
    // Runs once per open: the handler captured here closes this overlay.
  }, []);
  return ref;
}

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  footer?: ReactNode;
}

/** A bottom sheet on phones (drag down to dismiss) and a centred panel on larger screens. */
export function Sheet({ title, onClose, children, leading, trailing, footer }: SheetProps) {
  const titleId = useId();
  const ref = useDialogFocus(onClose);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef<number | null>(null);

  function down(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    startY.current = event.clientY;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (startY.current === null) return;
    setDragY(Math.max(0, event.clientY - startY.current));
  }
  function up() {
    if (startY.current === null) return;
    const close = dragY > 110;
    startY.current = null;
    setDragging(false);
    setDragY(0);
    if (close) onClose();
  }

  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div
        ref={ref}
        className={`sheet ${dragging ? 'is-dragging' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-grab" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <span className="sheet-grabber" aria-hidden="true" />
        </div>
        <header className="sheet-bar">
          <div className="sheet-side">
            {leading ?? (
              <button type="button" className="sheet-action" onClick={onClose}>
                Close
              </button>
            )}
          </div>
          <h2 id={titleId} className="sheet-title">
            {title}
          </h2>
          <div className="sheet-side is-end">{trailing}</div>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmProps {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

/** A native-style alert for anything that can't easily be undone. Cancel has focus by default. */
export function Confirm({ title, message, confirmLabel, onConfirm, onCancel, destructive = false }: ConfirmProps) {
  const titleId = useId();
  const ref = useDialogFocus(onCancel);
  return createPortal(
    <div className="alert-overlay" onClick={onCancel}>
      <div ref={ref} className="alert" role="alertdialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <div className="alert-content">
          <h2 id={titleId}>{title}</h2>
          <div className="alert-message">{message}</div>
        </div>
        <div className="alert-actions">
          <button type="button" onClick={onCancel} autoFocus>
            Cancel
          </button>
          <button type="button" className={destructive ? 'is-destructive' : ''} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------- toasts ----------

interface ToastMessage {
  id: number;
  text: string;
  tone: 'info' | 'error';
  action?: { label: string; run: () => void };
}

type ShowToast = (text: string, options?: { tone?: 'info' | 'error'; action?: { label: string; run: () => void } }) => void;

const ToastContext = createContext<ShowToast>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const show = useCallback<ShowToast>((text, options = {}) => {
    setToast({ id: Date.now(), text, tone: options.tone ?? 'info', action: options.action });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.action ? 6000 : 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div key={toast.id} className={`toast ${toast.action ? 'has-action' : ''}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
          <span>{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.run();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
