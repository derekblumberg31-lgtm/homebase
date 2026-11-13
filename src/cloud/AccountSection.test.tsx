import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudContext, type CloudApi } from './cloudContext';
import { CLOUD_COPY, pick, statusDetail, statusLabel, tooBigMessage, OFFLINE_MESSAGE } from './copy';

// The real Sheet renders into a portal on document.body, which static rendering has no document for.
vi.mock('../ui/overlays', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ui/overlays')>()),
  Sheet: ({ trailing, children }: { trailing?: ReactNode; children?: ReactNode }) => (
    <div>
      {trailing}
      {children}
    </div>
  ),
}));

vi.stubGlobal('window', {});
const { AccountSection, DELETE_MESSAGE, SIGN_OUT_MESSAGE } = await import('./AccountSection');
const { CODE_FAILED, SEND_FAILED, SignInSheet, SAFARI_ONLY_LINE } = await import('./SignInSheet');
const { conflictLead } = await import('./ConflictSheet');
const { GOOGLE_FALLBACK_LINE, googleAvailable } = await import('./platform');

const api = (patch: Partial<CloudApi> = {}): CloudApi => ({
  phase: 'signed-out',
  user: null,
  status: 'idle',
  coversBackup: false,
  syncNow: () => {},
  resolve: async () => ({ ok: true }),
  openConflict: () => {},
  sendCode: async () => {},
  verifyCode: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
  feed: { phase: 'none' },
  makeCalendarLink: async () => {},
  deleteAccount: async () => {},
  beforeErase: async () => {},
  ...patch,
});

const render = (value: CloudApi | null) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <CloudContext.Provider value={value}>
        <AccountSection />
      </CloudContext.Provider>
    </MemoryRouter>,
  );

const decode = (html: string) => html.replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
const configure = () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
};

afterEach(() => vi.unstubAllEnvs());

describe('Account and sync section', () => {
  it('is absent with no project, even if a context were provided', () => {
    expect(render(null)).toBe('');
    expect(render(api())).toBe('');
  });

  it('signed out: the optional row and the reassurance', () => {
    configure();
    const html = decode(render(api()));
    expect(html).toContain('Account and sync');
    expect(html).toContain('Sign in to sync');
    expect(html).toContain('Optional. Keeps a copy of your home in your account, so you can use it on another device.');
    expect(html).toContain('Without signing in, everything stays on this device, as it does now.');
    expect(html).not.toContain('Sign out');
  });

  it('signed in: email, status, sync now, sign out and delete', () => {
    configure();
    const html = decode(render(api({ phase: 'signed-in', user: { id: 'u', email: 'dana@example.com' }, status: 'in-sync', lastSyncedAt: new Date().toISOString() })));
    expect(html).toContain('Signed in');
    expect(html).toContain('dana@example.com');
    expect(html).toContain('Up to date · Just now');
    expect(html).toContain('Sync now');
    expect(html).toContain('Sign out');
    expect(html).toContain('Delete my account and cloud copy');
  });

  it('a paused sync says what to do', () => {
    configure();
    const html = decode(render(api({ phase: 'signed-in', user: { id: 'u', email: 'a@b.co' }, status: 'conflict' })));
    expect(html).toContain('Paused: choose which copy to keep');
  });
});

