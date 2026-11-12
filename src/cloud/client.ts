import type { SupabaseClient } from '@supabase/supabase-js';
import { cloudConfig } from './config';

/**
 * The Supabase library is large and most people never sign in, so it is loaded only here, only by a
 * dynamic import, and only when the build has a project and the person either has a stored session
 * or opens the sign-in sheet. Vite puts it in its own chunk. In a build with no project the import
 * sits behind a build-time constant, so the chunk is not built at all.
 */

let pending: Promise<SupabaseClient> | null = null;

/** The library's own localStorage key prefix, `sb-<project-ref>`. */
function storagePrefix(): string | null {
  const config = cloudConfig();
  if (!config) return null;
  return `sb-${new URL(config.url).hostname.split('.')[0]}`;
}

function hasKey(suffix: string): boolean {
  const prefix = storagePrefix();
  if (!prefix) return false;
  try {
    return localStorage.getItem(`${prefix}${suffix}`) !== null;
  } catch {
    return false;
  }
}

/**
 * Google sends the person back with `?code=`. The app's router may tidy the address (for example when
 * the person hasn't finished the welcome screen) before the library has loaded to read it, so the code
 * is taken once, when this file loads, and handed to the library explicitly.
 */
function readStartupCode(): string | null {
  try {
    const code = new URLSearchParams(location.search).get('code');
    return code && hasKey('-auth-token-code-verifier') ? code : null;
  } catch {
    return null;
  }
}

let startupCode = readStartupCode();
const hadCodeAtStart = startupCode !== null;

/** True when this page load is Google returning the person, even if the address has been tidied since. */
export function hadStartupCode(): boolean {
  return hadCodeAtStart;
}

function loadLibrary(): Promise<typeof import('@supabase/supabase-js')> {
  // Both are replaced by text at build time. With either empty, everything below this line is dead
  // code and the library's chunk is dropped from the build (and so from the service worker's cache).
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) return Promise.reject(new Error('Cloud sync is not set up.'));
  return import('@supabase/supabase-js');
}

export function getClient(): Promise<SupabaseClient> {
  const config = cloudConfig();
  if (!config) return Promise.reject(new Error('Cloud sync is not set up.'));
  pending ??= loadLibrary().then(async ({ createClient }) => {
    const client = createClient(config.url, config.key, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    const code = startupCode;
    startupCode = null;
    if (code) {
      try {
        await client.auth.exchangeCodeForSession(code);
      } catch {
        // No session results, and the caller finds the person signed out.
      }
    }
    return client;
  });
  pending.catch(() => {
    pending = null;
  });
  return pending;
}

/** Drops the loaded client, so the next `getClient` builds a fresh one that reads the stored session again. */
export function resetClient(): void {
  const old = pending;
  pending = null;
  old?.then((client) => client.auth.stopAutoRefresh()).catch(() => undefined);
}

/** Removes the library's stored session from this browser, for when signing out on the server didn't go through. */
export function clearStoredSession(): void {
  const prefix = storagePrefix();
  if (!prefix) return;
  try {
    const names: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const name = localStorage.key(i);
      if (name && name.startsWith(`${prefix}-auth-token`)) names.push(name);
    }
    for (const name of names) localStorage.removeItem(name);
  } catch {
    // Storage blocked: there is nothing stored to clear.
  }
}

/**
 * True when the library has something to pick up: a saved session, or Google just sent the person back
 * with a code and the matching verifier is stored. False means Homebase never loads the library.
 */
export function hasStoredSession(): boolean {
  return hadCodeAtStart || hasKey('-auth-token');
}
