import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderPrivacyPage, validContact } from './privacyPage';

const template = readFileSync(new URL('../../supabase/privacy.template.html', import.meta.url), 'utf8');

describe('the privacy page', () => {
  it('is not published without a Supabase project', () => {
    expect(renderPrivacyPage(template, { supabaseUrl: '', contact: 'privacy@example.org' })).toBeNull();
    expect(renderPrivacyPage(template, { contact: 'privacy@example.org' })).toBeNull();
  });

  it('is not published while the contact is missing or still a placeholder', () => {
    for (const contact of [undefined, '', '   ', '[Owner: add the contact address]', 'Owner: fill in']) {
      expect(renderPrivacyPage(template, { supabaseUrl: 'https://abc.supabase.co', contact }), String(contact)).toBeNull();
    }
    expect(validContact('x'.repeat(201))).toBe(false);
  });

  it('is published with the contact filled in, escaped, and no placeholder left', () => {
    const page = renderPrivacyPage(template, { supabaseUrl: 'https://abc.supabase.co', contact: 'help@example.org <b>' })!;
    expect(page).toContain('help@example.org &lt;b&gt;');
    expect(page).not.toContain('{{');
    expect(page).not.toMatch(/\[Owner/);
  });

  it('says what Supabase stores about a Google sign-in, and what the calendar link leaves behind', () => {
    expect(template).toMatch(/kept with your account record by Supabase/);
    expect(template).not.toMatch(/doesn’t store or show them/);
    expect(template).toMatch(/device id/);
    expect(template).toMatch(/IP address/);
    expect(template).toMatch(/keep a copy there/);
    expect(template).toMatch(/request logs/);
  });
});
