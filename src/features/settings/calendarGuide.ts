import { deviceLabel, type DeviceEnv } from '../../lib/dataSafety';

/**
 * The steps for getting the calendar file into a calendar app. Each step says whether it was
 * checked against Apple or Google's own help pages (verified) or still needs a real-device test.
 */

export type CalendarPlatform = 'iphone' | 'mac' | 'google';

export interface GuideStep {
  text: string;
  verified: boolean;
}

export interface PlatformGuide {
  label: string;
  steps: GuideStep[];
  note?: string;
}

export const PLATFORM_OPTIONS: { value: CalendarPlatform; label: string }[] = [
  { value: 'iphone', label: 'iPhone' },
  { value: 'mac', label: 'Mac' },
  { value: 'google', label: 'Google Calendar' },
];

export const SNAPSHOT_SENTENCE =
  'The file is a snapshot. It doesn’t change when you mark a job done, snooze it or add a new one. After big changes, download it again and delete the old entries in your calendar.';

export const CALENDAR_GUIDES: Record<CalendarPlatform, PlatformGuide> = {
  iphone: {
    label: 'iPhone',
    // Unverified: Apple's iPhone import page could not be read in full. Test on a real iPhone before release.
    steps: [
      { text: 'Tap Download the calendar file above.', verified: false },
      { text: 'Open the file: tap it in the download prompt, or find it in the Files app under Downloads.', verified: false },
      { text: 'Tap Add All, choose the calendar to add the jobs to, then tap Done.', verified: false },
    ],
    note: 'If you use Homebase from the Home Screen and nothing opens, open Homebase in Safari and download the file there.',
  },
  mac: {
    label: 'Mac',
    steps: [
      { text: 'Click Download the calendar file above.', verified: true },
      { text: 'Open Calendar. If you want the jobs kept apart, make a new calendar first (File > New Calendar).', verified: true },
      { text: 'Drag the file into Calendar, or choose File > Import, select the file, then click Import.', verified: true },
      { text: 'Choose the calendar to add the jobs to, then click OK.', verified: true },
    ],
  },
  google: {
    label: 'Google Calendar',
    steps: [
      { text: 'On a computer, download the calendar file. Google Calendar’s phone app can’t import files.', verified: true },
      { text: 'Go to calendar.google.com and sign in.', verified: true },
      { text: 'Click Settings (the gear, top right), then Settings.', verified: true },
      { text: 'In the left menu, click Import & export.', verified: true },
      { text: 'Click Select file from your computer and choose the Homebase file.', verified: true },
      { text: 'Pick the calendar to add the jobs to, then click Import.', verified: true },
      { text: 'The jobs then show in Google Calendar on your phone too.', verified: true },
    ],
    // Unverified: whether Google keeps the 9 a.m. alert from an imported file.
    note: 'Repeating jobs repeat in Google Calendar. Reminders set in the file may not carry over; add one in Google Calendar if you want an alert.',
  },
};

/** iPhone on iOS, Mac on desktop Safari, Google Calendar anywhere else. */
export function defaultPlatform(env: DeviceEnv): CalendarPlatform {
  const label = deviceLabel(env);
  if (label === 'iPhone' || label === 'iPad') return 'iphone';
  if (label === 'Mac') return 'mac';
  return 'google';
}

/**
 * Signed-in tier: the steps for the private link, which calendar apps subscribe to and keep refreshing.
 * Google's are verified against its "Subscribe to someone's calendar" page; the Apple subscribe buttons
 * (a webcal link) and the iPhone Settings path are not, and need a real-device test.
 */
export const FEED_GUIDES: Record<CalendarPlatform, PlatformGuide> = {
  iphone: {
    label: 'iPhone',
    steps: [
      { text: 'Tap Subscribe on this iPhone, then Subscribe.', verified: false },
      { text: 'If that doesn’t open, go to Settings > Apps > Calendar > Calendar Accounts > Add Account > Other > Add Subscribed Calendar, and paste the link.', verified: false },
    ],
  },
  mac: {
    label: 'Mac',
    steps: [
      { text: 'Click Subscribe on this Mac.', verified: false },
      { text: 'Then set Auto-refresh in the calendar’s Get Info.', verified: true },
    ],
  },
  google: {
    label: 'Google Calendar',
    steps: [
      { text: 'On a computer, open calendar.google.com.', verified: true },
      { text: 'Next to Other calendars, click Add other calendars, then From URL.', verified: true },
      { text: 'Paste the link and click Add calendar.', verified: true },
    ],
    note: 'You can’t subscribe in the Google Calendar phone app. Once added on a computer, it shows on your phone.',
  },
};

export const FEED_PRIVACY_LINE =
  'Anyone with this link can see your job names and dates, nothing else. Don’t share it. Apple Calendar checks it regularly. Google Calendar can take a day to show changes.';
