// Serves a person's private calendar. Deployed with verify_jwt off (see supabase/config.toml),
// because calendar apps send no auth header. This file runs on Deno, not in the app: it is outside
// the app's typecheck and build.
//
//   GET /functions/v1/calendar-feed/<secret>.ics
//
// The secret is 32 random bytes in hex. Only its SHA-256 is stored, so the lookup is by hash and no
// timing-sensitive comparison is needed. This code never logs the secret or any key. Note that
// Supabase's own request logs (Logs, Edge Functions) do record the request path, which contains the
// secret, so treat project log access like access to the calendar links.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const SECURITY_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' };
const notFound = () => new Response(null, { status: 404, headers: SECURITY_HEADERS });
// 503 tells a calendar app to try again later; a 404 can make it drop the subscription.
const unavailable = () => new Response(null, { status: 503, headers: { ...SECURITY_HEADERS, 'Retry-After': '300' } });

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The project's secret key from the function's own environment, never from the app. Current projects
 * provide SUPABASE_SECRET_KEYS (a JSON object of named keys); projects that still use legacy keys
 * provide SUPABASE_SERVICE_ROLE_KEY. Returns undefined when neither is usable.
 */
function secretKey(): string | undefined {
  const dictionary = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (dictionary) {
    try {
      const keys = JSON.parse(dictionary) as Record<string, unknown>;
      const chosen = keys.default ?? Object.values(keys)[0];
      if (typeof chosen === 'string' && chosen) return chosen;
    } catch {
      // Not JSON: fall back to the legacy variable below.
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || undefined;
}

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405, headers: { ...SECURITY_HEADERS, Allow: 'GET, HEAD' } });

  const last = new URL(req.url).pathname.split('/').pop() ?? '';
  const match = /^([0-9a-f]{64})\.ics$/.exec(last);
  if (!match) return notFound();

  const url = Deno.env.get('SUPABASE_URL');
  const key = secretKey();
  if (!url || !key) {
    console.error('calendar-feed: no project URL or secret key in the function environment');
    return unavailable();
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.from('calendar_feeds').select('ics').eq('token_hash', await sha256Hex(match[1])).maybeSingle();
  if (error) {
    // Log only the error's code and message, which never include the lookup value.
    console.error(`calendar-feed: database error ${error.code ?? ''} ${error.message ?? ''}`.trim());
    return unavailable();
  }
  if (!data) return notFound();

  return new Response(req.method === 'HEAD' ? null : data.ics, {
    status: 200,
    headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=900' },
  });
});
