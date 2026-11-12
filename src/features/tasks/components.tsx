import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Task } from '../../data/types';
import { DAY_MS, parseDateInput } from '../../lib/dates';
import { Check } from '../../ui/Icons';
import { project, rubberband, velocityTracker } from '../../ui/physics';
import { PRIORITY_LABEL, taskMetaParts, taskPriority } from './meta';
import { finishTimeline } from './finish';
import { countdownParts, lastDoneKnown, type TaskInfo } from './taskMath';

export function Countdown({ info, large = false }: { info: TaskInfo; large?: boolean }) {
  const parts = countdownParts(info);
  const className = [
    'countdown',
    parts.overdue && 'is-overdue',
    parts.value === null && 'is-word',
    info.status === 'done' && 'is-done',
    large && 'is-large',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={className} aria-label={parts.label}>
      {parts.value !== null && <span className="countdown-number">{parts.value}</span>}
      <span className="countdown-unit">{parts.unit}</span>
    </span>
  );
}

/** Most days one strip shows; longer jobs show their final stretch, every square still one day. */
const MAX_SQUARES = 20;

/** A recurring task's run as calendar days: gone by are crossed off, today fills, late days are red. */
export function DayStrip({ task, now }: { task: Pick<Task, 'lastDoneAt' | 'intervalDays'>; now: number }) {
  const start = parseDateInput(task.lastDoneAt).getTime();
  const elapsed = Math.max(0, now - start);
  const today = Math.floor(elapsed / DAY_MS);
  const todayFill = (elapsed % DAY_MS) / DAY_MS;
  const total = Math.max(task.intervalDays, today + 1);
  const first = Math.max(0, total - MAX_SQUARES);

  const squares = [];
  for (let day = first; day < total; day += 1) {
    const late = day >= task.intervalDays;
    let state = 'is-ahead';
    if (day < today) state = late ? 'is-late' : 'is-gone';
    else if (day === today) state = late ? 'is-today is-late' : 'is-today';
    const style = day === today ? ({ '--day-fill': `${Math.round(todayFill * 100)}%` } as CSSProperties) : undefined;
    squares.push(<i key={day} className={state} style={style} />);
  }
  return (
    <span className={`day-strip ${first > 0 ? 'is-cut' : ''}`} aria-hidden="true">
      {squares}
    </span>
  );
}

const ACTION_WIDTH = 88;

interface TaskRowProps {
  task: Task;
  info: TaskInfo;
  now: number;
  featured?: boolean;
  /** Resolves true when the completion was saved; false returns the row to rest. */
  onDone: () => Promise<boolean> | boolean | void;
}

interface Finish {
  trigger: 'check' | 'swipe';
  collapseDelayMs: number;
}

