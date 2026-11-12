import { describe, expect, it } from 'vitest';
import { emptyData, type HomeData } from '../../data/store';
import type { HomeRecord } from '../../data/types';
import { GUIDES } from './guides';
import { issueContextFor } from './issueContext';

const NOW = new Date('2026-11-12T12:00:00').getTime();
const guide = (id: string) => GUIDES.find((g) => g.id === id)!;
const record = (over: Partial<HomeRecord>): HomeRecord => ({
  id: 'r1',
  kind: 'note',
  title: 'Gas shutoff',
  notes: 'At the meter, right side of the house',
  fileIds: [],
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...over,
});
const home = (records: HomeRecord[]): HomeData => ({ ...emptyData(), records });

describe('issueContextFor: shutoffs and phone numbers', () => {
  it('F3-T7: a gas smell with no saved gas shutoff shows no facts at all', () => {
    expect(issueContextFor(guide('gas-smell'), 'I smell gas', emptyData(), NOW).facts).toEqual([]);
  });

  it('F3-T8: a saved gas shutoff shows with the only-if-told sentence and no warning', () => {
    const { facts } = issueContextFor(guide('gas-smell'), 'I smell gas', home([record({ fileIds: ['f1'] })]), NOW);
    expect(facts).toHaveLength(1);
    expect(facts[0].text).toBe('At the meter, right side of the house. Only touch it if the gas company or firefighters tell you to.');
    expect(facts[0].warn).toBeUndefined();
    expect(facts[0].photoRecordId).toBe('r1');
  });

  it('shows no gas shutoff for a home without gas', () => {
    const data: HomeData = { ...home([record({})]), settings: { ...emptyData().settings, hasGas: false } };
    expect(issueContextFor(guide('gas-smell'), 'I smell gas', data, NOW).facts).toEqual([]);
  });

  it('keeps emergency answers to what was saved: no prompts, no system or contractor noise', () => {
    const data = home([record({ id: 'p', title: 'Electrical panel', notes: 'Garage' }), record({ id: 'c', kind: 'contractor', title: 'Rivera Electric', vendor: 'Electrician', phone: '555 0100' })]);
    const { facts } = issueContextFor(guide('fire-smoke'), 'there is smoke from my furnace', data, NOW);
    expect(facts.map((f) => f.label)).toEqual(['Electrical panel']);
    expect(facts.some((f) => f.warn)).toBe(false);
  });

  it('F3-T9: a water leak with a plumber phone gives the contractor fact a number to dial', () => {
    const data = home([record({ id: 'c', kind: 'contractor', title: 'Rivera Plumbing', vendor: 'Plumber', phone: '(555) 010-0100' })]);
    const { facts } = issueContextFor(guide('water-leak'), 'water is leaking under the sink', data, NOW);
    const fact = facts.find((f) => f.label === 'Your contractor')!;
    expect(fact.tel).toBe('5550100100');
    expect(fact.callName).toBe('Rivera Plumbing');
  });

  it('adds the insurer for a leak when its record has a phone, and not when it has none', () => {
    const withPhone = home([record({ id: 'i', kind: 'insurance', title: 'Acme Home Policy', notes: undefined, phone: '555 222 3333' })]);
    const fact = issueContextFor(guide('water-leak'), 'water is leaking under the sink', withPhone, NOW).facts.find((f) => f.label === 'Home insurance');
    expect(fact).toMatchObject({ text: 'Acme Home Policy', tel: '5552223333' });
    const without = home([record({ id: 'i', kind: 'insurance', title: 'Acme Home Policy', notes: undefined })]);
    expect(issueContextFor(guide('water-leak'), 'water is leaking under the sink', without, NOW).facts.some((f) => f.label === 'Home insurance')).toBe(false);
  });

  it('keeps the not-saved-yet prompt for a calmer problem', () => {
    const fact = issueContextFor(guide('water-leak'), 'a slow drip under the sink', emptyData(), NOW).facts.find((f) => f.label === 'Main water shutoff')!;
    expect(fact.warn).toBe(true);
  });
});
