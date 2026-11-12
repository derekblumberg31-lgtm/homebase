import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOAD_FAILED, loadLabelReader } from './labelReader';

vi.mock('../keys/engine', () => ({ addEngineScript: vi.fn(async () => undefined), fileToCanvas: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', {});
  vi.stubGlobal('location', { href: 'http://localhost/' });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('loadLabelReader', () => {
  it('S5: a worker that finishes starting after the timeout is terminated', async () => {
    const terminate = vi.fn(async () => undefined);
    let finish: (w: unknown) => void = () => undefined;
    (window as unknown as { Tesseract: unknown }).Tesseract = {
      createWorker: () => new Promise((resolve) => (finish = resolve)),
    };
    const result = loadLabelReader();
    const caught = expect(result).rejects.toThrow(LOAD_FAILED);
    await vi.advanceTimersByTimeAsync(26000);
    await caught;
    finish({ setParameters: vi.fn(), terminate });
    await vi.advanceTimersByTimeAsync(0);
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it('S5: a worker whose setParameters fails is terminated', async () => {
    const terminate = vi.fn(async () => undefined);
    (window as unknown as { Tesseract: unknown }).Tesseract = {
      createWorker: async () => ({ setParameters: async () => Promise.reject(new Error('nope')), terminate }),
    };
    await expect(loadLabelReader()).rejects.toThrow(LOAD_FAILED);
    expect(terminate).toHaveBeenCalledTimes(1);
  });
});
