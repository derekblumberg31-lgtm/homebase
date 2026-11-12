import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { emptyData, type HomeData } from '../../data/store';
import type { Task } from '../../data/types';
import type { DeviceEnv } from '../../lib/dataSafety';
import { CALENDAR_GUIDES, defaultPlatform, SNAPSHOT_SENTENCE } from './calendarGuide';

// Rendered on the server side of the test runner, which has no window.
vi.stubGlobal('window', {});
let current: HomeData = emptyData();
vi.mock('../../data/DataProvider', () => ({ useData: () => current }));

const { CalendarGuidePage } = await import('./CalendarGuidePage');

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const env = (ua: string, platform: string): DeviceEnv => ({ ua, platform, maxTouchPoints: 0, standalone: false });

const openTask: Task = {
  id: 't1',
  kind: 'maintenance',
  name: 'Change the filter',
  typeId: 'custom',
  location: '',
  lastDoneAt: '2026-08-01',
  intervalDays: 90,
  recurring: true,
  status: 'open',
  createdAt: '',
  updatedAt: '',
};

const render = () =>
  renderToStaticMarkup(
    <MemoryRouter>
      <CalendarGuidePage />
    </MemoryRouter>,
  );

describe('calendar guide', () => {
  it('G1: picks iPhone on iOS, Mac on desktop Safari, Google elsewhere', () => {
    expect(defaultPlatform(env(IPHONE, 'iPhone'))).toBe('iphone');
    expect(defaultPlatform(env(SAFARI, 'MacIntel'))).toBe('mac');
    expect(defaultPlatform(env(CHROME, 'Win32'))).toBe('google');
  });

  it('G2: every platform has at least three steps, and the snapshot sentence shows once', () => {
    for (const guide of Object.values(CALENDAR_GUIDES)) expect(guide.steps.length).toBeGreaterThanOrEqual(3);
    current = { ...emptyData(), tasks: [openTask] };
    const html = render();
    expect(html.split(SNAPSHOT_SENTENCE).length - 1).toBe(1);
    expect(html).toContain('aria-label="Calendar app"');
    expect(html).toContain('<ol');
  });

  it('G3: with no open jobs the download button is aria-disabled and says why', () => {
    current = emptyData();
    const html = render();
    expect(html).toMatch(/<button[^>]*aria-disabled="true"[^>]*>Download the calendar file<\/button>/);
    expect(html).toContain('Add a job first');
  });

  it('keeps the button live when there are open jobs', () => {
    current = { ...emptyData(), tasks: [openTask] };
    const html = render();
    expect(html).not.toContain('aria-disabled');
    expect(html).not.toContain('Add a job first');
  });
});
