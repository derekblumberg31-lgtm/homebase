import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasTransparency, photoForStorage, shouldShrink } from './images';

const MB = 1024 * 1024;

describe('shouldShrink', () => {
  it('shrinks a 3 MB jpeg', () => expect(shouldShrink({ size: 3 * MB, type: 'image/jpeg' })).toBe(true));
  it('leaves a 400 KB jpeg alone', () => expect(shouldShrink({ size: 400 * 1024, type: 'image/jpeg' })).toBe(false));
  it('never touches a PDF, whatever its size', () => expect(shouldShrink({ size: 12 * MB, type: 'application/pdf' })).toBe(false));
  it('covers png, webp and heic', () => {
    for (const type of ['image/png', 'image/webp', 'image/heic']) expect(shouldShrink({ size: 2 * MB, type })).toBe(true);
  });
});

describe('hasTransparency', () => {
  it('is false for fully opaque pixels and true for any see-through one', () => {
    expect(hasTransparency(new Uint8ClampedArray([10, 20, 30, 255, 1, 2, 3, 255]))).toBe(false);
    expect(hasTransparency(new Uint8ClampedArray([10, 20, 30, 255, 1, 2, 3, 0]))).toBe(true);
  });
});

describe('photoForStorage', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A stand-in browser: an image of the given size, a canvas whose pixels are all `alpha`, and an encoder that returns `encoded` bytes. */
  function stubBrowser(opts: { decodes?: boolean; alpha?: number; encodedSize?: number }) {
    const { decodes = true, alpha = 255, encodedSize = 100 } = opts;
    const types: string[] = [];
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 4000;
        naturalHeight = 3000;
        src = '';
        decode() {
          return decodes ? Promise.resolve() : Promise.reject(new Error('decode'));
        }
      },
    );
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined });
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => undefined, getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, alpha]) }) }),
      toBlob: (cb: (b: Blob | null) => void, type: string) => {
        types.push(type);
        cb(new Blob([new Uint8Array(encodedSize)], { type }));
      },
    };
    vi.stubGlobal('document', { createElement: () => canvas });
    return types;
  }
  const big = (name: string, type: string) => new File([new Uint8Array(3 * MB)], name, { type });

  it('S1: a large PNG with transparency is stored as a PNG, not a black-backed JPEG', async () => {
    const types = stubBrowser({ alpha: 0 });
    const out = await photoForStorage(big('plan.png', 'image/png'));
    expect(types).toEqual(['image/png']);
    expect(out.type).toBe('image/png');
    expect(out.name).toBe('plan.png');
  });

  it('S1: if the PNG with transparency would not get smaller, the original is kept', async () => {
    stubBrowser({ alpha: 0, encodedSize: 4 * MB });
    const file = big('plan.png', 'image/png');
    expect(await photoForStorage(file)).toBe(file);
  });

  it('an opaque large PNG still becomes a smaller JPEG', async () => {
    const types = stubBrowser({ alpha: 255 });
    const out = await photoForStorage(big('scan.png', 'image/png'));
    expect(types).toEqual(['image/jpeg']);
    expect(out.name).toBe('scan.jpg');
  });

  it('keeps the original when the photo cannot be decoded', async () => {
    stubBrowser({ decodes: false });
    const file = big('p.heic', 'image/heic');
    expect(await photoForStorage(file)).toBe(file);
  });
});
