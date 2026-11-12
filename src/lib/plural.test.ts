import { describe, expect, it } from 'vitest';
import { plural } from './plural';

describe('plural', () => {
  it('uses the singular only for one', () => {
    expect(plural(1, 'step')).toBe('1 step');
    expect(plural(0, 'step')).toBe('0 steps');
    expect(plural(5, 'attached file')).toBe('5 attached files');
  });
});
