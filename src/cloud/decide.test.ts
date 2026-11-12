import { describe, expect, it } from 'vitest';
import { decide, isDirty, REPLACING_ACTIONS, type DecideInput, type RemoteHead } from './decide';

const remote = (revision: number): RemoteHead => ({ revision, deviceLabel: 'iPhone', updatedAt: '2026-11-10T09:12:00.000Z' });
const base = (revision: number, hash = 'H') => ({ revision, hash });

describe('decide: the rules table', () => {
  it('no cloud copy, empty device: nothing to do', () => {
    expect(decide({ remote: null, base: null, localHash: 'x', localEmpty: true })).toEqual({ kind: 'idle' });
  });
  it('no cloud copy, device has data: first push from revision 0', () => {
    expect(decide({ remote: null, base: null, localHash: 'x', localEmpty: false })).toEqual({ kind: 'push', expected: 0 });
  });
  it('cloud copy, first link, empty device: ask before bringing it', () => {
    expect(decide({ remote: remote(2), base: null, localHash: 'x', localEmpty: true })).toEqual({ kind: 'pull-confirm' });
  });
  it('cloud copy, first link, device has data: a conflict', () => {
    expect(decide({ remote: remote(2), base: null, localHash: 'x', localEmpty: false })).toEqual({ kind: 'conflict', reason: 'first-link' });
  });
  it('same revision, clean: in sync', () => {
    expect(decide({ remote: remote(3), base: base(3), localHash: 'H', localEmpty: false })).toEqual({ kind: 'in-sync' });
  });
  it('same revision, dirty: push, expecting the revision it last saw', () => {
    expect(decide({ remote: remote(3), base: base(3), localHash: 'changed', localEmpty: false })).toEqual({ kind: 'push', expected: 3 });
  });
  it('newer cloud copy, clean: pull', () => {
    expect(decide({ remote: remote(4), base: base(3), localHash: 'H', localEmpty: false })).toEqual({ kind: 'pull' });
  });
  it('newer cloud copy, dirty: a conflict, sync paused', () => {
    expect(decide({ remote: remote(4), base: base(3), localHash: 'changed', localEmpty: false })).toEqual({ kind: 'conflict', reason: 'diverged' });
  });
  it('cloud copy older than the last sync: reset', () => {
    expect(decide({ remote: remote(2), base: base(3), localHash: 'H', localEmpty: false })).toEqual({ kind: 'cloud-reset' });
    expect(decide({ remote: remote(2), base: base(3), localHash: 'changed', localEmpty: false })).toEqual({ kind: 'cloud-reset' });
  });
  it('cloud copy gone while this device had synced: reset', () => {
    expect(decide({ remote: null, base: base(3), localHash: 'H', localEmpty: false })).toEqual({ kind: 'cloud-reset' });
    expect(decide({ remote: null, base: base(3), localHash: 'changed', localEmpty: true })).toEqual({ kind: 'cloud-reset' });
  });
});

describe('decide: never replaces local data that has unsynced changes', () => {
  const remotes = [null, remote(1), remote(2), remote(3), remote(4), remote(9)];
  const bases = [null, base(1), base(3), base(4)];
  const hashes = ['H', 'changed', ''];
  const empties = [true, false];

  it('never returns a replacing action when local is dirty (every combination)', () => {
    let checked = 0;
    for (const r of remotes)
      for (const b of bases)
        for (const localHash of hashes)
          for (const localEmpty of empties) {
            const input: DecideInput = { remote: r, base: b, localHash, localEmpty };
            if (!isDirty(input)) continue;
            checked += 1;
            expect(REPLACING_ACTIONS, JSON.stringify(input)).not.toContain(decide(input).kind);
          }
    expect(checked).toBeGreaterThan(20);
  });

  it('a pull only ever happens when this device matches a revision already in the account', () => {
    for (const r of remotes)
      for (const b of bases)
        for (const localHash of hashes)
          for (const localEmpty of empties) {
            const action = decide({ remote: r, base: b, localHash, localEmpty });
            if (action.kind === 'pull') {
              expect(b).not.toBeNull();
              expect(localHash).toBe(b!.hash);
            }
            if (action.kind === 'pull-confirm') {
              expect(b).toBeNull();
              expect(localEmpty).toBe(true);
            }
          }
  });
});
