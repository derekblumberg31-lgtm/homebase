import { describe, expect, it } from 'vitest';
import { nextRadioIndex, radioTabIndex } from './radioKeys';

describe('radio keys', () => {
  it('moves forward and back by one', () => {
    expect(nextRadioIndex('ArrowRight', 1, 4)).toBe(2);
    expect(nextRadioIndex('ArrowDown', 1, 4)).toBe(2);
    expect(nextRadioIndex('ArrowLeft', 2, 4)).toBe(1);
    expect(nextRadioIndex('ArrowUp', 2, 4)).toBe(1);
  });
  it('wraps at both ends', () => {
    expect(nextRadioIndex('ArrowRight', 3, 4)).toBe(0);
    expect(nextRadioIndex('ArrowLeft', 0, 4)).toBe(3);
  });
  it('moves on from the focused first choice when nothing is selected', () => {
    expect(nextRadioIndex('ArrowRight', 0, 4)).toBe(1);
  });
  it('treats an unknown focus as the first choice', () => {
    expect(nextRadioIndex('ArrowRight', -1, 4)).toBe(1);
  });
  it('ignores other keys and empty groups', () => {
    expect(nextRadioIndex('Tab', 1, 4)).toBeNull();
    expect(nextRadioIndex('ArrowRight', 0, 0)).toBeNull();
  });
  it('lets Tab enter on the selected choice, or the first', () => {
    expect(radioTabIndex(2)).toBe(2);
    expect(radioTabIndex(-1)).toBe(0);
  });
});
