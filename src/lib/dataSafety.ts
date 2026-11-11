import type { HomeData } from '../data/store';
import { DAY_MS } from './dates';

/**
 * The rules behind data safety: where the browser may clear Homebase's data, when a backup is
 * worth asking for, and what counts as a saved backup. Everything here is pure; the browser's
 * capabilities are passed in so each rule can be tested without a browser.
 */

export interface DeviceEnv {
  ua: string;
  platform: string;
  maxTouchPoints: number;
  standalone: boolean;
}

/** Reads the real environment. Only the browser entry points call this. */
export function readDeviceEnv(): DeviceEnv {
  return {
    ua: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone: isStandalone(),
  };
}

export function isStandalone(): boolean {
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches) || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

const NOT_SAFARI = /Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\/|OPR\/|Firefox|Android/;

/** iPhone, iPod, iPad, or an iPad that says it is a Mac. */
function isIPad(env: DeviceEnv): boolean {
  return /iPad/.test(env.ua) || (env.platform === 'MacIntel' && env.maxTouchPoints > 1);
}
export function isIOS(env: DeviceEnv): boolean {
  return /iPhone|iPod/.test(env.ua) || isIPad(env);
}
function isDesktopSafari(env: DeviceEnv): boolean {
  return !isIOS(env) && /Safari\//.test(env.ua) && !NOT_SAFARI.test(env.ua);
}

/** WebKit's seven-day rule applies: any iOS or iPadOS browser, and desktop Safari. */
export function hasSevenDayRule(env: DeviceEnv): boolean {
  return isIOS(env) || isDesktopSafari(env);
}

/** In a tab (not installed) where the browser may clear the data after a week unused. */
export function installMatters(env: DeviceEnv): boolean {
  return !env.standalone && hasSevenDayRule(env);
}

/** The installed app can open with its own empty storage on these (iPhone test 1 is unverified). */
export function mayOpenEmptyWhenInstalled(env: DeviceEnv): boolean {
  return env.standalone && hasSevenDayRule(env);
}

export type DeviceLabel = 'iPhone' | 'iPad' | 'Mac' | 'this device';

export function deviceLabel(env: DeviceEnv): DeviceLabel {
  if (isIPad(env)) return 'iPad';
  if (isIOS(env)) return 'iPhone';
  if (isDesktopSafari(env)) return 'Mac';
  return 'this device';
}

/** A blob download on iOS in the installed app often opens a preview with no save, so the date is not written. */
export function recordsOnDownload(env: DeviceEnv): boolean {
  return !(isIOS(env) && env.standalone);
}

// ---------- what is worth losing ----------

/** Rows the user made. */
export function entryCount(data: HomeData): number {
  return data.tasks.length + data.items.length + data.records.length + data.serviceEvents.length + data.systems.length;
}

export function hasFile(data: HomeData): boolean {
  return data.records.some((r) => r.fileIds.length > 0) || data.items.some((i) => i.photos.length > 0);
}

/** A single test entry is not worth a nudge; three entries or any file is. */
export function worthLosing(data: HomeData): boolean {
  return entryCount(data) >= 3 || hasFile(data);
}

export type BackupNudge = { kind: 'first' } | { kind: 'stale'; lastBackupAt: string };

export const BACKUP_STALE_DAYS = 30;

/**
 * Whether to ask for a backup. Never because of a clock alone: a stale backup only counts when
 * something changed after it. A hidden row stays hidden until a backup is saved after hiding it.
 */
export function backupNudge(data: HomeData, now: number, dismissedAt?: string): BackupNudge | null {
  const last = data.settings.lastBackupAt;
  if (dismissedAt && (!last || dismissedAt > last)) return null;
  if (!last) return worthLosing(data) ? { kind: 'first' } : null;
  const old = now - new Date(last).getTime() >= BACKUP_STALE_DAYS * DAY_MS;
  const changed = data.activity.some((a) => a.at > last);
  return old && changed ? { kind: 'stale', lastBackupAt: last } : null;
}

/** At most one data-safety row shows: the install row first (in a tab), then the backup row. */
export function dataSafetyRow(state: { installMatters: boolean; installDismissed: boolean; nudge: BackupNudge | null }): 'install' | 'backup' | null {
  if (state.installMatters && !state.installDismissed) return 'install';
  return state.nudge ? 'backup' : null;
}

// ---------- storage ----------

export type StorageStatus = 'protected' | 'tab-at-risk' | 'best-effort' | 'unknown';

export function storageStatus(state: { persisted: boolean | 'unsupported'; installMatters: boolean }): StorageStatus {
  if (state.persisted === 'unsupported') return 'unknown';
  if (state.persisted) return 'protected';
  return state.installMatters ? 'tab-at-risk' : 'best-effort';
}

/** Where a Safari tab's data is safe from the 7-day rule: the Dock on a Mac, the Home Screen elsewhere. */
function installPlace(label: DeviceLabel): string {
  return label === 'Mac' ? 'Dock' : 'Home Screen';
}

export function storageCopy(status: StorageStatus, label: DeviceLabel): string {
  switch (status) {
    case 'protected':
      return 'Protected by this browser. It won’t be cleared to free up space.';
    case 'tab-at-risk':
      return `Safari can clear it after a week without a visit. Add Homebase to your ${installPlace(label)} so the 7-day rule doesn’t apply.`;
    case 'best-effort':
      return 'Kept on this device. The browser may clear it if space runs low.';
    case 'unknown':
      return 'Kept on this device. This browser doesn’t say whether it will keep it.';
  }
}

/** The words of Home's install row, for the device it is on. */
export function installRowCopy(label: DeviceLabel): { title: string; detail: string } {
  return { title: `Add to ${installPlace(label)}`, detail: 'Safari can clear data in a tab' };
}

// ---------- saving a backup ----------

export type ShareOutcome = 'cancelled' | 'needs-tap' | 'fallback';

/** What a failed navigator.share() means: the user closed it, the tap ran out, or try a download. */
export function shareOutcome(error: unknown): ShareOutcome {
  const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
  if (name === 'AbortError') return 'cancelled';
  if (name === 'NotAllowedError') return 'needs-tap';
  return 'fallback';
}

/** The browser's means of getting a file out, passed in so the decision can be tested. */
export interface DeliverCaps {
  canShareFile: (file: File) => boolean;
  share: (file: File) => Promise<void>;
  download: (file: File) => void;
}

export type Delivery = 'shared' | 'downloaded' | 'cancelled' | 'needs-tap';

/**
 * Hands a backup file to the share sheet where it can, else downloads it. A cancelled share is
 * 'cancelled' and nothing is downloaded behind the user's back.
 */
export async function deliverBackup(file: File, caps: DeliverCaps): Promise<Delivery> {
  if (caps.canShareFile(file)) {
    try {
      await caps.share(file);
      return 'shared';
    } catch (error) {
      const outcome = shareOutcome(error);
      if (outcome === 'cancelled') return 'cancelled';
      if (outcome === 'needs-tap') return 'needs-tap';
    }
  }
  caps.download(file);
  return 'downloaded';
}

/** Whether "Last backup" should be written for this delivery. A cancelled share never counts. */
export function recordsBackup(delivery: Delivery, env: DeviceEnv): boolean {
  if (delivery === 'shared') return true;
  if (delivery === 'downloaded') return recordsOnDownload(env);
  return false;
}
