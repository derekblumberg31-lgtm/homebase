import { describe, expect, it } from 'vitest';
import { emptyData, type HomeData } from '../data/store';
import type { Task } from '../data/types';
import { canonicalHash } from './docHash';

const task = (id: string, name = 'Change the filter'): Task => ({
  id,
  kind: 'maintenance',
  name,
  typeId: 'custom',
  location: '',
  lastDoneAt: '2026-08-01',
  intervalDays: 90,
  recurring: true,
  status: 'open',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
});

const home = (tasks: Task[]): HomeData => ({ ...emptyData(), tasks });

describe('canonicalHash', () => {
  it('does not depend on the order of rows', async () => {
    const a = await canonicalHash(home([task('a'), task('b')]), []);
    const b = await canonicalHash(home([task('b'), task('a')]), []);
    expect(a).toBe(b);
  });

  it('does not depend on the order of keys', async () => {
    const t = task('a');
    const reordered = Object.fromEntries(Object.entries(t).reverse()) as Task;
    expect(await canonicalHash(home([t]), [])).toBe(await canonicalHash(home([reordered]), []));
  });

  it('ignores lastBackupAt, because saving a backup file is not a change to the home', async () => {
    const plain = home([task('a')]);
    const backedUp: HomeData = { ...plain, settings: { ...plain.settings, lastBackupAt: '2026-11-12T10:00:00.000Z' } };
    expect(await canonicalHash(backedUp, [])).toBe(await canonicalHash(plain, []));
  });

  it('changes on any field edit', async () => {
    const before = await canonicalHash(home([task('a')]), []);
    expect(await canonicalHash(home([task('a', 'Change the filters')]), [])).not.toBe(before);
    const settingsChanged = home([task('a')]);
    settingsChanged.settings = { ...settingsChanged.settings, theme: 'dark' };
    expect(await canonicalHash(settingsChanged, [])).not.toBe(before);
  });

  it('changes when a row is added or removed', async () => {
    expect(await canonicalHash(home([task('a'), task('b')]), [])).not.toBe(await canonicalHash(home([task('a')]), []));
  });

  it('changes when a file is added, and not when files are listed in another order', async () => {
    const data = home([task('a')]);
    const none = await canonicalHash(data, []);
    const one = await canonicalHash(data, [{ id: 'f1', size: 10, type: 'image/jpeg' }]);
    expect(one).not.toBe(none);
    const ab = await canonicalHash(data, [
      { id: 'f1', size: 10, type: 'image/jpeg' },
      { id: 'f2', size: 5, type: 'application/pdf' },
    ]);
    const ba = await canonicalHash(data, [
      { id: 'f2', size: 5, type: 'application/pdf' },
      { id: 'f1', size: 10, type: 'image/jpeg' },
    ]);
    expect(ab).toBe(ba);
  });
});
