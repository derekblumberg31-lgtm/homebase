import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sameUser } from './cloudContext';

const exchange = vi.fn();
const createClient = vi.fn();
vi.mock('@supabase/supabase-js', () => ({ createClient }));

function fakeStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

beforeEach(() => {
  vi.resetModules();
  exchange.mockReset();
  exchange.mockResolvedValue({ data: {}, error: null });
  createClient.mockReset();
  createClient.mockImplementation(() => ({ auth: { exchangeCodeForSession: exchange, stopAutoRefresh: vi.fn() } }));
  vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Google sign-in returning to an app that hasn’t finished onboarding', () => {
  it('uses the ?code= it saw at load, even after the router has dropped it from the address', async () => {
    const location = { search: '?code=abc123' };
    vi.stubGlobal('location', location);
    vi.stubGlobal('localStorage', fakeStorage({ 'sb-abc-auth-token-code-verifier': 'verifier' }));
    const client = await import('./client');
    expect(client.hasStoredSession()).toBe(true);
    // Gate redirects to /welcome, which has no query, before the library has loaded.
    location.search = '';
    expect(client.hasStoredSession()).toBe(true);
    await client.getClient();
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(exchange).toHaveBeenCalledWith('abc123');
    // Asking again doesn't use the code twice.
    await client.getClient();
    expect(exchange).toHaveBeenCalledTimes(1);
    // The library is told not to read the address itself, since it is no longer reliable.
    expect(createClient.mock.calls[0][2].auth.detectSessionInUrl).toBe(false);
  });

  it('still finishes (no session) when the exchange fails, so the screen can leave "Checking your account"', async () => {
    vi.stubGlobal('location', { search: '?code=bad' });
    vi.stubGlobal('localStorage', fakeStorage({ 'sb-abc-auth-token-code-verifier': 'verifier' }));
    exchange.mockRejectedValue(new Error('invalid grant'));
    const client = await import('./client');
    await expect(client.getClient()).resolves.toBeTruthy();
  });

  it('does nothing with a code that has no matching verifier, or with no code at all', async () => {
    vi.stubGlobal('location', { search: '?code=stranger' });
    vi.stubGlobal('localStorage', fakeStorage({}));
    const client = await import('./client');
    expect(client.hasStoredSession()).toBe(false);
    await client.getClient();
    expect(exchange).not.toHaveBeenCalled();
  });
});

describe('with no project in the build', () => {
  it('never loads the library', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('localStorage', fakeStorage({}));
    const client = await import('./client');
    await expect(client.getClient()).rejects.toThrow();
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe('signing out', () => {
  it('clears the stored session when the server can’t be reached, and says so', async () => {
    const { signOutWith } = await import('./auth');
    const forget = vi.fn();
    const reset = vi.fn();
    const failing = { auth: { signOut: async () => ({ error: new Error('Failed to fetch') }) } } as unknown as SupabaseClient;
    expect(await signOutWith(async () => failing, forget, reset)).toEqual({ serverReached: false });
    expect(forget).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('also clears it when the library can’t even be loaded', async () => {
    const { signOutWith } = await import('./auth');
    const forget = vi.fn();
    expect(await signOutWith(() => Promise.reject(new Error('offline')), forget, vi.fn())).toEqual({ serverReached: false });
    expect(forget).toHaveBeenCalled();
  });

  it('leaves the library’s own clean-up alone when the server answered', async () => {
    const { signOutWith } = await import('./auth');
    const forget = vi.fn();
    const ok = { auth: { signOut: async () => ({ error: null }) } } as unknown as SupabaseClient;
    expect(await signOutWith(async () => ok, forget, vi.fn())).toEqual({ serverReached: true });
    expect(forget).not.toHaveBeenCalled();
  });

  it('forgets only this project’s session keys', async () => {
    const storage = fakeStorage({ 'sb-abc-auth-token': 'x', 'sb-abc-auth-token-code-verifier': 'y', 'sb-abc-auth-token-user': 'z', 'homebase:sync-state': '{}', 'sb-other-auth-token': 'q' });
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('location', { search: '' });
    const client = await import('./client');
    client.clearStoredSession();
    expect([...storage.data.keys()].sort()).toEqual(['homebase:sync-state', 'sb-other-auth-token']);
    expect(client.hasStoredSession()).toBe(false);
  });
});

describe('one engine per signed-in person', () => {
  it('keeps the same user object across token refreshes and repeated sign-in events', () => {
    const a = { id: 'u1', email: 'a@example.com' };
    expect(sameUser(a, { id: 'u1', email: 'a@example.com' })).toBe(a);
    expect(sameUser(null, a)).toBe(a);
    expect(sameUser(a, null)).toBeNull();
    const other = { id: 'u2', email: 'b@example.com' };
    expect(sameUser(a, other)).toBe(other);
  });
});
