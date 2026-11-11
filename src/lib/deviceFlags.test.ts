import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addToStringList, clearFlag, clearHomeFlags, readFlag, readStringList, writeFlag, writeStringList } from './deviceFlags';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

const throwing = (): Storage => {
  const boom = () => {
    throw new Error('denied');
  };
  return { length: 0, clear: boom, getItem: boom, key: boom, removeItem: boom, setItem: boom };
};

afterEach(() => vi.unstubAllGlobals());

describe('deviceFlags with working storage', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));

  it('reads null for an unset flag, then what was written', () => {
    expect(readFlag('homebase:starter-dismissed')).toBeNull();
    expect(writeFlag('homebase:starter-dismissed', '1')).toBe(true);
    expect(readFlag('homebase:starter-dismissed')).toBe('1');
  });

  it('clears a flag', () => {
    writeFlag('homebase:install-row-dismissed', '2026-01-01T00:00:00.000Z');
    clearFlag('homebase:install-row-dismissed');
    expect(readFlag('homebase:install-row-dismissed')).toBeNull();
  });

  it('round-trips the id list and does not duplicate', () => {
    expect(readStringList('homebase:alert-rows-dismissed')).toEqual([]);
    addToStringList('homebase:alert-rows-dismissed', 'a');
    addToStringList('homebase:alert-rows-dismissed', 'b');
    addToStringList('homebase:alert-rows-dismissed', 'a');
    expect(readStringList('homebase:alert-rows-dismissed')).toEqual(['a', 'b']);
  });

  it('treats corrupt or wrong-shaped list data as empty', () => {
    writeFlag('homebase:alert-rows-dismissed', '{nope');
    expect(readStringList('homebase:alert-rows-dismissed')).toEqual([]);
    writeFlag('homebase:alert-rows-dismissed', '{"a":1}');
    expect(readStringList('homebase:alert-rows-dismissed')).toEqual([]);
    writeStringList('homebase:alert-rows-dismissed', ['x']);
    writeFlag('homebase:alert-rows-dismissed', JSON.stringify(['x', 3, null]));
    expect(readStringList('homebase:alert-rows-dismissed')).toEqual(['x']);
  });
});

describe('deviceFlags when localStorage throws', () => {
  beforeEach(() => vi.stubGlobal('localStorage', throwing()));

  it('never throws and reports nothing stored', () => {
    expect(readFlag('homebase:starter-dismissed')).toBeNull();
    expect(writeFlag('homebase:starter-dismissed', '1')).toBe(false);
    expect(() => clearFlag('homebase:starter-dismissed')).not.toThrow();
    expect(readStringList('homebase:alert-rows-dismissed')).toEqual([]);
    expect(writeStringList('homebase:alert-rows-dismissed', ['a'])).toBe(false);
    expect(addToStringList('homebase:alert-rows-dismissed', 'a')).toEqual(['a']);
  });
});

describe('deviceFlags when localStorage is missing', () => {
  it('behaves as if nothing is stored', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(readFlag('homebase:backup-row-dismissed')).toBeNull();
    expect(writeFlag('homebase:backup-row-dismissed', 'x')).toBe(false);
    expect(readStringList('homebase:alert-rows-dismissed')).toEqual([]);
  });
});

describe('clearHomeFlags', () => {
  it('removes every Home flag and leaves other keys alone', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    writeFlag('homebase:starter-dismissed', '1');
    writeFlag('homebase:install-row-dismissed', '2026-01-01T00:00:00Z');
    writeFlag('homebase:backup-row-dismissed', '2026-01-01T00:00:00Z');
    writeStringList('homebase:alert-rows-dismissed', ['a']);
    localStorage.setItem('homebase:theme', 'dark');
    clearHomeFlags();
    expect(readFlag('homebase:starter-dismissed')).toBeNull();
    expect(readFlag('homebase:install-row-dismissed')).toBeNull();
    expect(readFlag('homebase:backup-row-dismissed')).toBeNull();
    expect(readStringList('homebase:alert-rows-dismissed')).toEqual([]);
    expect(localStorage.getItem('homebase:theme')).toBe('dark');
  });

  it('does not throw when storage is unavailable', () => {
    vi.stubGlobal('localStorage', throwing());
    expect(() => clearHomeFlags()).not.toThrow();
  });
});
