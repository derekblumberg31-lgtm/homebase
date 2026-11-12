import type { SupabaseClient } from '@supabase/supabase-js';
import type { CloudUser } from './cloudContext';
import { clearStoredSession, getClient, resetClient } from './client';

/** Sends a 6-digit code by email. Creates the account the first time. */
export async function sendCode(email: string): Promise<void> {
  const client = await getClient();
  const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyCode(email: string, code: string): Promise<void> {
  const client = await getClient();
  const { error } = await client.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
  if (error) throw error;
}

/** Leaves for Google and comes back to Settings with `?code=`. Scopes are the default (openid, email, profile). */
export async function signInWithGoogle(): Promise<void> {
  const client = await getClient();
  const redirectTo = new URL(`${import.meta.env.BASE_URL}settings`, location.origin).href;
  const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw error;
}

/**
 * Signs out on the server and here. When the server can't be reached the library keeps the stored
 * session, which would sign the person back in at the next launch, so it is cleared here by hand.
 * `serverReached: false` means other devices' sessions were not ended.
 */
export async function signOutWith(getIt: () => Promise<SupabaseClient>, forget: () => void, reset: () => void): Promise<{ serverReached: boolean }> {
  let serverReached = false;
  try {
    const client = await getIt();
    const { error } = await client.auth.signOut();
    serverReached = !error;
  } catch {
    serverReached = false;
  }
  if (!serverReached) {
    forget();
    reset();
  }
  return { serverReached };
}

export function signOut(): Promise<{ serverReached: boolean }> {
  return signOutWith(getClient, clearStoredSession, resetClient);
}

export async function currentUser(): Promise<CloudUser | null> {
  const client = await getClient();
  const { data } = await client.auth.getSession();
  const user = data.session?.user;
  return user ? { id: user.id, email: user.email ?? '' } : null;
}

/** Calls back on sign-in and sign-out. Resolves to the unsubscribe. */
export async function onAuthChange(callback: (user: CloudUser | null) => void): Promise<() => void> {
  const client = await getClient();
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ? { id: session.user.id, email: session.user.email ?? '' } : null);
  });
  return () => data.subscription.unsubscribe();
}