describe('copy that changes when sync exists (exact strings)', () => {
  const today = 'TODAY';
  it('keeps today’s text when there is no project', () => {
    expect(pick('off', today, CLOUD_COPY.householdFoot['signed-out'], CLOUD_COPY.householdFoot['signed-in'])).toBe(today);
    expect(pick('off', today, CLOUD_COPY.leaves['signed-out'], CLOUD_COPY.leaves['signed-in'])).toBe(today);
  });
  it('signed out', () => {
    expect(CLOUD_COPY.onboarding).toBe('Everything stays on this device unless you choose to sign in and sync. Save a backup file from Settings to keep a copy.');
    expect(pick('signed-out', today, CLOUD_COPY.householdFoot['signed-out'], CLOUD_COPY.householdFoot['signed-in'])).toBe(
      'Everyone shares this device’s Homebase. To use it on another device, sign in to sync, or save a backup here and restore it there.',
    );
    expect(pick('signed-out', today, CLOUD_COPY.leaves['signed-out'], CLOUD_COPY.leaves['signed-in'])).toBe(
      'Nothing, unless you save a backup or calendar file yourself, or sign in to sync. There’s no analytics. The Assistant runs on the device.',
    );
  });
  it('signed in', () => {
    expect(pick('signed-in', today, CLOUD_COPY.householdFoot['signed-out'], CLOUD_COPY.householdFoot['signed-in'])).toBe(
      'Everyone who uses this device shares it. Signing in on another device brings the same home there.',
    );
    expect(pick('signed-in', today, CLOUD_COPY.leaves['signed-out'], CLOUD_COPY.leaves['signed-in'])).toBe(
      'Your whole home, including photos and files, is copied to your account after changes. It’s stored with Supabase and only your sign-in can read it through the app. It isn’t end-to-end encrypted, so it could be accessed by whoever runs the Homebase service. No analytics. The Assistant runs on the device.',
    );
    expect(CLOUD_COPY.cleared).toBe('Sign in again to bring back your home from your account, or restore a backup file.');
    expect(CLOUD_COPY.recordFilesFoot).toContain('stored on this device, included in backups, and synced to your account.');
    expect(CLOUD_COPY.restoreConfirmAddition).toBe('Your account’s copy will be replaced at the next sync.');
    expect(CLOUD_COPY.eraseConfirmAddition).toBe('You’ll be signed out. Your account’s copy isn’t deleted.');
  });
  it('sheets and statuses', () => {
    expect(SIGN_OUT_MESSAGE).toBe('Your home stays on this device. Changes made here won’t reach your account until you sign in again.');
    expect(DELETE_MESSAGE).toBe('This deletes your account and the copy of your home stored in it. Your home on this device isn’t touched. This can’t be undone.');
    expect(CODE_FAILED).toBe('That code didn’t work. Check it, or send a new one.');
    expect(SEND_FAILED).toBe('Couldn’t send the code. Check the address and your connection.');
    expect(statusLabel({ status: 'syncing' })).toBe('Syncing…');
    expect(statusLabel({ status: 'offline' })).toBe('Can’t reach your account');
    expect(statusLabel({ status: 'too-big' })).toBe('Too big to sync');
    expect(statusDetail({ status: 'offline' })).toBe(OFFLINE_MESSAGE);
    expect(OFFLINE_MESSAGE).toBe('Can’t reach your account. Your home is safe on this device and will sync later.');
    expect(tooBigMessage(52)).toBe('Your home is too big to sync (52 MB). Large photos and PDFs make it big. Backup files still work.');
    expect(
      conflictLead({
        reason: 'diverged',
        remote: { revision: 2, deviceLabel: 'iPhone', updatedAt: '2026-11-10T09:12:00' },
        localCounts: { tasks: 1, systems: 0, records: 0, files: 0 },
        remoteCounts: { tasks: 1, systems: 0, records: 0, files: 0 },
      }),
    ).toBe(
      'Your home changed on this device and on your iPhone (Nov 10, 9:12 AM) since they last synced. Homebase can’t combine them yet, so pick one. The other one is saved as a backup file first, so nothing is lost.',
    );
  });
});

describe('Google on an installed iPhone', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  it('is hidden there until it is tested, and the fallback line is the one in the spec', () => {
    expect(googleAvailable({ ua: iphone, platform: 'iPhone', maxTouchPoints: 5, standalone: true })).toBe(false);
    expect(googleAvailable({ ua: iphone, platform: 'iPhone', maxTouchPoints: 5, standalone: false })).toBe(true);
    expect(GOOGLE_FALLBACK_LINE).toBe('To use Google, open Homebase in Safari, or sign in with an email code.');
  });
});

