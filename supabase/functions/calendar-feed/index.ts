// Serves a person's private calendar. Deployed with verify_jwt off (see supabase/config.toml),
// because calendar apps send no auth header. This file runs on Deno, not in the app: it is outside
// the app's typecheck and build.
//
//   GET /functions/v1/calendar-feed/<secret>.ics
//
// The secret is 32 random bytes in hex. Only its SHA-256 is stored, so the lookup is by hash and no
// timing-sensitive comparison is needed. Nothing here logs the secret.
import { createClient } from 'npm:@supabase/supabase-js@2';

const notFound = () => new Response(null, { status: 404 });

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });

  const last = new URL(req.url).pathname.split('/').pop() ?? '';
  const match = /^([0-9a-f]{64})\.ics$/.exec(last);
  if (!match) return notFound();

  // Available inside the function's own environment. It is never in the app.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await supabase.from('calendar_feeds').select('ics').eq('token_hash', await sha256Hex(match[1])).maybeSingle();
  if (error || !data) return notFound();

  return new Response(req.method === 'HEAD' ? null : data.ics, {
    status: 200,
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=900' },
  });
});
