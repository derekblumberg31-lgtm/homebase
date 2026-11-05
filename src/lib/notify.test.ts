import { afterEach, describe, expect, it, vi } from 'vitest';
import { showNotification } from './notify';

const options = { body: 'Due', tag: 'homebase-daily' };

/** The Android Chrome case: the constructor always throws. */
function stubThrowingConstructor() {
  const constructor = vi.fn(function () {
    throw new TypeError('Illegal constructor');
  });
  vi.stubGlobal('Notification', constructor);
  return constructor;
}

describe('showNotification', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('goes through the service worker when one is active', async () => {
    const constructor = stubThrowingConstructor();
    const show = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({ active: {}, showNotification: show }) } });

    await showNotification('Homebase', options);

    expect(show).toHaveBeenCalledWith('Homebase', options);
    expect(constructor).not.toHaveBeenCalled();
  });

  it('uses the constructor when no worker is registered', async () => {
    const constructor = vi.fn();
    vi.stubGlobal('Notification', constructor);
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => undefined } });

    await showNotification('Homebase', options);

    expect(constructor).toHaveBeenCalledOnce();
  });

  it('rejects when nothing can show it, so the caller can try again later', async () => {
    stubThrowingConstructor();
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({ active: null }) } });

    await expect(showNotification('Homebase', options)).rejects.toThrow('Illegal constructor');
  });
});
