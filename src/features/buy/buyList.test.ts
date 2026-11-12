import { describe, expect, it } from 'vitest';
import { buildBackup, parseHomebaseBackup, readBackup } from '../../data/backup';
import type { HomeRecord, HomeSystem } from '../../data/types';
import { freshStore } from '../../test/freshStore';
import { filterSizeFrom, filterSizeSuggestion, findBuyRecord, formatBuyList, parseBuyList } from './buyList';

const note = (title: string, notes = ''): HomeRecord => ({ id: title, kind: 'note', title, notes, fileIds: [], createdAt: '', updatedAt: '' });

describe('buy list', () => {
  it('T1: formatting what was parsed is stable', () => {
    const text = 'Furnace filter: 16x25x1 MERV 8\nKitchen ceiling bulbs: A19 LED 2700K';
    expect(formatBuyList(parseBuyList(text))).toBe(text);
    expect(formatBuyList(parseBuyList(formatBuyList(parseBuyList(text))))).toBe(text);
  });

  it('T2: splits on the first colon only', () => {
    expect(parseBuyList('Paint: Benjamin Moore OC-17: eggshell')).toEqual([{ label: 'Paint', value: 'Benjamin Moore OC-17: eggshell' }]);
  });

  it('T3: keeps a line with no colon as a label, and drops blank lines', () => {
    expect(parseBuyList('Batteries\n\n  \nBulbs: A19')).toEqual([
      { label: 'Batteries', value: '' },
      { label: 'Bulbs', value: 'A19' },
    ]);
    expect(formatBuyList([{ label: 'Batteries', value: '' }])).toBe('Batteries');
  });

  it('T4: finds the note by its exact title only', () => {
    expect(findBuyRecord([note('What to buy for the party')])).toBeUndefined();
    expect(findBuyRecord([note('What to Buy ')])?.id).toBe('What to Buy ');
    expect(findBuyRecord([{ ...note('What to buy'), kind: 'receipt' }])).toBeUndefined();
  });

  it('T5: finds a filter size in notes, not a model number', () => {
    expect(filterSizeFrom('Uses a 16 x 25 x 1 filter')).toBe('16 x 25 x 1');
    expect(filterSizeFrom('Model 1625')).toBeUndefined();
    const system = (kind: HomeSystem['kind'], notes: string) => ({ id: kind, kind, name: kind, notes, createdAt: '', updatedAt: '' }) as HomeSystem;
    expect(filterSizeSuggestion([system('plumbing', '20x25x1'), system('heating', 'Takes 20x25x4 media')])).toBe('20x25x4');
    expect(filterSizeSuggestion([system('plumbing', '20x25x1')])).toBeUndefined();
  });

  it('T6: the record survives a backup and restore', async () => {
    const store = await freshStore();
    await store.put('records', note('What to buy', 'Furnace filter: 16x25x1'));
    const text = await buildBackup(store.getSnapshot(), await store.allFiles());
    const { data, files } = parseHomebaseBackup(readBackup(text)!);
    const restored = await freshStore();
    await restored.replaceAll(data, files);
    expect(parseBuyList(findBuyRecord(restored.getSnapshot().records)?.notes)).toEqual([{ label: 'Furnace filter', value: '16x25x1' }]);
  });
});
