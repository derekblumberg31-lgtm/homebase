import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useData } from '../data/DataProvider';
import type { Member } from '../data/types';

/**
 * Who is using Homebase. Today everything is local to this device, so the session is the
 * household's owner and needs no sign-in. A cloud adapter (accounts, sync, shared households) can
 * implement the same interface later without screens changing.
 */
export interface Session {
  kind: 'local';
  /** True once onboarding has created the household. */
  ready: boolean;
  member?: Member;
  householdName?: string;
  /** Not available on local sessions; present so a future cloud session can offer it. */
  signOut?: () => Promise<void>;
}

const SessionContext = createContext<Session>({ kind: 'local', ready: false });

export function SessionProvider({ children }: { children: ReactNode }) {
  const { household } = useData();
  const session = useMemo<Session>(
    () => ({
      kind: 'local',
      ready: Boolean(household?.onboardedAt),
      member: household?.members.find((member) => member.role === 'owner') ?? household?.members[0],
      householdName: household?.name,
    }),
    [household],
  );
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