/** A task line: the check circle completes it, a tap opens it, a left swipe reveals Done. The write waits for the finish so the list does not jump. */
export function TaskRow({ task, info, now, featured = false, onDone }: TaskRowProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [dragX, setDragX] = useState<number | null>(null);
  const [finish, setFinish] = useState<Finish | null>(null);
  const start = useRef<{ x: number; y: number; base: number; horizontal: boolean | null } | null>(null);
  const moved = useRef(false);
  const tracker = useRef(velocityTracker());
  const shellRef = useRef<HTMLDivElement>(null);
  const checkRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef(false);
  const mounted = useRef(true);
  const focusNext = useRef<(() => void) | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Left the page inside the commit window: do the write now so the completion is never lost.
      if (pending.current) {
        pending.current = false;
        window.clearTimeout(timer.current);
        void Promise.resolve(onDoneRef.current()).catch(() => {});
      }
    };
  }, []);

  async function commit() {
    if (!pending.current) return;
    pending.current = false;
    window.clearTimeout(timer.current);
    let ok = false;
    try {
      ok = (await onDoneRef.current()) !== false;
    } catch {
      ok = false;
    }
    const refocus = ok ? focusNext.current : null;
    focusNext.current = null;
    // Runs after the re-render, even if this row has left the list.
    if (refocus) window.requestAnimationFrame(refocus);
    if (!mounted.current) return;
    // Saved or not, the row returns to rest.
    setFinish(null);
    if (!ok) setOpen(false);
  }

  function startFinish(trigger: 'check' | 'swipe') {
    if (finish || pending.current) return;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timeline = finishTimeline(trigger, reduced);
    // Keyboard and screen-reader users keep their place: remember the neighbour before the row folds.
    focusNext.current = null;
    const shell = shellRef.current;
    if (trigger === 'check' && shell && document.activeElement === checkRef.current) {
      const sibling = (shell.nextElementSibling ?? shell.previousElementSibling) as HTMLElement | null;
      focusNext.current = () => {
        const target = sibling?.isConnected ? sibling.querySelector<HTMLElement>('.task-check') : null;
        (target ?? document.getElementById('main'))?.focus();
      };
    }
    // A swipe stays open, showing the green Done while the row folds; the check closes any open swipe.
    setOpen(trigger === 'swipe');
    setFinish({ trigger, collapseDelayMs: timeline.collapseDelayMs });
    pending.current = true;
    timer.current = window.setTimeout(() => void commit(), timeline.commitMs);
  }

  function down(event: PointerEvent<HTMLDivElement>) {
    if (finish || (event.pointerType === 'mouse' && event.button !== 0)) return;
    start.current = { x: event.clientX, y: event.clientY, base: open ? -ACTION_WIDTH : 0, horizontal: null };
    tracker.current.reset();
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const dx = event.clientX - start.current.x;
    const dy = event.clientY - start.current.y;
    if (start.current.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      start.current.horizontal = Math.abs(dx) > Math.abs(dy);
      // Capture only once it is clearly a swipe, so a plain tap keeps its own target.
      if (start.current.horizontal) event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (!start.current.horizontal) return;
    if (Math.abs(dx) > 8) moved.current = true;
    const raw = start.current.base + dx;
    tracker.current.add(raw);
    // Follows the finger 1:1 between closed and open, and resists past either edge.
    setDragX(raw > 0 ? rubberband(raw, ACTION_WIDTH) : raw < -ACTION_WIDTH ? -ACTION_WIDTH + rubberband(raw + ACTION_WIDTH, ACTION_WIDTH) : raw);
  }
  function up() {
    if (!start.current) return;
    const value = dragX ?? (open ? -ACTION_WIDTH : 0);
    const wasHorizontal = start.current.horizontal;
    start.current = null;
    // Decide from where the gesture was heading, not just where the finger let go.
    const projected = value + project(tracker.current.velocity());
    setDragX(null);
    window.setTimeout(() => (moved.current = false), 0);
    if (wasHorizontal && projected < -ACTION_WIDTH * 2.6) {
      // A long, fast swipe marks it done straight away, like Mail; the toast offers Undo.
      startFinish('swipe');
      return;
    }
    setOpen(projected < -ACTION_WIDTH / 2);
  }
  function clickCapture(event: MouseEvent) {
    if (!moved.current) return;
    event.preventDefault();
    event.stopPropagation();
    moved.current = false;
  }

  const offset = dragX ?? (open ? -ACTION_WIDTH : 0);
  const canSwipe = task.status !== 'done';
  const where = taskMetaParts(task, info).join(' · ');
  const priority = taskPriority(task);

  return (
    <div
      ref={shellRef}
      className={`swipe-shell row-wrap ${featured ? 'is-featured' : ''} ${open || dragX !== null ? 'is-revealed' : ''} ${finish ? 'is-leaving' : ''}`}
      style={finish ? ({ '--collapse-delay': `${finish.collapseDelayMs}ms` } as CSSProperties) : undefined}
    >
      {canSwipe && (
        <button
          type="button"
          className="swipe-action"
          tabIndex={open ? 0 : -1}
          aria-hidden={!open}
          onClick={() => startFinish('swipe')}
        >
          <Check size={21} />
          <span>Done</span>
        </button>
      )}
      <div
        className="task-track"
        style={{ transform: `translateX(${offset}px)`, transition: dragX === null ? undefined : 'none' }}
        onClickCapture={clickCapture}
        onPointerDown={canSwipe ? down : undefined}
        onPointerMove={canSwipe ? move : undefined}
        onPointerUp={canSwipe ? up : undefined}
        onPointerCancel={canSwipe ? up : undefined}
      >
        {canSwipe ? (
          <button
            ref={checkRef}
            type="button"
            className="task-check"
            aria-label={`Mark ${task.name} done`}
            aria-disabled={finish ? true : undefined}
            onClick={() => startFinish('check')}
          >
            <span className={`task-check-mark ${finish?.trigger === 'check' ? 'is-checked' : ''}`}>
              <Check size={14} strokeWidth={2.4} />
            </span>
          </button>
        ) : (
          <span className="task-check is-static" aria-hidden="true">
            <span className="task-check-mark is-checked">
              <Check size={14} strokeWidth={2.4} />
            </span>
          </span>
        )}
        <button
          type="button"
          className="task-row"
          aria-label={`${task.name}${priority !== 'normal' ? `, ${PRIORITY_LABEL[priority]}` : ''}${where ? `, ${where}` : ''}, ${countdownParts(info).label}`}
          onClick={() => {
            if (finish) return;
            if (open) setOpen(false);
            else navigate(`/tasks/${task.id}`);
          }}
        >
          <span className="row-line">
            <span className="row-main">
              <span className="row-title">
                {priority === 'high' && <span className="priority-mark" title={PRIORITY_LABEL.high} aria-hidden="true" />}
                {task.name}
              </span>
              {where && <span className="row-sub is-wrap">{where}</span>}
            </span>
            <Countdown info={info} />
          </span>
          {featured && task.recurring && lastDoneKnown(task) && <DayStrip task={task} now={now} />}
        </button>
      </div>
    </div>
  );
}
