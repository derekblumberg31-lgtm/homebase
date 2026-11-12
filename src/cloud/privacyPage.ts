/**
 * The privacy page is made at build time and only when the build both has a Supabase project and a
 * contact address (VITE_PRIVACY_CONTACT). Otherwise no page is published, so a build can never ship a
 * page that describes a sign-in that isn't there, or one with a blank contact line.
 */

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** A usable contact line: something is there, it is short, and it isn't a leftover placeholder. */
export function validContact(contact: unknown): contact is string {
  if (typeof contact !== 'string') return false;
  const text = contact.trim();
  return text.length > 0 && text.length <= 200 && !/[[\]{}]|owner:/i.test(text);
}

/** The finished page, or null when it should not be published. */
export function renderPrivacyPage(template: string, env: { supabaseUrl?: unknown; contact?: unknown }): string | null {
  if (typeof env.supabaseUrl !== 'string' || !env.supabaseUrl.trim()) return null;
  if (!validContact(env.contact)) return null;
  const page = template.replace('{{CONTACT}}', escapeHtml(env.contact.trim()));
  return page.includes('{{') ? null : page;
}
