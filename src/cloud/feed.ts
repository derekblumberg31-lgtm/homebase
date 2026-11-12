import type { HomeData } from '../data/store';
import { buildCalendar } from '../lib/calendar';

/**
 * The private calendar link. The client builds the calendar text from the same document it just
 * synced and stores it; the server only hands that text to whoever holds the secret. The server never
 * reads the backup, so what the feed shows is decided here: job names and dates, no places or notes.
 */

export function buildFeedIcs(data: HomeData, now = new Date()): string {
  return buildCalendar(data.tasks.filter((t) => t.status === 'open'), now, { private: true });
}

/** The stamp changes on every build, so it doesn't count when deciding whether the feed changed. */
const withoutStamps = (ics: string) => ics.replace(/^DTSTAMP:.*\r\n/gm, '');

export function sameFeed(a: string | null, b: string): boolean {
  return a !== null && withoutStamps(a) === withoutStamps(b);
}

/** The https address a calendar app fetches. */
export function feedUrl(projectUrl: string, secret: string): string {
  return `${projectUrl.replace(/\/+$/, '')}/functions/v1/calendar-feed/${secret}.ics`;
}

/** The same address with the scheme swapped, so Apple Calendar opens its subscribe dialog. */
export function webcalUrl(httpsUrl: string): string {
  return httpsUrl.replace(/^https:/, 'webcal:');
}
