/**
 * Cloud sync is optional and hidden until the build has a Supabase project. Both values are public by
 * design (row-level security protects the data, not secrecy). A service-role or secret key must never
 * appear here, in the repo, or in the variables the build reads.
 */
export interface CloudConfig {
  url: string;
  key: string;
}

/** The config, or null unless both values are non-empty and the URL is https. */
export function parseCloudConfig(url: unknown, key: unknown): CloudConfig | null {
  if (typeof url !== 'string' || typeof key !== 'string') return null;
  const cleanUrl = url.trim();
  const cleanKey = key.trim();
  if (!cleanUrl || !cleanKey) return null;
  try {
    if (new URL(cleanUrl).protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return { url: cleanUrl, key: cleanKey };
}

export function cloudConfig(): CloudConfig | null {
  return parseCloudConfig(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
}

export interface SignInMethods {
  email: boolean;
  google: boolean;
}

/** Which sign-in methods the build offers. Unset, empty or nothing valid in the list means both. */
export function parseSignInMethods(raw: unknown): SignInMethods {
  const listed = typeof raw === 'string' ? raw.split(',').map((part) => part.trim().toLowerCase()) : [];
  const email = listed.includes('email');
  const google = listed.includes('google');
  return email || google ? { email, google } : { email: true, google: true };
}

export function signInMethods(): SignInMethods {
  return parseSignInMethods(import.meta.env.VITE_SIGNIN_METHODS);
}
