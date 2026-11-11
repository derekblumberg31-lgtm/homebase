import { describe, expect, it } from 'vitest';
import { backupStatus } from './ConfirmWithBackup';
import { toastFor } from './useSaveBackup';

describe('backup toasts', () => {
  it('says what happened and is silent for a cancelled share', () => {
    expect(toastFor({ outcome: 'cancelled', date: 'skipped' })).toBeNull();
    expect(toastFor({ outcome: 'shared', date: 'written' })).toEqual({ text: 'Backup saved' });
    expect(toastFor({ outcome: 'downloaded', date: 'written' })?.text).toBe('Backup downloaded. Check your Downloads folder.');
    expect(toastFor({ outcome: 'downloaded', date: 'skipped' })?.text).toBe('Check that the backup reached Files before you rely on it.');
    expect(toastFor({ outcome: 'shared', date: 'failed' })?.text).toBe('The backup was saved, but Homebase couldn’t note the date.');
    expect(toastFor({ outcome: 'failed', date: 'skipped' })).toEqual({ text: 'The backup couldn’t be saved. Try again.', tone: 'error' });
  });
});

describe('erase and restore backup status', () => {
  it('does not say a download is done when the device cannot confirm it', () => {
    expect(backupStatus({ outcome: 'downloaded', date: 'skipped' }, 'erase')).toBe('Check that the backup reached Files before you erase.');
    expect(backupStatus({ outcome: 'downloaded', date: 'skipped' }, 'restore')).toBe('Check that the backup reached Files before you restore.');
  });

  it('reports a confirmed backup without inviting the next step', () => {
    expect(backupStatus({ outcome: 'downloaded', date: 'written' }, 'erase')).toBe('Backup downloaded.');
    expect(backupStatus({ outcome: 'shared', date: 'written' }, 'restore')).toBe('Backup saved.');
    expect(backupStatus({ outcome: 'cancelled', date: 'skipped' }, 'erase')).toBeNull();
  });
});
