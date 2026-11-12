import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useStore } from '../data/DataProvider';
import { deliverBackup, deviceLabel, readDeviceEnv } from '../lib/dataSafety';
import { browserDeliverCaps } from '../features/settings/importing';
import { useToast } from '../ui/overlays';
import * as auth from './auth';
import { CloudContext, sameUser, type CloudApi, type CloudUser, type FeedState } from './cloudContext';
import { cloudConfig } from './config';
import { buildFeedIcs, feedUrl, sameFeed } from './feed';
import { getClient, hadStartupCode, hasStoredSession } from './client';
import { ConflictSheet, DecisionSheet } from './ConflictSheet';
import { fromDevice, syncCoversBackup } from './copy';
import { getDeviceId, deviceSyncState } from './deviceState';
import { SupabaseRemote, type CloudRemote } from './remote';
import { forgetSyncBeforeErase, SyncEngine, type SyncState } from './syncEngine';

const SIGN_OUT_OFFLINE_MESSAGE = 'Signed out on this device. We couldn’t reach the server, so your other devices stay signed in until they’re online.';
import type { HomeData } from '../data/store';

const NO_ENGINE: SyncState = { status: 'idle', canUndo: false };
const noopSubscribe = () => () => {};

/** Hands a file to the share sheet or a download. Only a real save counts: a share the person closed, or a tap that ran out, changes nothing. */
async function deliverFile(file: File): Promise<'saved' | 'cancelled' | 'failed'> {
  try {
    const result = await deliverBackup(file, browserDeliverCaps());
    if (result === 'cancelled') return 'cancelled';
    if (result === 'needs-tap') return 'failed';
    return 'saved';
  } catch {
    return 'failed';
  }
}

