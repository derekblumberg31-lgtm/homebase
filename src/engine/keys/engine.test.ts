import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/** A stand-in for a script tag: the test fires its load or error by hand. */
interface FakeScript {
  src: string;
  async: boolean;
  dataset: Record<string, string>;
  onload?: () => void;
  onerror?: () => void;
  remove: () => void;
}

let tags: FakeScript[] = [];
let addEngineScript: (src: string, async?: boolean) => Promise<void>;
const tagsFor = (src: string) => tags.filter((t) => t.dataset.engine === src);

beforeAll(async () => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', {
    createElement: () => {
      const tag: FakeScript = { src: '', async: false, dataset: {}, remove: () => (tags = tags.filter((t) => t !== tag)) };
      return tag;
    },
    head: { appendChild: (t: FakeScript) => void tags.push(t) },
  });
  ({ addEngineScript } = await import('./engine'));
});
afterEach(() => (tags = []));

describe('addEngineScript', () => {
  it('S4: a failed load removes its tag and can be tried again without reloading', async () => {
    const first = addEngineScript('vendor/a.js');
    tagsFor('vendor/a.js')[0].onerror!();
    await expect(first).rejects.toThrow('Check your connection');
    expect(tagsFor('vendor/a.js')).toHaveLength(0);

    const second = addEngineScript('vendor/a.js');
    expect(tagsFor('vendor/a.js')).toHaveLength(1);
    tagsFor('vendor/a.js')[0].onload!();
    await expect(second).resolves.toBeUndefined();
  });

  it('S4: a second caller waits for a load that is still running instead of resolving early', async () => {
    const first = addEngineScript('vendor/b.js');
    let secondDone = false;
    const second = addEngineScript('vendor/b.js').then(() => (secondDone = true));
    expect(tagsFor('vendor/b.js')).toHaveLength(1);
    await Promise.resolve();
    expect(secondDone).toBe(false);
    tagsFor('vendor/b.js')[0].onload!();
    await Promise.all([first, second]);
    expect(secondDone).toBe(true);
  });
});
