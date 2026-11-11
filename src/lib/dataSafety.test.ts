import { describe, expect, it, vi } from 'vitest';
import { emptyData, type HomeData } from '../data/store';
import type { Task } from '../data/types';
import {
  backupNudge,
  dataSafetyRow,
  deliverBackup,
  deviceLabel,
  installMatters,
  mayOpenEmptyWhenInstalled,
  recordsBackup,
  recordsOnDownload,
  shareOutcome,
  storageStatus,
  worthLosing,
  type DeliverCaps,
  type DeviceEnv,
} from './dataSafety';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const CRIOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1';
const IPADOS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const SAFARI = IPADOS;
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

const env = (over: Partial<DeviceEnv> & { ua: string }): DeviceEnv => ({ platform: 'MacIntel', maxTouchPoints: 0, standalone: false, ...over });
const iphone = (standalone = false) => env({ ua: IPHONE, platform: 'iPhone', maxTouchPoints: 5, standalone });
const ipad = env({ ua: IPADOS, maxTouchPoints: 5 });
const mac = env({ ua: SAFARI });
const chrome = env({ ua: CHROME, platform: 'Win32' });

describe('installMatters', () => {
  it('is true in an iOS or Safari tab and false once installed or on other browsers', () => {
    expect(installMatters(iphone())).toBe(true);
    expect(installMatters(iphone(true))).toBe(false);
    expect(installMatters(ipad)).toBe(true);
    expect(installMatters(mac)).toBe(true);
    expect(installMatters(chrome)).toBe(false);
    expect(installMatters(env({ ua: ANDROID, platform: 'Linux armv81', maxTouchPoints: 5 }))).toBe(false);
    expect(installMatters(env({ ua: CRIOS, platform: 'iPhone', maxTouchPoints: 5 }))).toBe(true);
  });

  it('flags the installed app on WebKit, where it may open empty', () => {
    expect(mayOpenEmptyWhenInstalled(iphone(true))).toBe(true);
    expect(mayOpenEmptyWhenInstalled(iphone())).toBe(false);
    expect(mayOpenEmptyWhenInstalled({ ...chrome, standalone: true })).toBe(false);
  });
});

describe('deviceLabel', () => {
  it('names the device', () => {
    expect(deviceLabel(iphone())).toBe('iPhone');
    expect(deviceLabel(ipad)).toBe('iPad');
    expect(deviceLabel(mac)).toBe('Mac');
    expect(deviceLabel(chrome)).toBe('this device');
  });
});

const task = (id: string): Task => ({
  id,
  kind: 'maintenance',
  name: id,
  typeId: 'custom',
  location: '',
  lastDoneAt: '2026-08-01',
  intervalDays: 90,
  recurring: true,
  status: 'open',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
});
const tasks = (n: number) => Array.from({ length: n }, (_, i) => task(`t${i}`));
const home = (over: Partial<HomeData> = {}): HomeData => ({ ...emptyData(), ...over });
const settings = (lastBackupAt?: string) => ({ ...emptyData().settings, lastBackupAt });
const record = (fileIds: string[]) => ({ id: 'r', kind: 'warranty' as const, title: 'W', fileIds, createdAt: '', updatedAt: '' });

describe('worthLosing', () => {
  it('needs three entries or any file', () => {
    expect(worthLosing(home({ tasks: tasks(2) }))).toBe(false);
    expect(worthLosing(home({ tasks: tasks(3) }))).toBe(true);
    expect(worthLosing(home({ records: [record(['f'])] }))).toBe(true);
    expect(worthLosing(home({ household: { id: 'household', name: 'Home', members: [], createdAt: '', onboardedAt: '2026-01-01T00:00:00.000Z' } }))).toBe(false);
  });
});

describe('backupNudge', () => {
  const NOW = new Date('2026-11-10T12:00:00').getTime();
  const activity = (at: string) => [{ id: 'a', at, kind: 'task-added' as const, text: 'x' }];

  it('asks once there is something to lose and no backup', () => {
    expect(backupNudge(home({ tasks: tasks(3) }), NOW)).toEqual({ kind: 'first' });
    expect(backupNudge(home({ tasks: tasks(1) }), NOW)).toBeNull();
  });
  it('stays away after being hidden, until a later backup', () => {
    expect(backupNudge(home({ tasks: tasks(3) }), NOW, '2026-11-01T00:00:00.000Z')).toBeNull();
  });
  it('is quiet for a backup under 30 days old, or one with nothing after it', () => {
    expect(backupNudge(home({ tasks: tasks(3), settings: settings('2026-10-20T00:00:00.000Z'), activity: activity('2026-11-01T00:00:00.000Z') }), NOW)).toBeNull();
    expect(backupNudge(home({ tasks: tasks(3), settings: settings('2026-09-01T00:00:00.000Z') }), NOW)).toBeNull();
  });
  it('goes stale only when something changed after a 30 day old backup', () => {
    const data = home({ tasks: tasks(3), settings: settings('2026-09-01T00:00:00.000Z'), activity: activity('2026-09-10T00:00:00.000Z') });
    expect(backupNudge(data, NOW)).toEqual({ kind: 'stale', lastBackupAt: '2026-09-01T00:00:00.000Z' });
    expect(backupNudge(data, NOW, '2026-10-15T00:00:00.000Z')).toBeNull();
    expect(backupNudge(data, NOW, '2026-08-01T00:00:00.000Z')).toEqual({ kind: 'stale', lastBackupAt: '2026-09-01T00:00:00.000Z' });
  });
});

