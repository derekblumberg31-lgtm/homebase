import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Task } from '../../data/types';
import { DAY_MS, parseDateInput } from '../../lib/dates';
import { Check } from '../../ui/Icons';
import { project, rubberband, velocityTracker } from '../../ui/physics';
import { PRIORITY_LABEL, taskMetaParts, taskPriority } from './meta';
import { countdownParts, type TaskInfo } from './taskMath';

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
const MAX_SQUARES = 25;

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
  onDone: () => void;
}

/** A task line: tap to open, swipe left to mark done. The most urgent one shows its day strip. */
export function TaskRow({ task, info, now, featured = false, onDone }: TaskRowProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [dragX, setDragX] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; base: number; horizontal: boolean | null } | null>(null);
  const moved = useRef(false);
  const tracker = useRef(velocityTracker());

  function down(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    start.current = { x: event.clientX, y: event.clientY, base: open ? -ACTION_WIDTH : 0, horizontal: null };
    tracker.current.reset();
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    if (!start.current) return;
    const dx = event.clientX - start.current.x;
    const dy = event.clientY - start.current.y;
    if (start.current.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      start.current.horizontal = Math.abs(dx) > Math.abs(dy);
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
      setOpen(false);
      onDone();
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
    <div className={`swipe-shell row-wrap ${open || dragX !== null ? 'is-revealed' : ''}`}>
      {canSwipe && (
        <button
          type="button"
          className="swipe-action"
          tabIndex={open ? 0 : -1}
          aria-hidden={!open}
          onClick={() => {
            setOpen(false);
            onDone();
          }}
        >
          <Check size={21} />
          <span>Done</span>
        </button>
      )}
      <button
        type="button"
        className="task-row"
        style={{ transform: `translateX(${offset}px)`, transition: dragX === null ? undefined : 'none' }}
        aria-label={`${task.name}${priority !== 'normal' ? `, ${PRIORITY_LABEL[priority]}` : ''}${where ? `, ${where}` : ''}, ${countdownParts(info).label}`}
        onClick={() => (open ? setOpen(false) : navigate(`/tasks/${task.id}`))}
        onClickCapture={clickCapture}
        onPointerDown={canSwipe ? down : undefined}
        onPointerMove={canSwipe ? move : undefined}
        onPointerUp={canSwipe ? up : undefined}
        onPointerCancel={canSwipe ? up : undefined}
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
        {featured && task.recurring && <DayStrip task={task} now={now} />}
      </button>
    </div>
  );
}
