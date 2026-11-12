import { describe, expect, it } from 'vitest';
import { buildBackup, parseHomebaseBackup, readBackup } from '../../data/backup';
import { emptyData, type HomeData } from '../../data/store';
import type { HomeRecord } from '../../data/types';
import { freshStore } from '../../test/freshStore';
import { saveLocation } from '../home/starterActions';
import { CONTACT_ROLES, contactsFor, noGas, SHUTOFFS, shutoffLocation, shutoffProgress, shutoffRecord, telHref } from './safety';

const note = (over: Partial<HomeRecord> = {}): HomeRecord => ({
  id: 'n1',
  kind: 'note',
  title: 'Main water shutoff',
  notes: 'Basement',
  fileIds: [],
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...over,
});

describe('shutoffLocation', () => {
  it('F3-T1: finds nothing in an empty home', () => {
    const data: HomeData = emptyData();
    for (const s of SHUTOFFS) {
      expect(shutoffLocation(data, s.id)).toBeUndefined();
      expect(shutoffRecord(data, s.id)).toBeUndefined();
    }
  });

  it('F3-T2: the note in Records wins over the Health Check step copy', () => {
    const data: HomeData = {
      ...emptyData(),
      records: [note({ notes: 'Basement' })],
      settings: { ...emptyData().settings, healthSteps: { 'water-shutoff': { state: 'done', at: '2026-11-01T00:00:00.000Z', note: 'Garage' } } },
    };
    expect(shutoffLocation(data, 'water-shutoff')).toBe('Basement');
  });

  it('falls back to the step copy when there is no note', () => {
    const data: HomeData = {
      ...emptyData(),
      settings: { ...emptyData().settings, healthSteps: { 'water-shutoff': { state: 'done', at: '2026-11-01T00:00:00.000Z', note: 'Garage' } } },
    };
    expect(shutoffLocation(data, 'water-shutoff')).toBe('Garage');
  });
});

describe('saveLocation with photos', () => {
  it('F3-T6: stores fileIds on the record, and Undo restores the earlier ones and note', async () => {
    const store = await freshStore();
    const kept = await store.saveFile(new Blob(['old'], { type: 'image/jpeg' }), 'old.jpg');
    await saveLocation(store, 'water-shutoff', 'Basement', { fileIds: [kept.id] });
    const added = await store.saveFile(new Blob(['new'], { type: 'image/jpeg' }), 'new.jpg');
    const undo = await saveLocation(store, 'water-shutoff', 'Garage', { fileIds: [kept.id, added.id] });
    expect(store.getSnapshot().records[0]).toMatchObject({ notes: 'Garage', fileIds: [kept.id, added.id] });

    await undo();
    expect(store.getSnapshot().records[0]).toMatchObject({ notes: 'Basement', fileIds: [kept.id] });
    expect(await store.getFile(added.id)).toBeUndefined();
    expect(await store.getFile(kept.id)).toBeDefined();
  });

  it('keeps the existing photos when no fileIds are given', async () => {
    const store = await freshStore();
    const file = await store.saveFile(new Blob(['x'], { type: 'image/jpeg' }), 'x.jpg');
    await saveLocation(store, 'gas-shutoff', 'Side of house', { fileIds: [file.id] });
    await saveLocation(store, 'gas-shutoff', 'Side of house, left');
    expect(store.getSnapshot().records[0].fileIds).toEqual([file.id]);
  });
});

