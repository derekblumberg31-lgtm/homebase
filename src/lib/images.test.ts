import { describe, expect, it } from 'vitest';
import { shouldShrink } from './images';

const MB = 1024 * 1024;

describe('shouldShrink', () => {
  it('shrinks a 3 MB jpeg', () => expect(shouldShrink({ size: 3 * MB, type: 'image/jpeg' })).toBe(true));
  it('leaves a 400 KB jpeg alone', () => expect(shouldShrink({ size: 400 * 1024, type: 'image/jpeg' })).toBe(false));
  it('never touches a PDF, whatever its size', () => expect(shouldShrink({ size: 12 * MB, type: 'application/pdf' })).toBe(false));
  it('covers png, webp and heic', () => {
    for (const type of ['image/png', 'image/webp', 'image/heic']) expect(shouldShrink({ size: 2 * MB, type })).toBe(true);
  });
});