describe('the sign-in sheet by method', () => {
  const sheet = (methods: { email: boolean; google: boolean }, showGoogle: boolean) =>
    decode(renderToStaticMarkup(<SignInSheet cloud={api()} onClose={() => {}} methods={methods} showGoogle={showGoogle} />));
  const both = { email: true, google: true };
  it('shows email and Google by default', () => {
    const html = sheet(both, true);
    expect(html).toContain('Send code');
    expect(html).toContain('type="email"');
    expect(html).toContain('Continue with Google');
  });
  it('google only: just the Google button, nothing about a code', () => {
    const html = sheet({ email: false, google: true }, true);
    expect(html).toContain('Continue with Google');
    expect(html).not.toContain('type="email"');
    expect(html).not.toContain('Send code');
    expect(html).not.toContain('code');
  });
  it('email only: no Google button and no Safari line', () => {
    const html = sheet({ email: true, google: false }, true);
    expect(html).toContain('Send code');
    expect(html).not.toContain('Google');
    expect(html).not.toContain('Safari');
  });
  it('google only in an installed iPhone app: the Safari line, no empty sheet, no email', () => {
    const html = sheet({ email: false, google: true }, false);
    expect(SAFARI_ONLY_LINE).toBe('To use Google, open Homebase in Safari.');
    expect(html).toContain(SAFARI_ONLY_LINE);
    expect(html).not.toContain('Continue with Google');
    expect(html).not.toContain('type="email"');
    expect(html).not.toContain('Send code');
    expect(html).not.toContain('email code');
  });
  it('both in an installed iPhone app: the existing line', () => {
    expect(sheet(both, false)).toContain(GOOGLE_FALLBACK_LINE);
  });
});

describe('calendar link (signed-in guide section)', async () => {
  const { CalendarLinkSection, NEW_LINK_MESSAGE, LINK_KEPT_LINE } = await import('./CalendarLinkSection');
  const { FEED_PRIVACY_LINE, FEED_GUIDES } = await import('../features/settings/calendarGuide');
  const renderLink = (value: CloudApi | null, platform: 'iphone' | 'mac' | 'google' = 'google') =>
    decode(
      renderToStaticMarkup(
        <MemoryRouter>
          <CloudContext.Provider value={value}>
            <CalendarLinkSection platform={platform} />
          </CloudContext.Provider>
        </MemoryRouter>,
      ),
    );
  const signedIn = (feed: CloudApi['feed']) => api({ phase: 'signed-in', user: { id: 'u', email: 'a@b.co' }, feed });

  it('is absent when signed out or with no project', () => {
    expect(renderLink(null)).toBe('');
    expect(renderLink(api())).toBe('');
  });

  it('offers to make a link before one exists', () => {
    const html = renderLink(signedIn({ phase: 'none' }));
    expect(html).toContain('Make a calendar link');
    expect(html).toContain(FEED_PRIVACY_LINE);
    expect(html).toContain('Next to Other calendars, click Add other calendars, then From URL.');
  });

  it('shows the link, the copy button and the webcal subscribe right after it is made', () => {
    const html = renderLink(signedIn({ phase: 'ready', url: 'https://abc.supabase.co/functions/v1/calendar-feed/ff.ics' }), 'mac');
    expect(html).toContain('value="https://abc.supabase.co/functions/v1/calendar-feed/ff.ics"');
    expect(html).toContain('Copy link');
    expect(html).toContain('href="webcal://abc.supabase.co/functions/v1/calendar-feed/ff.ics"');
    expect(html).toContain('Subscribe on this iPhone or Mac');
    expect(html).toContain('Get a new link');
    expect(html).toContain('Then set Auto-refresh in the calendar’s Get Info.');
  });

  it('later visits never show the secret', () => {
    const html = renderLink(signedIn({ phase: 'ready' }));
    expect(html).toContain(LINK_KEPT_LINE);
    expect(html).not.toContain('calendar-feed');
    expect(LINK_KEPT_LINE).toBe('Your link is set up. To add it to another calendar, get a new link.');
  });

  it('uses the exact copy from the spec', () => {
    expect(NEW_LINK_MESSAGE).toBe('Calendars using the old link stop updating until you add the new one.');
    expect(FEED_PRIVACY_LINE).toBe('Anyone with this link can see your job names and dates, nothing else. Don’t share it. Apple Calendar checks it regularly. Google Calendar can take a day to show changes.');
    expect(FEED_GUIDES.google.note).toBe('You can’t subscribe in the Google Calendar phone app. Once added on a computer, it shows on your phone.');
  });
});
