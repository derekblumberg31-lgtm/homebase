import { describe, expect, it } from 'vitest';
import { pushToast, removeToast } from './toastQueue';

const plain = (id: number) => ({ id });
const act = (id: number) => ({ id, action: { label: 'Undo' } });

describe('toast queue', () => {
  it('pushes onto an empty list', () => {
    expect(pushToast([], plain(1))).toEqual([plain(1)]);
  });
  it('keeps an action toast when a plain one follows', () => {
    expect(pushToast([act(1)], plain(2))).toEqual([act(1), plain(2)]);
  });
  it('drops the oldest plain toast over the cap', () => {
    expect(pushToast([act(1), plain(2), act(3)], act(4)).map((t) => t.id)).toEqual([1, 3, 4]);
  });
  it('drops the oldest when every toast has an action', () => {
    expect(pushToast([act(1), act(2), act(3)], act(4)).map((t) => t.id)).toEqual([2, 3, 4]);
  });
  it('removes by id', () => {
    expect(removeToast([plain(1), plain(2)], 1)).toEqual([plain(2)]);
  });
});
