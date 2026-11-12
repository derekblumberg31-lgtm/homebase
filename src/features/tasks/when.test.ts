import { describe, expect, it } from 'vitest';
import { WHEN_OPTIONS, whenToDate } from './when';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 15, 30);

describe('When chips', () => {
  it('"This month" lands on the last day of the current month', () => {
    expect(whenToDate('month', '', at(2026, 11, 11))).toBe('2026-11-30');
    expect(whenToDate('month', '', at(2026, 11, 30))).toBe('2026-11-30');
    expect(whenToDate('month', '', at(2026, 12, 31))).toBe('2026-12-31');
    expect(whenToDate('month', '', at(2026, 12, 1))).toBe('2026-12-31');
    expect(whenToDate('month', '', at(2028, 2, 3))).toBe('2028-02-29');
  });

  it('"In a week" is exactly seven days out, across month and year ends', () => {
    expect(whenToDate('week', '', at(2026, 11, 11))).toBe('2026-11-18');
    expect(whenToDate('week', '', at(2026, 12, 28))).toBe('2027-01-04');
  });

  it('"Today" and a picked date are unchanged', () => {
    expect(whenToDate('today', '', at(2026, 11, 11))).toBe('2026-11-11');
    expect(whenToDate('date', '2027-03-04', at(2026, 11, 11))).toBe('2027-03-04');
  });

  it('only promises what the dates deliver', () => {
    expect(WHEN_OPTIONS.map((o) => o.label)).toEqual(['Today', 'In a week', 'This month', 'Pick a date']);
  });
});
