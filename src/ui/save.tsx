import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Notice } from './layout';

export const SAVE_FAILED_COPY =
  'That wasn’t saved. Your changes are still here, so you can try again. If it keeps failing, the device may be out of space.';

export interface SaveState {
  saving: boolean;
  failed: boolean;
}

/**
 * The state machine behind useSave, kept pure so it can be tested without a renderer.
 * `run` clears `failed`, sets `saving`, awaits the work and resolves true; a throw sets `failed`
 * and resolves false. `saving` is always cleared. A call while saving is ignored (false, work
 * not called).
 */
export function createSaveRunner(setState: (state: SaveState) => void) {
  let saving = false;
  return async function run(work: () => Promise<unknown>): Promise<boolean> {
    if (saving) return false;
    saving = true;
    setState({ saving: true, failed: false });
    try {
      await work();
      saving = false;
      setState({ saving: false, failed: false });
      return true;
    } catch {
      saving = false;
      setState({ saving: false, failed: true });
      return false;
    }
  };
}

export function useSave(): { saving: boolean; failed: boolean; run: (work: () => Promise<unknown>) => Promise<boolean> } {
  const [state, setState] = useState<SaveState>({ saving: false, failed: false });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // A successful save usually closes the sheet, so state set after that would hit an unmounted component.
  const runner = useRef(createSaveRunner((s) => mounted.current && setState(s)));
  const run = useCallback((work: () => Promise<unknown>) => runner.current(work), []);
  return { ...state, run };
}

/** The failure notice for a sheet or form: role="alert", scrolled into view, focus untouched. */
export function SaveFailed({ show, children }: { show: boolean; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (show) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [show]);
  if (!show) return null;
  return (
    <div ref={ref}>
      <Notice tone="error">{children ?? SAVE_FAILED_COPY}</Notice>
    </div>
  );
}
