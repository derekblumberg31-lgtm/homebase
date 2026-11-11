import { describe, expect, it } from 'vitest';
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
