import { describe, expect, it } from 'vitest';
import type { HomeRecord } from '../data/types';
import { reminderBody } from './reminders';

const NOW = new Date('2026-10-27T19:00:00').getTime();
const record = (expiresAt: string): HomeRecord => ({
  id: 'r1',
  kind: 'warranty',
  title: 'Water heater warranty',
  expiresAt,
  fileIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('reminderBody', () => {
  it('uses the same 60-day warranty window as the app', () => {
    expect(reminderBody([], [record('2026-12-11')], NOW)).toBe('1 warranty or document expires soon.');
    expect(reminderBody([], [record('2026-12-27')], NOW)).toBeNull();
  });

  it('says nothing when nothing is due', () => {
    expect(reminderBody([], [], NOW)).toBeNull();
  });
});
