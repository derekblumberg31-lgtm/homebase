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
  /** Removes every stored backup, then the account itself. */
  deleteAccount(): Promise<void>;
}

const BUCKET = 'backups';

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
    if (error) throw error;
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
