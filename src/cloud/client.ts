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
 * Google sends the person back with `?code=` (and the library's `sb_flow_id`, which names the stored
 * verifier that goes with it). The app's router may tidy the address (for example when the person hasn't
 * finished the welcome screen) before the library has loaded to read it, so both are taken once, when
 * this file loads, and handed to the library explicitly. Without the flow id the library would guess
 * the verifier from a fixed key, which belongs to the most recent sign-in attempt, not necessarily this one.
 */
interface StartupReturn {
  code: string;
  flowId: string | null;
}

function readStartupReturn(): StartupReturn | null {
  try {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    if (!code) return null;
    const flowId = params.get('sb_flow_id');
    const hasVerifier = hasKey('-auth-token-code-verifier') || (flowId !== null && hasKey(`-auth-token-flow-${flowId}-code-verifier`));
    return hasVerifier ? { code, flowId } : null;
  } catch {
    return null;
  }
}

let startupReturn = readStartupReturn();
const hadCodeAtStart = startupReturn !== null;

/** True when this page load is Google returning the person, even if the address has been tidied since. */
export function hadStartupCode(): boolean {
  return hadCodeAtStart;
}

/** How coming back from Google went, once the code has been used: `done` (a session is stored) or `failed`. */
let returnOutcome: 'done' | 'failed' | null = null;

export function signInReturnOutcome(): 'done' | 'failed' | null {
  return returnOutcome;
}

/** Removes the one-time values from the address, so a reload never tries them again. */
function tidyAddress() {
  try {
    const params = new URLSearchParams(location.search);
    if (!params.has('code') && !params.has('sb_flow_id')) return;
    params.delete('code');
    params.delete('sb_flow_id');
    const query = params.toString();
    history.replaceState(history.state, '', location.pathname + (query ? `?${query}` : '') + location.hash);
  } catch {
    // The address stays as it is.
  }
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
    const returned = startupReturn;
    startupReturn = null;
    if (returned) {
      returnOutcome = 'failed';
      try {
        const { data, error } = await client.auth.exchangeCodeForSession(returned.code, returned.flowId ? { flowId: returned.flowId } : undefined);
        // The library reports a refused or unusable code as a result, not an exception.
        if (!error && data?.session) returnOutcome = 'done';
      } catch {
        // No session results, and the caller finds the person signed out.
      }
      tidyAddress();
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
