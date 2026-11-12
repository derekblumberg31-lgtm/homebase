import { describe, expect, it } from 'vitest';
import { emptyData } from '../data/store';
import type { Task } from '../data/types';
import { buildFeedIcs, feedUrl, sameFeed, webcalUrl } from './feed';

const task = (over: Partial<Task>): Task => ({
  id: 't1',
  kind: 'maintenance',
  name: 'Change the filter',
  typeId: 'custom',
  location: 'Hallway closet',
  notes: 'Alarm code 1234',
  lastDoneAt: '2026-08-01',
  intervalDays: 90,
  recurring: true,
  status: 'open',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

describe('calendar feed', () => {
  it('is built from open jobs only, with no places or notes', () => {
    const ics = buildFeedIcs({ ...emptyData(), tasks: [task({}), task({ id: 't2', name: 'Done job', status: 'done' })] }, new Date('2026-11-12T10:00:00'));
    expect(ics).toContain('SUMMARY:Change the filter');
    expect(ics).not.toContain('Done job');
    expect(ics).not.toContain('Hallway closet');
    expect(ics).not.toContain('1234');
  });

  it('treats two builds that differ only by their time stamp as the same feed', () => {
    const data = { ...emptyData(), tasks: [task({})] };
    const a = buildFeedIcs(data, new Date('2026-11-12T10:00:00'));
    const b = buildFeedIcs(data, new Date('2026-11-12T10:05:00'));
    expect(a).not.toBe(b);
    expect(sameFeed(a, b)).toBe(true);
    expect(sameFeed(null, b)).toBe(false);
    expect(sameFeed(a, buildFeedIcs({ ...data, tasks: [task({ name: 'Another' })] }, new Date('2026-11-12T10:00:00')))).toBe(false);
  });

  it('makes the https address and swaps the scheme for webcal', () => {
    const url = feedUrl('https://abc.supabase.co/', 'ff00');
    expect(url).toBe('https://abc.supabase.co/functions/v1/calendar-feed/ff00.ics');
    expect(webcalUrl(url)).toBe('webcal://abc.supabase.co/functions/v1/calendar-feed/ff00.ics');
  });
});
