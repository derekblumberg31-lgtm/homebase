import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createDatabase } from './db';
import { HomeStore, type HomeData } from './store';

const StoreContext = createContext<HomeStore | null>(null);

type LoadState = { status: 'loading' } | { status: 'ready'; store: HomeStore } | { status: 'error'; message: string };

/** Opens the on-device database once and hands the store to every screen. */
export function DataProvider({ children, fallback, errorView }: { children: ReactNode; fallback: ReactNode; errorView: (message: string) => ReactNode }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = new HomeStore(await createDatabase());
        await store.load();
        if (!cancelled) setState({ status: 'ready', store });
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'This browser blocked on-device storage. Private browsing can do this.';
        if (!cancelled) setState({ status: 'error', message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') return <>{fallback}</>;
  if (state.status === 'error') return <>{errorView(state.message)}</>;
  return <StoreContext.Provider value={state.store}>{children}</StoreContext.Provider>;
}

export function useStore(): HomeStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore needs a DataProvider');
  return store;
}

export function useData(): HomeData {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

/** The current time, refreshed every minute so countdowns and the day strip stay current. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
