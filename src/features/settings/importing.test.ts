import { describe, expect, it, vi } from 'vitest';
import { freshStore } from '../../test/freshStore';
import type { DeliverCaps, DeviceEnv } from '../../lib/dataSafety';
import { prepareBackupFile, prepareRestore, saveBackup } from './importing';
import { backupNudge } from '../../lib/dataSafety';

const env: DeviceEnv = { ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/126', platform: 'Win32', maxTouchPoints: 0, standalone: false };
const iosApp: DeviceEnv = { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1', platform: 'iPhone', maxTouchPoints: 5, standalone: true };
const caps = (over: Partial<DeliverCaps> = {}): DeliverCaps => ({ canShareFile: () => true, share: vi.fn(async () => {}), download: vi.fn(), ...over });

describe('saveBackup', () => {
  it('writes the date once when the share goes through', async () => {
    const store = await freshStore();
    const spy = vi.spyOn(store, 'updateSettings');
    const result = await saveBackup(store, caps(), env);
    expect(result).toMatchObject({ outcome: 'shared', date: 'written' });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().settings.lastBackupAt).toBeTruthy();
  });

  it('does not write the date when the share is cancelled', async () => {
    const store = await freshStore();
    const spy = vi.spyOn(store, 'updateSettings');
    const result = await saveBackup(store, caps({ share: vi.fn(async () => { throw new DOMException('x', 'AbortError'); }) }), env);
    expect(result.outcome).toBe('cancelled');
    expect(spy).not.toHaveBeenCalled();
    expect(store.getSnapshot().settings.lastBackupAt).toBeUndefined();
  });

  it('downloads and writes the date when sharing is unavailable', async () => {
    const store = await freshStore();
    const c = caps({ canShareFile: () => false });
    const result = await saveBackup(store, c, env);
    expect(c.download).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ outcome: 'downloaded', date: 'written' });
  });

  it('does not write the date for a download in the installed iOS app', async () => {
    const store = await freshStore();
    const result = await saveBackup(store, caps({ canShareFile: () => false }), iosApp);
    expect(result).toMatchObject({ outcome: 'downloaded', date: 'skipped' });
    expect(store.getSnapshot().settings.lastBackupAt).toBeUndefined();
  });

  it('keeps the file for a second tap when the tap ran out', async () => {
    const store = await freshStore();
    const result = await saveBackup(store, caps({ share: vi.fn(async () => { throw new DOMException('x', 'NotAllowedError'); }) }), env);
    expect(result.outcome).toBe('needs-tap');
    expect(result.file).toBeInstanceOf(File);
    expect(store.getSnapshot().settings.lastBackupAt).toBeUndefined();
  });

  it('reports a failed date write honestly', async () => {
    const store = await freshStore();
    vi.spyOn(store, 'updateSettings').mockRejectedValue(new Error('full'));
    expect(await saveBackup(store, caps(), env)).toMatchObject({ outcome: 'shared', date: 'failed' });
  });
});

describe('prepareRestore', () => {
  it('dates a restored home from the backup it came from, so it is not told it is unsaved', async () => {
    const source = await freshStore();
    await source.put('tasks', { id: 't1', kind: 'maintenance', name: 'Clean the gutters', typeId: 'custom', location: '', lastDoneAt: '2026-10-27', intervalDays: 365, recurring: true, status: 'open', createdAt: '2026-10-27T00:00:00.000Z', updatedAt: '2026-10-27T00:00:00.000Z' });
    await source.log('task-added', 'Added: Clean the gutters');
    await source.log('task-added', 'Added: one');
    await source.log('task-added', 'Added: two');
    const file = await prepareBackupFile(source);
    const exportedAt = JSON.parse(await file.text()).exportedAt as string;

    const target = await freshStore();
    const summary = await prepareRestore(target, file);
    await summary.apply();
    expect(target.getSnapshot().settings.lastBackupAt).toBe(exportedAt);
    expect(backupNudge(target.getSnapshot(), Date.now())).toBeNull();
  });

  it('still restores when the date cannot be written', async () => {
    const source = await freshStore();
    const file = await prepareBackupFile(source);
    const target = await freshStore();
    vi.spyOn(target, 'updateSettings').mockRejectedValue(new Error('full'));
    const summary = await prepareRestore(target, file);
    await expect(summary.apply()).resolves.toBeUndefined();
  });
});
