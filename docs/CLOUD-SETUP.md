# Turning on sign-in and sync

Homebase works fully without any of this. Do these steps once to add the optional "Account and sync" section to Settings. Until step 9, nothing changes in the app.

Anything marked **check** was not verified against the service's current pages. Look it up before you rely on it.

1. **Make a Supabase project.** Create an account at supabase.com and a new project. Pick the region nearest the people who will use it, and write down the project ref (the part of the address before `.supabase.co`).
   - Free projects pause after a period of inactivity (**check** the current terms on the pricing page). While paused, Settings says "Can’t reach your account"; nothing is lost on the devices.
2. **Create the tables.** In the Supabase SQL editor, run `supabase/sql/001_sync.sql`. For the calendar link, then run `supabase/sql/002_calendar_feed.sql`. For that one, first check that the `pgcrypto` extension is on (Database, Extensions).
3. **Copy the two public values.** Project Settings, API: copy the Project URL and the publishable key (or the legacy anon key). Never copy the secret or service-role key anywhere.
4. **Set the web addresses.** Authentication, URL Configuration:
   - Site URL: `https://<owner>.github.io/homebase/`
   - Redirect URLs: `https://<owner>.github.io/homebase/**` and `http://localhost:5190/**`
5. **Turn on email sign-in.** Authentication, Providers, Email: enabled, and "Confirm email" on. Then set up your own SMTP sender (Authentication, SMTP). The built-in sender is rate-limited and meant for testing (**check** current limits).
6. **Change the email so it shows the code.** Authentication, Email Templates, **Magic Link**: replace the link with this text:

   `Your Homebase sign-in code is {{ .Token }}. It expires in 1 hour. If you didn't ask for it, ignore this email.`

7. **Set up Google sign-in.** In Google Cloud Console:
   - Create a project.
   - APIs & Services, OAuth consent screen: External, app name "Homebase", a support email, the privacy page address from step 11, and only the scopes `openid`, `email` and `profile`. Publish it to production.
   - Credentials, Create OAuth client ID, Web application. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
   - Copy the client ID and secret.
8. **Give Google to Supabase.** Authentication, Providers, Google: enable it and paste the client ID and secret. The secret stays in Supabase only.
9. **Publish the calendar function (only for the calendar link).** Install the Supabase CLI, then run `supabase functions deploy calendar-feed --no-verify-jwt --project-ref <ref>`.
10. **Switch it on in the app.** On GitHub: repository Settings, Secrets and variables, Actions, **Variables** (not Secrets). Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Run the Pages deploy again. The "Account and sync" section appears in Settings.
11. **Fill in and publish the privacy page.** `public/privacy.html` is deployed with the app, at `/homebase/privacy.html`. It has one marked line for your contact address; fill that in first. Use the page address on the Google consent screen (step 7).
12. **Test before telling anyone.** On an installed iPhone app and on one desktop browser:
    - Sign in by email code on both. Add a job on one; it should arrive on the other within a few minutes.
    - Edit on both before they sync; the second one should show "Choose which copy to keep" and download a backup file.
    - Try Google sign-in on the iPhone. It is hidden in the installed iPhone app until you test it: if it works, set `HIDE_GOOGLE_IN_INSTALLED_IOS` to `false` in `src/cloud/platform.ts`.
    - Check that a second account cannot see the first account’s data.
    - Open the calendar link in Apple Calendar and in Google Calendar (From URL). After "Get a new link", the old link should stop working.

## Questions that are still yours

- Free or paid plan, and which region.
- Whether you accept the "not end-to-end encrypted" wording in the app, or want a passphrase first.
- One account per household. Household members signing in separately to share one home isn’t supported.
- The sender address for the sign-in emails.
- The contact address on the privacy page.
- Whether `PRODUCT.md` may change its "no account, no server" line. It has not been changed.
- Whether it is fine that job names are visible to anyone who holds the calendar link.
