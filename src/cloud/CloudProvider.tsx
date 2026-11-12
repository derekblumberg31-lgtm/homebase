import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useStore } from '../data/DataProvider';
import { deliverBackup, deviceLabel, readDeviceEnv } from '../lib/dataSafety';
import { browserDeliverCaps } from '../features/settings/importing';
import { useToast } from '../ui/overlays';
import * as auth from './auth';
import { CloudContext, type CloudApi, type CloudUser } from './cloudContext';
import { getClient, hasStoredSession } from './client';
import { ConflictSheet, DecisionSheet } from './ConflictSheet';
import { fromDevice, syncCoversBackup } from './copy';
import { getDeviceId, deviceSyncState } from './deviceState';
import { SupabaseRemote, type CloudRemote } from './remote';
import { SyncEngine, type SyncState } from './syncEngine';

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
  const [phase, setPhase] = useState<'loading' | 'signed-out' | 'signed-in'>(() => (hasStoredSession() ? 'loading' : 'signed-out'));
  const [user, setUser] = useState<CloudUser | null>(null);
  const [engine, setEngine] = useState<SyncEngine | null>(null);
  const remoteRef = useRef<CloudRemote | null>(null);
  const watching = useRef(false);
  const engineRef = useRef<SyncEngine | null>(null);
  const [sheet, setSheet] = useState<'conflict' | 'confirm' | 'reset' | null>(null);

  const sync = useSyncExternalStore(engine ? engine.subscribe : noopSubscribe, engine ? engine.getState : () => NO_ENGINE);

  const applyUser = useCallback((next: CloudUser | null) => {
    setUser(next);
    setPhase(next ? 'signed-in' : 'signed-out');
  }, []);

  // Listening for sign-in and sign-out needs the library, so it starts only once the library is loaded for another reason.
  const watch = useCallback(async () => {
    if (watching.current) return;
    watching.current = true;
    await auth.onAuthChange(applyUser);
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
        if (new URLSearchParams(location.search).has('code')) history.replaceState(history.state, '', location.pathname + location.hash);
        await watch();
      } catch {
        if (live) setPhase('signed-out');
      }
    })();
    return () => {
      live = false;
    };
  }, [applyUser, watch]);

  // One engine per signed-in person.
  useEffect(() => {
    if (!user) {
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
      const remote = new SupabaseRemote(client, user.id);
      remoteRef.current = remote;
      made = new SyncEngine({
        store,
        remote,
        userId: user.id,
        deviceId: getDeviceId(),
        deviceLabel: deviceLabel(readDeviceEnv()),
        deliverFile,
        syncState: deviceSyncState,
        onEvent: (event) => {
          if (event.kind !== 'pulled') return;
          toast(`Updated with changes from ${fromDevice(event.deviceLabel)}`, event.canUndo ? { action: { label: 'Undo', run: () => void engineRef.current?.undoPull() } } : undefined);
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
  }, [user, store, toast]);

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
          await auth.signOut();
        } finally {
          applyUser(null);
        }
      },
      deleteAccount: async () => {
        const remote = remoteRef.current;
        if (!remote) throw new Error('Not signed in.');
        await remote.deleteAccount();
        engineRef.current?.detach();
        await auth.signOut().catch(() => undefined);
        applyUser(null);
      },
      beforeErase: async () => {
        if (!engineRef.current) return;
        engineRef.current.detach();
        await auth.signOut().catch(() => undefined);
        applyUser(null);
      },
    }),
    [phase, user, sync, watch, applyUser],
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
