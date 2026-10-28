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
  /** The owner's first name, cleaned up for greetings; undefined when there isn't a usable one. */
  firstName?: string;
  householdName?: string;
  /** Not available on local sessions; present so a future cloud session can offer it. */
  signOut?: () => Promise<void>;
}

/** First word of a name, trimmed and capped, or undefined if nothing readable is left. */
export function firstNameOf(name?: string): string | undefined {
  const first = (name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().split(/\s+/)[0] ?? '';
  if (!first) return undefined;
  const capped = first.length > 24 ? `${first.slice(0, 24)}…` : first;
  return capped.charAt(0).toLocaleUpperCase() + capped.slice(1);
}

const SessionContext = createContext<Session>({ kind: 'local', ready: false });

export function SessionProvider({ children }: { children: ReactNode }) {
  const { household } = useData();
  const session = useMemo<Session>(
    () => {
      const member = household?.members.find((m) => m.role === 'owner') ?? household?.members[0];
      return {
        kind: 'local',
        ready: Boolean(household?.onboardedAt),
        member,
        firstName: firstNameOf(member?.name),
        householdName: household?.name,
      };
    },
    [household],
  );
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
