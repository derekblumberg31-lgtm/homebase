# Turning on sign-in and sync

Homebase works fully without any of this. Do these steps once to add the optional "Account and sync" section to Settings. Until step 11 (the switch), nothing changes in the app, and the app does not even download the sync code.

Anything marked **check** was not verified against the service's current pages, and dashboard names change. Look it up before you rely on it.

1. **Make a Supabase project.** Create an account at supabase.com and a new project. Pick the region nearest the people who will use it, and write down the project ref (the part of the address before `.supabase.co`).
   - Free projects pause after a period of inactivity (**check** the current terms on the pricing page). While paused, Settings says "Can’t reach your account"; nothing is lost on the devices.
   - **Turn the spend cap on and keep it on** (organization Billing; it exists on the Pro plan). Without it, anyone who signs up and uploads files can run up a bill. See step 10.
2. **Create the tables.** In the Supabase SQL editor, run `supabase/sql/001_sync.sql`, completely. For the calendar link, then run `supabase/sql/002_calendar_feed.sql`; for that one, first check that the `pgcrypto` extension is on (Database, Extensions).
   - The files grant access explicitly: signed-in people can read their own sync row and call two functions; signed-out visitors get nothing. New Supabase projects no longer add table access automatically, and older ones add too much, so the files fix both.
   - If, after setup, Settings says "Can’t reach your account" and the browser's network log shows `permission denied for table` or `permission denied for function`, the grants did not run. Run the file again from a fresh editor tab and read its output for errors.
3. **Copy the two public values.** In the dashboard: Project Settings, **API Keys** for the publishable key (starts `sb_publishable_`; the legacy `anon` key also works), and the Project URL from Project Settings, **Data API** or the **Connect** dialog (**check** both locations). Never copy the secret or service-role key anywhere.
4. **Set the web addresses.** Authentication, URL Configuration:
   - Site URL: `https://<owner>.github.io/homebase/`
   - Redirect URLs: `https://<owner>.github.io/homebase/**` and `http://localhost:5190/**`
5. **Turn on email sign-in, and set up your own email sender. This is required.** Authentication, Sign In / Providers, Email: enabled, and "Confirm email" on. Then Authentication, Emails, **SMTP Settings** (**check** the name): add a custom SMTP sender (any transactional email service works) and a sender address.
   - Supabase's built-in sender only delivers to the email addresses of your own organization's team members and allows about two messages an hour (**check**). Without custom SMTP, nobody else can sign in by email code. Everything looks fine while you test with your own address, and then fails for the first real user.
6. **Change the emails so they show the code.** Authentication, Emails, Templates. Edit both **Magic Link** and **Confirm signup** (a first-time sign-up may be sent either one; **check**) and use this text in each:

   `Your Homebase sign-in code is {{ .Token }}. It expires in 1 hour. If you didn't ask for it, ignore this email.`

7. **Set up Google sign-in.** In Google Cloud Console, under **Google Auth Platform** (older guides call it "OAuth consent screen"; **check** the current names):
   - Create a project.
   - Branding: app name "Homebase", a support email, the privacy page address from step 11, and **Authorized domains**: `supabase.co` and your Pages domain (`github.io`, or your own domain).
   - Audience: External, and publish it to production so it isn't limited to test users.
   - Data access: only the scopes `openid`, `email` and `profile`.
   - Clients, Create client, Web application. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
   - Copy the client ID and secret.
   - Google may ask you to prove you own the domain on the privacy page (through Search Console). `<owner>.github.io` can be verified by adding a verification file or tag to the Pages site; a custom domain is easier to prove and keeps the session off the shared `github.io` origin (see "Questions that are still yours"). **Check.**
8. **Give Google to Supabase.** Authentication, Sign In / Providers, Google: enable it and paste the client ID and secret. The secret stays in Supabase only.
9. **Publish the calendar function (only for the calendar link).** Install the Supabase CLI, then run `supabase functions deploy calendar-feed --no-verify-jwt --project-ref <ref>`.
   - The function reads the project's secret key from its own environment: `SUPABASE_SECRET_KEYS` on current projects, `SUPABASE_SERVICE_ROLE_KEY` on projects that still use legacy keys. Supabase provides these to functions itself; you do not set them. If a request returns a 503, the function found neither (check Edge Function logs for "no project URL or secret key").
   - The calendar address contains its secret, and Supabase's Edge Function request logs record the address. Anyone who can open the project's Logs can see live calendar links. Keep dashboard access to people you trust.
