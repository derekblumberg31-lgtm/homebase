import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createSaveRunner, SAVE_FAILED_COPY, SaveFailed, type SaveState } from './save';

function runner() {
  const states: SaveState[] = [];
  const run = createSaveRunner((s) => states.push(s));
  return { run, states, last: () => states[states.length - 1] };
}

describe('createSaveRunner', () => {
  it('resolves true on success and leaves nothing set', async () => {
    const { run, last } = runner();
    expect(await run(async () => {})).toBe(true);
    expect(last()).toEqual({ saving: false, failed: false });
  });

  it('resolves false on a throw, marks failed and clears saving', async () => {
    const { run, last } = runner();
    expect(
      await run(async () => {
        throw new Error('quota');
      }),
    ).toBe(false);
    expect(last()).toEqual({ saving: false, failed: true });
  });

  it('clears failed on the next attempt', async () => {
    const { run, states, last } = runner();
    await run(async () => {
      throw new Error('x');
    });
    const promise = run(async () => {});
    expect(states[states.length - 1]).toEqual({ saving: true, failed: false });
    await promise;
    expect(last()).toEqual({ saving: false, failed: false });
  });

  it('is saving while work is pending and ignores a second call', async () => {
    const { run, last } = runner();
    let release!: () => void;
    const first = run(() => new Promise<void>((r) => (release = r)));
    expect(last().saving).toBe(true);
    const spy = vi.fn(async () => {});
    expect(await run(spy)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    release();
    expect(await first).toBe(true);
    expect(last().saving).toBe(false);
  });

  it('catches a synchronous throw inside the work', async () => {
    const { run, last } = runner();
    expect(
      await run(() => {
        throw new Error('sync');
      }),
    ).toBe(false);
    expect(last().failed).toBe(true);
  });
});

describe('TasksPage-style handler (put then optional log)', () => {
  const handler = (put: () => Promise<void>, log: () => Promise<void>) => async () => {
    await put();
    try {
      await log();
    } catch {
      /* activity is optional */
    }
  };

  it('resolves when only the log fails', async () => {
    await expect(
      handler(
        async () => {},
        async () => {
          throw new Error('log');
        },
      )(),
    ).resolves.toBeUndefined();
  });

  it('rejects and skips the log when put fails', async () => {
    const log = vi.fn(async () => {});
    await expect(
      handler(async () => {
        throw new Error('put');
      }, log)(),
    ).rejects.toThrow('put');
    expect(log).not.toHaveBeenCalled();
  });
});

describe('SaveFailed', () => {
  it('renders nothing when not shown', () => {
    expect(renderToStaticMarkup(<SaveFailed show={false} />)).toBe('');
  });

  it('renders an alert with the default copy', () => {
    const html = renderToStaticMarkup(<SaveFailed show />);
    expect(html).toContain('role="alert"');
    expect(html).toContain(SAVE_FAILED_COPY.replace(/’/g, '’'));
  });

  it('accepts custom copy', () => {
    expect(renderToStaticMarkup(<SaveFailed show>That person wasn’t removed. Try again.</SaveFailed>)).toContain('That person wasn’t removed. Try again.');
  });
});
