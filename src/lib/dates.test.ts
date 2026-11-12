import { describe, expect, it } from 'vitest';
import { formatEvery } from './dates';

describe('formatEvery', () => {
  it('drops the 1 for a single unit', () => {
    expect(formatEvery(365)).toBe('Every year');
    expect(formatEvery(30)).toBe('Every month');
    expect(formatEvery(7)).toBe('Every week');
  });

  it('keeps the count otherwise', () => {
    expect(formatEvery(90)).toBe('Every 3 months');
    expect(formatEvery(730)).toBe('Every 2 years');
    expect(formatEvery(10)).toBe('Every 10 days');
  });
});
