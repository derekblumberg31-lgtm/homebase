import { describe, expect, it } from 'vitest';
import { emptyData, type HomeData } from '../../data/store';
import type { HomeRecord, HomeSystem, Item, ServiceEvent } from '../../data/types';
import { formatDate } from '../../lib/dates';
import { reportHistory, reportSystems, reportWarranties } from './report';

const NOW = new Date('2026-11-12T12:00:00').getTime();
const system = (over: Partial<HomeSystem>): HomeSystem => ({ id: 's1', kind: 'water-heater', name: 'Water heater', createdAt: '', updatedAt: '', ...over }) as HomeSystem;
const event = (over: Partial<ServiceEvent>): ServiceEvent => ({ id: 'e1', date: '2026-03-01', title: 'Flushed the tank', createdAt: '', ...over });
const record = (over: Partial<HomeRecord>): HomeRecord => ({ id: 'r1', kind: 'warranty', title: 'Dishwasher warranty', fileIds: [], createdAt: '', updatedAt: '', ...over });
const home = (over: Partial<HomeData>): HomeData => ({ ...emptyData(), ...over });

describe('reportSystems', () => {
  it('T1: says Unknown for no install year, and gives age with the usual life for a 2014 water heater', () => {
    const rows = reportSystems(home({ systems: [system({ id: 'a', name: 'Roof', kind: 'roof' }), system({ installYear: 2014 })] }), NOW);
    expect(rows.find((r) => r.name === 'Roof')?.age).toBe('Unknown');
    expect(rows.find((r) => r.name === 'Water heater')?.age).toBe('12 years (usual life about 10)');
    expect(rows.find((r) => r.name === 'Water heater')?.installed).toBe('2014');
  });

  it('shows serial numbers only when asked, and says Not recorded for what is missing', () => {
    const data = home({ systems: [system({ serial: 'Q201512345' })] });
    expect(reportSystems(data, NOW)[0]).not.toHaveProperty('serial');
    expect(reportSystems(data, NOW, { includeSerials: true })[0].serial).toBe('Q201512345');
    expect(reportSystems(data, NOW)[0]).toMatchObject({ brandModel: 'Not recorded', warranty: 'Not recorded' });
  });

  it('reads a warranty end from the system or its warranty record, past or future', () => {
    const ended = reportSystems(home({ systems: [system({ warrantyExpires: '2026-01-03' })] }), NOW)[0].warranty;
    expect(ended).toBe(`Ended ${formatDate('2026-01-03')}`);
    const fromRecord = reportSystems(home({ systems: [system({})], records: [record({ systemId: 's1', expiresAt: '2027-01-03' })] }), NOW)[0].warranty;
    expect(fromRecord).toBe(`Ends ${formatDate('2027-01-03')}`);
  });
});

describe('reportWarranties', () => {
  it('T2: merges records and system warranties and sorts by end date, listing a repeated one once', () => {
    const rows = reportWarranties(
      home({
        systems: [system({ warrantyExpires: '2027-06-01' }), system({ id: 's2', name: 'Furnace', kind: 'heating', warrantyExpires: '2027-02-01' })],
        records: [record({ id: 'a', title: 'Policy', kind: 'insurance', expiresAt: '2026-12-31' }), record({ id: 'b', systemId: 's2', expiresAt: '2027-02-01' }), record({ id: 'c', title: 'No end date' })],
      }),
      NOW,
    );
    expect(rows.map((r) => r.title)).toEqual(['Policy', 'Dishwasher warranty', 'Water heater warranty']);
    expect(rows[1].covers).toBe('Furnace');
  });
});

describe('reportHistory', () => {
  const data = home({ systems: [system({})], serviceEvents: [event({ systemId: 's1', cost: 120, provider: 'Rivera', notes: 'secret note' }), event({ id: 'e2', date: '2025-05-05', title: 'Old job' })] });

  it('T3: leaves the cost out unless included', () => {
    const years = reportHistory(data);
    expect(years.map((y) => y.year)).toEqual(['2026', '2025']);
    expect(years[0].rows[0]).not.toHaveProperty('cost');
    expect(reportHistory(data, { includeCosts: true })[0].rows[0].cost).toBe('$120');
    expect(reportHistory(data, { includeCosts: true })[1].rows[0]).not.toHaveProperty('cost');
  });

  it('never carries notes', () => {
    expect(JSON.stringify(reportHistory(data))).not.toContain('secret note');
  });

  it('T4: a key is never named as the item a job was done on', () => {
    const key = { id: 'k1', kind: 'key', name: 'Front door key' } as Item;
    const rows = reportHistory(home({ items: [key], serviceEvents: [event({ itemId: 'k1' })] }))[0].rows;
    expect(rows[0].on).toBe('');
    expect(JSON.stringify(rows)).not.toContain('Front door key');
    expect(reportWarranties(home({ items: [key], records: [record({ itemId: 'k1', expiresAt: '2027-01-01' })] }), NOW)[0].covers).toBe('Not linked');
  });
});
