import type { CloudUser } from './cloudContext';
import { getClient } from './client';

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

export async function signOut(): Promise<void> {
  const client = await getClient();
  await client.auth.signOut();
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
