import { afterEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.fn();
vi.mock('@supabase/supabase-js', () => {
  createClient();
  return { createClient };
});

afterEach(() => {
  vi.unstubAllEnvs();
  createClient.mockClear();
});

describe('cloudConfig', () => {
  it('is null with no environment values', async () => {
    const { cloudConfig } = await import('./config');
    expect(cloudConfig()).toBeNull();
  });

  it('is null unless both values are set, and the address is https', async () => {
    const { parseCloudConfig } = await import('./config');
    expect(parseCloudConfig('https://abc.supabase.co', '')).toBeNull();
    expect(parseCloudConfig('', 'key')).toBeNull();
    expect(parseCloudConfig('http://abc.supabase.co', 'key')).toBeNull();
    expect(parseCloudConfig('not a url', 'key')).toBeNull();
    expect(parseCloudConfig(undefined, undefined)).toBeNull();
    expect(parseCloudConfig('https://abc.supabase.co', 'key')).toEqual({ url: 'https://abc.supabase.co', key: 'key' });
  });

  it('reads the two build variables', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    const { cloudConfig } = await import('./config');
    expect(cloudConfig()).toEqual({ url: 'https://abc.supabase.co', key: 'sb_publishable_test' });
  });
});

describe('parseSignInMethods', async () => {
  const { parseSignInMethods } = await import('./config');
  const both = { email: true, google: true };
  it('offers both when unset or empty', () => {
    expect(parseSignInMethods(undefined)).toEqual(both);
    expect(parseSignInMethods('')).toEqual(both);
    expect(parseSignInMethods('   ')).toEqual(both);
  });
  it('takes one method or both', () => {
    expect(parseSignInMethods('google')).toEqual({ email: false, google: true });
    expect(parseSignInMethods('email')).toEqual({ email: true, google: false });
    expect(parseSignInMethods('email,google')).toEqual(both);
  });
  it('ignores case and whitespace', () => {
    expect(parseSignInMethods('  Google ')).toEqual({ email: false, google: true });
    expect(parseSignInMethods(' EMAIL , Google ')).toEqual(both);
  });
  it('ignores unknown values, and falls back to both when none are valid', () => {
    expect(parseSignInMethods('google,apple')).toEqual({ email: false, google: true });
    expect(parseSignInMethods('apple,,sms')).toEqual(both);
    expect(parseSignInMethods(42)).toEqual(both);
  });
});

describe('the Supabase library stays unloaded', () => {
  it('is never imported when there is no config, whatever is asked of the client', async () => {
    vi.resetModules();
    createClient.mockClear();
    const { getClient, hasStoredSession } = await import('./client');
    expect(hasStoredSession()).toBe(false);
    await expect(getClient()).rejects.toThrow();
    // The mock factory ran zero times: the dynamic import was never reached.
    expect(createClient).not.toHaveBeenCalled();
  });

  it('with a project but no stored session, there is nothing to load', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    vi.resetModules();
    const { hasStoredSession } = await import('./client');
    expect(hasStoredSession()).toBe(false);
  });
});