10. **Limit abuse and cost.** Sign-up is open by design (anyone can request a code), and a signed-in person can store files in their own folder.
    - The SQL already limits each person to 6 stored files, named the way the app names them, each under 50 MB, and the calendar text to 1 MB. A person who goes straight to the Storage API can still use about 300 MB, so storage is not unlimited-proof on the free plan (1 GB).
    - Keep the **spend cap on** (step 1), and set a usage alert for Storage (organization Usage, **check** the current options).
    - To stop open sign-up: Authentication, Sign In / Providers, turn off "Allow new users to sign up" (**check** the name). Then only people you invite (Authentication, Users, Invite user) can sign in; the app's email sign-in screen will say the code could not be sent to anyone else. Turn it on while people are joining, and off afterwards, if you want that.
    - Supabase can add a CAPTCHA (Authentication, Attack Protection) to sign-up. Homebase does not send the CAPTCHA token yet, so do not turn it on without adding that to the app first.
11. **Switch it on in the app.** On GitHub: repository Settings, Secrets and variables, Actions, **Variables** (not Secrets). Add:
    - `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (step 3). Without them the build has no sync code at all.
    - `VITE_PRIVACY_CONTACT`: the address for privacy and deletion requests, for example an email address. **The privacy page is only published when this and the two values above are all set**, so a build can't ship the page with an empty contact line or without a sign-in to describe. The page is made from `supabase/privacy.template.html` and appears at `/homebase/privacy.html`.
    - Run the Pages deploy again. The "Account and sync" section appears in Settings. Use the privacy page address on the Google consent screen (step 7); you may need to deploy once first to get it.
12. **Test before real users.** On an installed iPhone app and on one desktop browser, with a real second email address that is **not** on your Supabase team:
    - Sign in by email code with that second address (this proves step 5). Check the email arrives and shows the code.
    - Sign in on both devices. Add a job on one; it should arrive on the other within a few minutes.
    - Edit on both before they sync; the second one should show "Choose which copy to keep" and download a backup file.
    - After the other device's change arrives ("Updated with changes from your…"), tap **Undo**. The account must still hold the other device's change, and Settings must show "Choose which copy to keep". Nothing should change on the other device.
    - Open two tabs of Homebase on one device, edit in one, switch to the other and back. Neither tab should lose the edit, and the account should show one new copy, not alternating ones.
    - Start Google sign-in **from the welcome screen** of a device that has no home yet (a new browser profile). After Google, the screen should leave "Checking your account…" and offer to bring your home.
    - Try Google sign-in on the iPhone. It is hidden in the installed iPhone app until you test it: if it works, set `HIDE_GOOGLE_IN_INSTALLED_IOS` to `false` in `src/cloud/platform.ts`.
    - Sign out while offline (airplane mode). The app should say you are signed out on this device, and a reload should still show you signed out.
    - Erase everything on a device while signed in, then sign in again: Homebase should offer to bring your home back, and the account's copy must still be there. Do the same after clearing the site's data from the browser's settings.
    - Delete the account from Settings. The account, its files (Storage, bucket `backups`) and its calendar link should be gone in the dashboard.
    - Check that a second account cannot see the first account’s data: in the SQL editor, as the second user, a select on `home_sync` returns only its own row, and Storage lists only its own folder. Signed out (the `anon` role), both return nothing or an error.
    - Open the calendar link in Apple Calendar and in Google Calendar (From URL). After "Get a new link", the old link should stop working. In Google Calendar, remove the old subscription too (it keeps a copy).
    - Look at the dashboard after the test: Storage should hold at most a few small files per test account.

## Questions that are still yours

- Free or paid plan, and which region.
- Whether you accept the "not end-to-end encrypted" wording in the app, or want a passphrase first.
- One account per household. Household members signing in separately to share one home isn’t supported.
- The sender address for the sign-in emails.
- The contact address on the privacy page (`VITE_PRIVACY_CONTACT`).
- Whether `PRODUCT.md` may change its "no account, no server" line. It has not been changed.
- Whether it is fine that job names are visible to anyone who holds the calendar link.
- A custom domain. Sign-in lives in browser storage on `<owner>.github.io`, which every GitHub Pages site of the same account shares, so any other Pages site you publish can read the Homebase session and data. A custom domain for this site keeps them apart.
