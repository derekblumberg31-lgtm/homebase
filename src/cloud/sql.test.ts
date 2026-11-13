import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const files = ['001_sync.sql', '002_calendar_feed.sql'].map((name) => [name, readFileSync(new URL(`../../supabase/sql/${name}`, import.meta.url), 'utf8')] as const);

describe('the setup SQL can be run again', () => {
  for (const [name, sql] of files) {
    it(`${name} has no statement that fails the second time`, () => {
      expect(sql).not.toMatch(/create table (?!if not exists)/i);
      expect(sql).not.toMatch(/create function/i);
      for (const [, policy, table] of sql.matchAll(/^create policy ("[^"]+")\s+on ([\w.]+)/gim)) {
        expect(sql, `${policy} on ${table}`).toContain(`drop policy if exists ${policy} on ${table};`);
      }
    });
  }
});