describe('backup regression', () => {
  it('F3-T10: three shutoff notes with a file each survive a backup and restore', async () => {
    const store = await freshStore();
    const bodies: Record<string, string> = {};
    for (const [i, s] of SHUTOFFS.entries()) {
      const file = await store.saveFile(new Blob([`photo-${i}`], { type: 'image/jpeg' }), `${s.id}.jpg`);
      bodies[s.id] = file.id;
      await saveLocation(store, s.id, `Place ${i}`, { fileIds: [file.id] });
    }
    const text = await buildBackup(store.getSnapshot(), await store.allFiles());
    const { data, files } = parseHomebaseBackup(readBackup(text)!);

    const restored = await freshStore();
    await restored.replaceAll(data, files);
    for (const [i, s] of SHUTOFFS.entries()) {
      expect(shutoffLocation(restored.getSnapshot(), s.id)).toBe(`Place ${i}`);
      const record = shutoffRecord(restored.getSnapshot(), s.id)!;
      expect(record.fileIds).toEqual([bodies[s.id]]);
      const file = await restored.getFile(record.fileIds[0]);
      expect(await file!.data.text()).toBe(`photo-${i}`);
    }
  });

  it('F4-T2: a record with two files comes back with byte-identical blobs', async () => {
    const store = await freshStore();
    const bytesA = new Uint8Array([0, 1, 2, 250, 251, 255]);
    const bytesB = new Uint8Array([9, 8, 7, 0, 128]);
    const a = await store.saveFile(new Blob([bytesA], { type: 'image/jpeg' }), 'a.jpg');
    const b = await store.saveFile(new Blob([bytesB], { type: 'application/pdf' }), 'b.pdf');
    await store.put('records', note({ id: 'r1', title: 'Receipt', fileIds: [a.id, b.id] }));

    const text = await buildBackup(store.getSnapshot(), await store.allFiles());
    const { data, files } = parseHomebaseBackup(readBackup(text)!);
    const restored = await freshStore();
    await restored.replaceAll(data, files);

    expect(restored.getSnapshot().records[0].fileIds).toEqual([a.id, b.id]);
    const got = await Promise.all([a.id, b.id].map((id) => restored.getFile(id)));
    expect(got.map((f) => f!.type)).toEqual(['image/jpeg', 'application/pdf']);
    expect(new Uint8Array(await got[0]!.data.arrayBuffer())).toEqual(bytesA);
    expect(new Uint8Array(await got[1]!.data.arrayBuffer())).toEqual(bytesB);
  });
});

const contact = (over: Partial<HomeRecord> = {}): HomeRecord => ({
  id: 'c1',
  kind: 'contractor',
  title: 'Rivera Plumbing',
  vendor: 'Plumber',
  phone: '(555) 010-0100',
  fileIds: [],
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...over,
});

describe('contacts', () => {
  it('F3-T1: every role is empty in an empty home', () => {
    for (const { role } of CONTACT_ROLES) expect(contactsFor(emptyData(), role)).toEqual([]);
  });

  it('F3-T3: finds a plumber by trade and dials digits only', () => {
    const data: HomeData = { ...emptyData(), records: [contact()] };
    expect(contactsFor(data, 'plumber')[0].id).toBe('c1');
    expect(contactsFor(data, 'electrician')).toEqual([]);
    expect(telHref('(555) 010-0100')).toBe('tel:5550100100');
    expect(telHref('+1 555 010 0100')).toBe('tel:+15550100100');
  });

  it('F3-T4: an insurance record without a phone is listed but cannot be dialled', () => {
    const data: HomeData = { ...emptyData(), records: [contact({ id: 'i1', kind: 'insurance', title: 'Policy', vendor: undefined, phone: undefined })] };
    const found = contactsFor(data, 'insurer');
    expect(found).toHaveLength(1);
    expect(telHref(found[0].phone)).toBeUndefined();
  });

  it('F3-T5: text that is not a number gives no link', () => {
    expect(telHref('ext')).toBeUndefined();
    expect(telHref(undefined)).toBeUndefined();
  });

  it('lists a contact with a phone before one without, then the newest', () => {
    const data: HomeData = {
      ...emptyData(),
      records: [contact({ id: 'a', phone: undefined, updatedAt: '2026-11-09T00:00:00.000Z' }), contact({ id: 'b', updatedAt: '2026-10-01T00:00:00.000Z' }), contact({ id: 'c', updatedAt: '2026-11-02T00:00:00.000Z' })],
    };
    expect(contactsFor(data, 'plumber').map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('shutoff progress', () => {
  it('counts saved places, and leaves gas out of homes without it', () => {
    const base = emptyData();
    expect(shutoffProgress(base)).toEqual({ saved: 0, total: 3 });
    const noGasHome: HomeData = { ...base, settings: { ...base.settings, hasGas: false }, records: [note()] };
    expect(noGas(noGasHome)).toBe(true);
    expect(shutoffProgress(noGasHome)).toEqual({ saved: 1, total: 2 });
  });
});