describe('storageStatus', () => {
  it('reports what the browser said', () => {
    expect(storageStatus({ persisted: true, installMatters: false })).toBe('protected');
    expect(storageStatus({ persisted: false, installMatters: true })).toBe('tab-at-risk');
    expect(storageStatus({ persisted: false, installMatters: false })).toBe('best-effort');
    expect(storageStatus({ persisted: 'unsupported', installMatters: true })).toBe('unknown');
  });
});

describe('recordsOnDownload', () => {
  it('is false only for an installed iOS app', () => {
    expect(recordsOnDownload(iphone(true))).toBe(false);
    expect(recordsOnDownload(iphone())).toBe(true);
    expect(recordsOnDownload(chrome)).toBe(true);
  });
});

describe('shareOutcome', () => {
  it('tells a closed sheet from an expired tap from anything else', () => {
    expect(shareOutcome(new DOMException('x', 'AbortError'))).toBe('cancelled');
    expect(shareOutcome(new DOMException('x', 'NotAllowedError'))).toBe('needs-tap');
    expect(shareOutcome(new TypeError('x'))).toBe('fallback');
    expect(shareOutcome(undefined)).toBe('fallback');
  });
});

describe('dataSafetyRow', () => {
  const nudge = { kind: 'first' as const };
  it('shows the install row first, then the backup row, never both', () => {
    expect(dataSafetyRow({ installMatters: true, installDismissed: false, nudge })).toBe('install');
    expect(dataSafetyRow({ installMatters: true, installDismissed: true, nudge })).toBe('backup');
    expect(dataSafetyRow({ installMatters: false, installDismissed: false, nudge: null })).toBeNull();
    expect(dataSafetyRow({ installMatters: true, installDismissed: false, nudge: null })).toBe('install');
  });
});

describe('deliverBackup and recordsBackup', () => {
  const file = new File(['{}'], 'homebase-backup.json', { type: 'application/json' });
  const caps = (over: Partial<DeliverCaps> = {}): DeliverCaps => ({ canShareFile: () => true, share: vi.fn(async () => {}), download: vi.fn(), ...over });

  it('shares when it can, and counts that as a save', async () => {
    const c = caps();
    expect(await deliverBackup(file, c)).toBe('shared');
    expect(c.download).not.toHaveBeenCalled();
    expect(recordsBackup('shared', chrome)).toBe(true);
  });
  it('a cancelled share is not a save and does not download', async () => {
    const c = caps({ share: vi.fn(async () => { throw new DOMException('x', 'AbortError'); }) });
    expect(await deliverBackup(file, c)).toBe('cancelled');
    expect(c.download).not.toHaveBeenCalled();
    expect(recordsBackup('cancelled', chrome)).toBe(false);
  });
  it('an expired tap asks for another and writes nothing', async () => {
    const c = caps({ share: vi.fn(async () => { throw new DOMException('x', 'NotAllowedError'); }) });
    expect(await deliverBackup(file, c)).toBe('needs-tap');
    expect(recordsBackup('needs-tap', chrome)).toBe(false);
  });
  it('downloads when sharing is unavailable or fails another way', async () => {
    const a = caps({ canShareFile: () => false });
    expect(await deliverBackup(file, a)).toBe('downloaded');
    expect(a.share).not.toHaveBeenCalled();
    const b = caps({ share: vi.fn(async () => { throw new TypeError('x'); }) });
    expect(await deliverBackup(file, b)).toBe('downloaded');
    expect(b.download).toHaveBeenCalledTimes(1);
  });
  it('does not note a download in the installed iOS app', () => {
    expect(recordsBackup('downloaded', iphone(true))).toBe(false);
    expect(recordsBackup('downloaded', chrome)).toBe(true);
  });
});
