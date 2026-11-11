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
import { project, rubberband, velocityTracker } from './physics';
import { pushToast, removeToast } from './toastQueue';

// Open dialogs, oldest first. Only the newest answers Escape and Tab, so a dialog over a sheet closes alone.
const openDialogs: symbol[] = [];

/** Close on Escape, trap Tab inside, and give focus back to whatever opened the overlay. */
export function useDialogFocus(onClose: () => void, lockScroll = true) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const self = Symbol('dialog');
    openDialogs.push(self);
    const opener = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>('[data-autofocus], [autofocus]') ?? node?.querySelector<HTMLElement>('input, select, textarea, button, a[href]');
    first?.focus();
    function onKey(event: KeyboardEvent) {
      if (openDialogs[openDialogs.length - 1] !== self) return;
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
      // Focus that has left the dialog (onto the page behind it) comes back in.
      if (!node.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastEl : firstEl).focus();
      } else if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    if (lockScroll) document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      openDialogs.splice(openDialogs.indexOf(self), 1);
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
  // Escape leaves the same way as a drag or a tap outside; the handler is read when it fires.
  const dismissRef = useRef<() => void>(onClose);
  const ref = useDialogFocus(() => dismissRef.current());
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const startY = useRef<number | null>(null);
  const tracker = useRef(velocityTracker());

  /** Leaves the way it arrived (down), starting from wherever the sheet is right now. */
  function dismiss() {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onClose, 260);
  }
  dismissRef.current = dismiss;

  function down(event: PointerEvent<HTMLDivElement>) {
    if (leaving || (event.pointerType === 'mouse' && event.button !== 0)) return;
    startY.current = event.clientY;
    tracker.current.reset();
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (startY.current === null) return;
    const dy = event.clientY - startY.current;
    tracker.current.add(dy);
    // Downwards tracks 1:1; upwards there's nowhere to go, so it resists.
    setDragY(dy >= 0 ? dy : rubberband(dy, 300));
  }
  function up() {
    if (startY.current === null) return;
    startY.current = null;
    setDragging(false);
    const velocity = tracker.current.velocity();
    const projected = dragY + project(velocity, 0.99);
    if (projected > 160 && velocity >= -50) {
      dismiss();
      return;
    }
    setDragY(0);
  }

  return createPortal(
    <div className={`overlay ${leaving ? 'is-leaving' : ''}`} onClick={dismiss}>
      <div
        ref={ref}
        className={`sheet ${dragging ? 'is-dragging' : ''} ${leaving ? 'is-leaving' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={dragY !== 0 ? { transform: `translateY(${dragY}px)` } : undefined}
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
  /** An optional third action, stacked above the confirm (for example "Save a backup first"). */
  extra?: { label: string; onClick: () => void; disabled?: boolean };
  /** When this becomes truthy, focus moves to the confirm button (after "Save a backup first" finishes). */
  focusConfirmWhen?: unknown;
  /** A status line under the message, announced politely. Only shown with `extra`. */
  status?: ReactNode;
  /** Disables the confirm while something else is in progress. */
  confirmDisabled?: boolean;
}

/** A native-style alert for anything that can't easily be undone. Cancel has focus by default. */
export function Confirm({ title, message, confirmLabel, onConfirm, onCancel, destructive = false, extra, status, confirmDisabled = false, focusConfirmWhen }: ConfirmProps) {
  const titleId = useId();
  const ref = useDialogFocus(onCancel);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusConfirmWhen && !confirmDisabled) confirmRef.current?.focus();
  }, [focusConfirmWhen, confirmDisabled]);
  const confirm = (
    <button ref={confirmRef} type="button" className={`${destructive ? 'is-destructive ' : ''}is-confirm`} onClick={onConfirm} disabled={confirmDisabled}>
      {confirmLabel}
    </button>
  );
  const cancel = (
    <button type="button" onClick={onCancel} autoFocus>
      Cancel
    </button>
  );
  return createPortal(
    <div className="alert-overlay" onClick={onCancel}>
      <div ref={ref} className="alert" role="alertdialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <div className="alert-content">
          <h2 id={titleId}>{title}</h2>
          <div className="alert-message">{message}</div>
          {extra && (
            <p className="alert-status" role="status">
              {status}
            </p>
          )}
        </div>
        {extra ? (
          <div className="alert-actions is-stacked">
            <button type="button" onClick={() => !extra.disabled && extra.onClick()} aria-disabled={extra.disabled || undefined}>
              {extra.label}
            </button>
            {confirm}
            {cancel}
          </div>
        ) : (
          <div className="alert-actions">
            {cancel}
            {confirm}
          </div>
        )}
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
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [paused, setPaused] = useState(false);
  const counter = useRef(0);
  const stackRef = useRef<HTMLDivElement>(null);

  const show = useCallback<ShowToast>((text, options = {}) => {
    counter.current += 1;
    const toast: ToastMessage = { id: counter.current, text, tone: options.tone ?? 'info', action: options.action };
    setToasts((list) => pushToast(list, toast));
  }, []);

  const dismiss = useCallback((id: number) => {
    // A toast that had focus is leaving: hand focus to the page rather than dropping it on <body>.
    const stack = stackRef.current;
    if (stack?.contains(document.activeElement)) document.getElementById('main')?.focus();
    setToasts((list) => removeToast(list, id));
  }, []);

  // Nothing left to hover or focus, so nothing is paused.
  useEffect(() => {
    if (toasts.length === 0) setPaused(false);
  }, [toasts.length]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toasts.length > 0 && (
        <div
          ref={stackRef}
          className="toast-stack"
          onPointerEnter={(event) => event.pointerType === 'mouse' && setPaused(true)}
          onPointerLeave={(event) => event.pointerType === 'mouse' && setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
          }}
        >
          {toasts.map((toast) => (
            <ToastView key={toast.id} toast={toast} paused={paused} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

/** One toast with its own timer: it pauses while the stack is hovered or focused, then restarts in full. */
function ToastView({ toast, paused, onDismiss }: { toast: ToastMessage; paused: boolean; onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.action || toast.tone === 'error' ? 6000 : 3200);
    return () => window.clearTimeout(timer);
  }, [paused, toast.id, toast.action, onDismiss]);

  return (
    <div className={`toast ${toast.action ? 'has-action' : ''}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
      <span>{toast.text}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.run();
            onDismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

export const useToast = () => useContext(ToastContext);
