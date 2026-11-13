import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Runs the real supabase-js against a stubbed network, so the whole return from Google is exercised:
 * the code in the address, the stored verifier, the one token request, the stored session.
 */

function fakeStorage(initial: Record<string, string> = {}) {
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

/** The library stores every value as JSON, so fixtures are JSON strings. */
const SESSION = {
  access_token: 'a.b.c',
  refresh_token: 'refresh',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: 'user-1', aud: 'authenticated', email: 'someone@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
};

let storage: ReturnType<typeof fakeStorage>;
let requests: Array<{ url: string; method: string; body?: unknown }>;
let tokenReply: () => Response;

function boot(search: string, stored: Record<string, string>) {
  storage = fakeStorage(stored);
  requests = [];
  const location = {
    search,
    get href() {
      return `https://x.example/homebase/settings${this.search}`;
    },
    pathname: '/homebase/settings',
    hash: '',
    origin: 'https://x.example',
  };
  const history = { state: null, replaceState: (_s: unknown, _t: string, url: string) => void (location.search = new URL(url, location.href).search) };
  vi.stubGlobal('location', location);
  vi.stubGlobal('window', { location, history, localStorage: storage, addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal('history', history);
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, method: init?.method ?? 'GET', body: init?.body });
      if (url.includes('/token?grant_type=pkce')) return tokenReply();
      return new Response('{}', { status: 200 });
    }),
  );
  return location;
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  tokenReply = () => new Response(JSON.stringify(SESSION), { status: 200, headers: { 'content-type': 'application/json' } });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const tokenCalls = () => requests.filter((r) => r.url.includes('/token?grant_type=pkce'));
const logoutCalls = () => requests.filter((r) => r.url.includes('/logout'));

const FLOW = '0123456789abcdef0123456789abcdef';
const OTHER_FLOW = 'fedcba9876543210fedcba9876543210';
const slot = (id: string) => `sb-abc-auth-token-flow-${id}-code-verifier`;
const OWN_VERIFIER = JSON.stringify('own-'.repeat(15));
const STALE_VERIFIER = JSON.stringify('old-'.repeat(15));

describe('coming back from Google with ?code=', () => {
  it('exchanges the code once, stores the session, signs the person in, tidies the address and never signs out', async () => {
    const location = boot(`?code=fake&sb_flow_id=${FLOW}`, { 'sb-abc-auth-token-code-verifier': OWN_VERIFIER, [slot(FLOW)]: OWN_VERIFIER });
    const client = await import('./client');
    const auth = await import('./auth');
    expect(client.hasStoredSession()).toBe(true);
    expect(await auth.currentUser()).toEqual({ id: 'user-1', email: 'someone@example.com' });
    expect(tokenCalls()).toHaveLength(1);
    expect(logoutCalls()).toHaveLength(0);
    expect(storage.getItem('sb-abc-auth-token')).toContain('user-1');
    expect(client.signInReturnOutcome()).toBe('done');
    expect(location.search).toBe('');
    // A second look (the engine, the sign-in sheet) reuses the client: no second exchange.
    await auth.currentUser();
    expect(tokenCalls()).toHaveLength(1);
  });

  it('uses the verifier of the attempt it is returning from, even when the router has already dropped the flow id', async () => {
    // Two attempts were started; the fixed key mirrors the later one. The address names the earlier.
    const location = boot(`?code=fake&sb_flow_id=${FLOW}`, { 'sb-abc-auth-token-code-verifier': STALE_VERIFIER, [slot(FLOW)]: OWN_VERIFIER, [slot(OTHER_FLOW)]: STALE_VERIFIER });
    const client = await import('./client');
    location.search = '';
    await (await import('./auth')).currentUser();
    const sent = JSON.parse(String(requests.find((r) => r.url.includes('grant_type=pkce'))?.body));
    expect(sent.code_verifier).toBe(JSON.parse(OWN_VERIFIER));
    expect(client.signInReturnOutcome()).toBe('done');
  });

  it('says so when the exchange fails, stays signed out, and tidies the address so a reload does not retry', async () => {
    tokenReply = () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'bad code' }), { status: 400, headers: { 'content-type': 'application/json' } });
    const location = boot('?code=bad', { 'sb-abc-auth-token-code-verifier': OWN_VERIFIER });
    const client = await import('./client');
    const auth = await import('./auth');
    expect(client.hasStoredSession()).toBe(true);
    expect(await auth.currentUser()).toBeNull();
    expect(client.signInReturnOutcome()).toBe('failed');
    expect(storage.getItem('sb-abc-auth-token')).toBeNull();
    expect(location.search).toBe('');
  });

  it('is not a sign-in return at all without a matching verifier', async () => {
    boot('?code=stranger', {});
    const client = await import('./client');
    expect(client.hasStoredSession()).toBe(false);
    expect(client.signInReturnOutcome()).toBeNull();
  });
});
