import type { SupabaseClient } from '@supabase/supabase-js';
import { cloudConfig } from './config';

/**
 * The Supabase library is large and most people never sign in, so it is loaded only here, only by a
 * dynamic import, and only when the build has a project and the person either has a stored session
 * or opens the sign-in sheet. Vite puts it in its own chunk.
 */

let pending: Promise<SupabaseClient> | null = null;

export function getClient(): Promise<SupabaseClient> {
  const config = cloudConfig();
  if (!config) return Promise.reject(new Error('Cloud sync is not set up.'));
  pending ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(config.url, config.key, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }),
  );
  pending.catch(() => {
    pending = null;
  });
  return pending;
}

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
 * True when the library has something to pick up: a saved session, or Google just sent the person back
 * with a code (`?code=`) and the matching verifier is stored. False means Homebase never loads the library.
 */
export function hasStoredSession(): boolean {
  if (hasKey('-auth-token')) return true;
  try {
    return new URLSearchParams(location.search).has('code') && hasKey('-auth-token-code-verifier');
  } catch {
    return false;
  }
}
