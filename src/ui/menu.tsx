import { useEffect, useId, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode } from 'react';
import type { IconProps } from './Icons';

export interface MenuItem {
  id: string;
  label: string;
  hint?: string;
  icon?: ComponentType<IconProps>;
  tone?: 'danger';
  onSelect: () => void;
}

interface MenuProps {
  /** Accessible name of the trigger button. */
  label: string;
  trigger: ReactNode;
  triggerClassName?: string;
  items: MenuItem[];
  align?: 'start' | 'end';
  /** Opens upwards, for triggers near the bottom of the screen. */
  placement?: 'below' | 'above';
}

/**
 * A small popover menu: opens on click, Enter, Space or the down arrow; arrows move between items,
 * Escape closes and returns focus to the button, clicking elsewhere closes it.
 */
export function Menu({ label, trigger, triggerClassName = 'button is-quiet', items, align = 'end', placement = 'below' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [flip, setFlip] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  /** Opens upwards when there isn't room below the button (rows near the bottom of the screen). */
  function show() {
    const rect = button.current?.getBoundingClientRect();
    const needed = 64 + items.length * 52;
    setFlip(placement === 'below' && rect ? window.innerHeight - rect.bottom < needed && rect.top > needed : false);
    setOpen(true);
  }

  function close(refocus = true) {
    setOpen(false);
    if (refocus) button.current?.focus();
  }

  function onMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    const list = itemRefs.current.filter((el): el is HTMLButtonElement => Boolean(el));
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      list[(index + 1) % list.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      list[(index - 1 + list.length) % list.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      list[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      list[list.length - 1]?.focus();
    } else if (event.key === 'Tab') {
      close(false);
    }
  }

  return (
    <div className="menu-root" ref={root}>
      <button
        ref={button}
        type="button"
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            show();
          }
        }}
      >
        {trigger}
      </button>
      {open && (
        <div id={id} className={`menu is-${align} is-${flip ? 'above' : placement}`} role="menu" aria-label={label} onKeyDown={onMenuKey}>
          {items.map(({ id: itemId, label: itemLabel, hint, icon: Icon, tone, onSelect }, i) => (
            <button
              key={itemId}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              className={`menu-item ${tone === 'danger' ? 'is-danger' : ''}`}
              onClick={() => {
                close(false);
                onSelect();
              }}
            >
              {Icon && <Icon size={18} className="menu-icon" />}
              <span className="menu-text">
                <span>{itemLabel}</span>
                {hint && <span className="menu-hint">{hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
