import type { SupabaseClient } from '@supabase/supabase-js';

/** The account's pointer to its current backup. The document itself lives in Storage. */
export interface RemoteHeadRow {
  revision: number;
  objectPath: string;
  backupVersion: number;
  sizeBytes: number;
  deviceId: string;
  deviceLabel: string;
  updatedAt: string;
}

export interface CommitArgs {
  /** The revision this device last saw; 0 for the first save. */
  expected: number;
  newPath: string;
  backupVersion: number;
  sizeBytes: number;
  deviceId: string;
  deviceLabel: string;
}

/** Everything the sync engine needs from the account. Tests use a fake; the app uses Supabase. */
export interface CloudRemote {
  head(): Promise<RemoteHeadRow | null>;
  download(path: string): Promise<string>;
  upload(path: string, text: string): Promise<void>;
  /** The new revision, or null when someone else committed first. */
  commit(args: CommitArgs): Promise<number | null>;
  remove(paths: string[]): Promise<void>;
  /**
   * Best-effort cleanup of leftovers: removes every stored backup whose revision number is at or below
   * `revision`, except `keepPath`. Safe against another device's upload in progress, because that one
   * is named for a revision above the committed one.
   */
  prune?(keepPath: string, revision: number): Promise<void>;
  /** Removes every stored backup, then the account itself. */
  deleteAccount(): Promise<void>;
  /** Whether a calendar link has been made for this account. */
  hasCalendarFeed(): Promise<boolean>;
  /** Makes a new calendar secret (or replaces the old one, which stops working at once). Returned once. */
  resetCalendarToken(): Promise<string>;
  /** Stores the calendar text the link serves. */
  putCalendarFeed(ics: string): Promise<void>;
}

const BUCKET = 'backups';

/** The account points at a file that Storage no longer has. Not a network problem. */
export class RemoteObjectMissing extends Error {
  constructor(path: string) {
    super(`The cloud file ${path} is missing.`);
    this.name = 'RemoteObjectMissing';
  }
}

/** Storage reports a missing object as a 400 or 404 whose message says "not found". */
function isMissingObject(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { status?: unknown; statusCode?: unknown; message?: unknown };
  const code = String(e.statusCode ?? e.status ?? '');
  const message = typeof e.message === 'string' ? e.message : '';
  return code === '404' || /not.?found/i.test(message);
}

/** The revision a backup file name starts with (`<n>-<random>.json`), or null. */
export function revisionOfPath(path: string): number | null {
  const match = /(?:^|\/)(\d+)-[^/]*\.json$/.exec(path);
  return match ? Number(match[1]) : null;
}

interface HeadDbRow {
  revision: number | string;
  object_path: string;
  backup_version: number;
  size_bytes: number | string;
  device_id: string;
  device_label: string;
  updated_at: string;
}

export class SupabaseRemote implements CloudRemote {
  constructor(
    protected client: SupabaseClient,
    protected userId: string,
  ) {}

  async head(): Promise<RemoteHeadRow | null> {
    const { data, error } = await this.client.from('home_sync').select('*').eq('user_id', this.userId).maybeSingle<HeadDbRow>();
    if (error) throw error;
    if (!data) return null;
    return {
      revision: Number(data.revision),
      objectPath: data.object_path,
      backupVersion: data.backup_version,
      sizeBytes: Number(data.size_bytes),
      deviceId: data.device_id,
      deviceLabel: data.device_label,
      updatedAt: data.updated_at,
    };
  }

  async download(path: string): Promise<string> {
    const { data, error } = await this.client.storage.from(BUCKET).download(path);
    if (error) throw isMissingObject(error) ? new RemoteObjectMissing(path) : error;
    return data.text();
  }

  async upload(path: string, text: string): Promise<void> {
    const { error } = await this.client.storage.from(BUCKET).upload(path, new Blob([text], { type: 'application/json' }), {
      contentType: 'application/json',
      upsert: false,
    });
    if (error) throw error;
  }

  async commit(args: CommitArgs): Promise<number | null> {
    const { data, error } = await this.client.rpc('commit_backup', {
      expected: args.expected,
      new_path: args.newPath,
      new_version: args.backupVersion,
      new_size: args.sizeBytes,
      dev_id: args.deviceId,
      dev_label: args.deviceLabel,
    });
    if (error) throw error;
    return data === null || data === undefined ? null : Number(data);
  }

  async remove(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const { error } = await this.client.storage.from(BUCKET).remove(paths);
    if (error) throw error;
  }

  async prune(keepPath: string, revision: number): Promise<void> {
    const { data, error } = await this.client.storage.from(BUCKET).list(this.userId, { limit: 100 });
    if (error) throw error;
    const stale = (data ?? [])
      .map((entry) => `${this.userId}/${entry.name}`)
      .filter((path) => path !== keepPath && (revisionOfPath(path) ?? Infinity) <= revision);
    await this.remove(stale);
  }

  async hasCalendarFeed(): Promise<boolean> {
    const { data, error } = await this.client.from('calendar_feeds').select('user_id').eq('user_id', this.userId).maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  async resetCalendarToken(): Promise<string> {
    const { data, error } = await this.client.rpc('reset_calendar_token');
    if (error) throw error;
    if (typeof data !== 'string' || !data) throw new Error('No calendar secret returned.');
    return data;
  }

  async putCalendarFeed(ics: string): Promise<void> {
    const { error } = await this.client.from('calendar_feeds').update({ ics, updated_at: new Date().toISOString() }).eq('user_id', this.userId);
    if (error) throw error;
  }

  async deleteAccount(): Promise<void> {
    // Storage first: the database function removes the account, and the objects would be orphaned after it.
    const storage = this.client.storage.from(BUCKET);
    for (;;) {
      const { data, error } = await storage.list(this.userId, { limit: 100 });
      if (error) throw error;
      if (!data || data.length === 0) break;
      await this.remove(data.map((entry) => `${this.userId}/${entry.name}`));
    }
    const { error } = await this.client.rpc('delete_my_account');
    if (error) throw error;
  }
}
