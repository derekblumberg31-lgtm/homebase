import { describe, expect, it } from 'vitest';
import { createAttachQueue } from './attachQueue';

const file = (name: string) => new File(['x'], name);

describe('createAttachQueue', () => {
  it('S3: settled() waits for a photo that is still saving, so Save or Cancel sees it', async () => {
    let release: () => void = () => undefined;
    const queue = createAttachQueue((f) => new Promise((resolve) => (release = () => resolve(`id-${f.name}`))));
    void queue.add(file('a'));
    let seen: string[] | undefined;
    const waiting = queue.settled().then((ids) => (seen = ids));
    await Promise.resolve();
    expect(seen).toBeUndefined();
    release();
    await waiting;
    expect(seen).toEqual(['id-a']);
  });

  it('keeps going after a photo that could not be saved, and forgets removed ones', async () => {
    const queue = createAttachQueue(async (f) => (f.name === 'bad' ? undefined : `id-${f.name}`));
    await Promise.all([queue.add(file('a')), queue.add(file('bad')), queue.add(file('b'))]);
    expect(await queue.settled()).toEqual(['id-a', 'id-b']);
    queue.forget('id-a');
    expect(await queue.settled()).toEqual(['id-b']);
  });
});