/** Mounted only when the build has a Supabase project. Owns the sign-in, the sync engine, and the sheets that ask the person to choose. */
export function CloudProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [phase, setPhase] = useState<'loading' | 'signed-out' | 'signed-in'>(() => (hasStoredSession() ? 'loading' : 'signed-out'));
  const [user, setUser] = useState<CloudUser | null>(null);
  const [engine, setEngine] = useState<SyncEngine | null>(null);
  const remoteRef = useRef<CloudRemote | null>(null);
  const watching = useRef(false);
  const engineRef = useRef<SyncEngine | null>(null);
  const [feed, setFeed] = useState<FeedState>({ phase: 'unknown' });
  const feedReady = useRef(false);
  const lastIcs = useRef<string | null>(null);
  const [sheet, setSheet] = useState<'conflict' | 'confirm' | 'reset' | null>(null);

  const sync = useSyncExternalStore(engine ? engine.subscribe : noopSubscribe, engine ? engine.getState : () => NO_ENGINE);

  const applyUser = useCallback((next: CloudUser | null) => {
    setUser((previous) => sameUser(previous, next));
    setPhase(next ? 'signed-in' : 'signed-out');
  }, []);

  // Listening for sign-in and sign-out needs the library, so it starts only once the library is loaded for another reason.
  const unwatch = useRef<(() => void) | null>(null);
  const watch = useCallback(async () => {
    if (watching.current) return;
    watching.current = true;
    unwatch.current = await auth.onAuthChange(applyUser);
  }, [applyUser]);

  useEffect(() => {
    if (!hasStoredSession()) return;
    let live = true;
    (async () => {
      try {
        const current = await auth.currentUser();
        if (!live) return;
        applyUser(current);
        // Google returns with ?code=; the library has used it by now, so the address can be tidy again.
        // (Read from the load-time capture: the router may have dropped the query already.)
        if (hadStartupCode() && new URLSearchParams(location.search).has('code')) history.replaceState(history.state, '', location.pathname + location.hash);
        await watch();
      } catch {
        if (live) setPhase('signed-out');
      }
    })();
    return () => {
      live = false;
    };
  }, [applyUser, watch]);

  // The calendar text is stored again after each sync, but only when it changed.
  const pushFeed = useCallback(async (data: HomeData) => {
    const remote = remoteRef.current;
    if (!feedReady.current || !remote) return;
    const ics = buildFeedIcs(data);
    if (sameFeed(lastIcs.current, ics)) return;
    try {
      await remote.putCalendarFeed(ics);
      lastIcs.current = ics;
    } catch {
      // The next sync tries again.
    }
  }, []);

  // One engine per signed-in person: the effect depends on the id, not on the user object, so token
  // refreshes and repeated sign-in events never build a second engine.
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) {
      feedReady.current = false;
      lastIcs.current = null;
      setFeed({ phase: 'unknown' });
      setEngine(null);
      engineRef.current = null;
      remoteRef.current = null;
      return;
    }
    let live = true;
    let made: SyncEngine | null = null;
    (async () => {
      const client = await getClient();
      if (!live) return;
      const remote = new SupabaseRemote(client, userId);
      remoteRef.current = remote;
      remote
        .hasCalendarFeed()
        .then((has) => {
          if (!live) return;
          feedReady.current = has;
          setFeed({ phase: has ? 'ready' : 'none' });
        })
        .catch(() => undefined);
      made = new SyncEngine({
        store,
        remote,
        userId,
        deviceId: getDeviceId(),
        deviceLabel: deviceLabel(readDeviceEnv()),
        deliverFile,
        syncState: deviceSyncState,
        onEvent: (event) => {
          if (event.kind === 'synced') {
            void pushFeed(event.data);
            return;
          }
          // Undo asks the engine that did the pull, not whichever engine is current by the time it is tapped.
          toastRef.current(`Updated with changes from ${fromDevice(event.deviceLabel)}`, event.canUndo ? { action: { label: 'Undo', run: () => void made?.undoPull() } } : undefined);
        },
      });
      engineRef.current = made;
      setEngine(made);
      made.start();
    })().catch(() => undefined);
    return () => {
      live = false;
      made?.stop();
    };
  }, [userId, store, pushFeed]);

  // A choice that is needed opens its sheet once. "Decide later" and "Not now" close it; Settings reopens it.
  const lastStatus = useRef(sync.status);
  useEffect(() => {
    if (sync.status === lastStatus.current) return;
    lastStatus.current = sync.status;
    if (sync.status === 'conflict') setSheet('conflict');
    else if (sync.status === 'needs-confirm') setSheet('confirm');
    else if (sync.status === 'cloud-reset') setSheet('reset');
    else setSheet(null);
  }, [sync.status]);

  const api = useMemo<CloudApi>(
    () => ({
      phase,
      user,
      status: sync.status,
      lastSyncedAt: sync.lastSyncedAt,
      conflict: sync.conflict,
      sizeMB: sync.sizeMB,
      message: sync.message,
      coversBackup: Boolean(user) && syncCoversBackup(sync),
      syncNow: () => void engineRef.current?.syncNow(),
      resolve: async (choice) => {
        const result = (await engineRef.current?.resolve(choice)) ?? { ok: false as const, message: 'Nothing to choose right now.' };
        if (result.ok) setSheet(null);
        return result;
      },
      openConflict: () => setSheet(sync.status === 'needs-confirm' ? 'confirm' : sync.status === 'cloud-reset' ? 'reset' : 'conflict'),
      sendCode: async (email) => {
        await auth.sendCode(email);
        void watch();
      },
      verifyCode: async (email, code) => {
        await auth.verifyCode(email, code);
        applyUser(await auth.currentUser());
        void watch();
      },
      signInWithGoogle: async () => {
        await auth.signInWithGoogle();
      },
      signOut: async () => {
        engineRef.current?.detach();
        try {
          // The local session is cleared even when the server can't be reached; the person is told when that happens.
          const { serverReached } = await auth.signOut();
          if (!serverReached) {
            unwatch.current?.();
            unwatch.current = null;
            watching.current = false;
            toastRef.current(SIGN_OUT_OFFLINE_MESSAGE);
          }
        } finally {
          applyUser(null);
        }
      },
      feed,
      makeCalendarLink: async () => {
        const remote = remoteRef.current;
        const config = cloudConfig();
        if (!remote || !config) throw new Error('Not signed in.');
        const secret = await remote.resetCalendarToken();
        // The new link must serve a real calendar, so a failed first save is an error, not a silent empty link.
        const ics = buildFeedIcs(store.getSnapshot());
        await remote.putCalendarFeed(ics);
        feedReady.current = true;
        lastIcs.current = ics;
        setFeed({ phase: 'ready', url: feedUrl(config.url, secret) });
      },
      deleteAccount: async () => {
        const remote = remoteRef.current;
        if (!remote) throw new Error('Not signed in.');
        // Sync stops while the account is removed, so a push can't land a file after the clean-up.
        const engine = engineRef.current;
        engine?.stop();
        try {
          await remote.deleteAccount();
        } catch (error) {
          engine?.start();
          throw error;
        }
        engine?.detach();
        await auth.signOut().catch(() => undefined);
        applyUser(null);
      },
      beforeErase: async () => {
        // Always forget what was synced, with or without a running engine, so an empty home is never pushed.
        forgetSyncBeforeErase(engineRef.current, deviceSyncState);
        if (user || hasStoredSession()) await auth.signOut().catch(() => undefined);
        applyUser(null);
      },
    }),
    [phase, user, sync, watch, applyUser, feed, store, pushFeed],
  );

  return (
    <CloudContext.Provider value={api}>
      {children}
      {sheet === 'conflict' && sync.conflict && (
        <ConflictSheet
          conflict={sync.conflict}
          onChoose={async (choice) => {
            const result = await api.resolve(choice);
            if (!result.ok) toast(result.message, { tone: 'error' });
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'confirm' && sync.remote && (
        <DecisionSheet
          kind="bring"
          remote={sync.remote}
          onConfirm={async () => {
            if (await engineRef.current?.confirmPull()) setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'reset' && (
        <DecisionSheet
          kind="reset"
          onConfirm={async () => {
            if (await engineRef.current?.confirmCloudReset()) setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </CloudContext.Provider>
  );
}
