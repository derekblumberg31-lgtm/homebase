import type { Item, KeyCapture, KeyIdSource } from '../../data/types';
import { uid } from '../../data/ids';

/**
 * A typed facade over KeyFinder's key engine (OpenCV outline finding, cut-profile matching,
 * Tesseract stamp reading, keyway identification). The engine itself is kept unchanged in
 * public/engine/ and loaded on demand, so its ~20 MB stays off Homebase's first load.
 */

export interface Candidate {
  pts: number[];
  bbox: [number, number, number, number];
}

export interface Overlay {
  outline: [number, number][];
  head: [number, number][];
  blade: [number, number][];
}

export interface Profile {
  ok: boolean;
  needsPick?: boolean;
  candidates?: Candidate[];
  canSelect?: boolean;
  error?: string;
  warnings?: string[];
  needsBetter?: boolean;
  silhouette: string;
  sig: number[];
  top: number[];
  bot: number[];
  ratio: number;
  headShape: string;
  headFeat: unknown;
  headCanvas: HTMLCanvasElement;
  headGrayCanvas?: HTMLCanvasElement;
  overlay?: Overlay;
  flippedOver?: boolean;
  metrics?: { rotated180?: boolean; perspective?: boolean };
  debug?: Record<string, HTMLCanvasElement | undefined>;
}

export interface KeywayEntry {
  brand: string;
  keyway: string;
  type: string;
  blank?: string;
  alt?: string;
  notes?: string;
  restricted?: boolean;
  verify?: boolean;
  transponderLikely?: boolean;
}

export interface Identification {
  primary: KeywayEntry | null;
  alternatives: KeywayEntry[];
  suggestions?: KeywayEntry[];
  source: KeyIdSource;
  why?: string[];
  tokens: string[];
  flags: { dnd: boolean; transponder: boolean; restricted?: boolean };
  text: { bestText?: string; codes: { token: string }[]; brands: { token: string }[] };
}

/** The key shape the engine expects (KeyFinder's record). */
export interface EngineKey {
  id: string;
  label: string;
  notes?: string;
  brand?: string;
  keyway?: string;
  type?: string;
  blank?: string;
  flags?: { dnd?: boolean; transponder?: boolean };
  idSource?: KeyIdSource;
  ocrTokens?: string[];
  captures: KeyCapture[];
}

export interface MatchResult {
  key: EngineKey;
  score: number;
  capture: KeyCapture & { isTemplate?: boolean };
  cutDiff: number;
  cutAt: number | null;
  photos: number;
  parts?: { stretch?: number; shift?: number };
}

interface EngineGlobals {
  Vision: { ready: boolean; init: () => Promise<void>; process: (photo: HTMLCanvasElement, sel?: unknown) => Profile };
  Matcher: {
    best: (capture: KeyCapture, keys: EngineKey[]) => { best: MatchResult | null; runnerUp: MatchResult | null };
    compare: (a: KeyCapture, b: KeyCapture) => { score: number };
    template: (key: EngineKey) => (KeyCapture & { isTemplate?: boolean }) | null;
    warp: (series: number[], align: { s: number; off: number }) => number[];
  };
  Identify: {
    load: () => Promise<unknown>;
    find: (keyway: string) => KeywayEntry | null;
    entryFor: (key: Partial<EngineKey>) => KeywayEntry | null;
    entryName: (entry: KeywayEntry) => string;
    suggest: (input: { ocr: unknown; headShape: string; ratio: number; keys: EngineKey[] }) => Identification;
    readText: (ocr: unknown) => { codes: unknown[]; brands: unknown[] };
    table: KeywayEntry[];
  };
  OCR: {
    init: (onProgress?: (m: { status?: string; progress?: number }) => void) => Promise<unknown>;
    read: (canvas: HTMLCanvasElement, onProgress: (m: { status?: string; progress?: number }) => void, options: { alt?: HTMLCanvasElement; stopWhen?: (results: unknown) => boolean }) => Promise<unknown>;
  };
  SOURCE_LABEL: Record<KeyIdSource, string>;
  SOURCE_RANK: Record<KeyIdSource, number>;
  MATCH_THRESHOLD: number;
  POSSIBLE_THRESHOLD: number;
  CLOSE_CALL_CUT: number;
}

declare global {
  interface Window {
    __ENGINE_BASE__?: string;
    __KeyEngine?: EngineGlobals;
  }
}

/** Where the engine files live; the classic scripts read it from window.__ENGINE_BASE__ too. */
const ENGINE_BASE = `${import.meta.env.BASE_URL}engine/`;
window.__ENGINE_BASE__ = ENGINE_BASE;

const SCRIPTS = ['engine-config.js', 'vendor/tesseract.min.js', 'identify.js', 'vision.js', 'match.js', 'ocr.js', 'engine-export.js'];

function addScript(src: string, async = false): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-engine="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = `${ENGINE_BASE}${src}`;
    script.async = async;
    script.dataset.engine = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('The key tools didn’t download. Check your connection, then try again.'));
    document.head.appendChild(script);
  });
}

let loading: Promise<EngineGlobals> | null = null;

/** Loads the engine once. OpenCV downloads in parallel and is awaited by Vision.init(). */
export function loadEngine(): Promise<EngineGlobals> {
  if (window.__KeyEngine) return Promise.resolve(window.__KeyEngine);
  if (!loading) {
    loading = (async () => {
      void addScript('vendor/opencv.js', true);
      for (const src of SCRIPTS) await addScript(src);
      const engine = window.__KeyEngine;
      if (!engine) throw new Error('The key tools didn’t start. Reload and try again.');
      await engine.Identify.load();
      return engine;
    })().catch((error) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}

// ---------- conversions between Homebase items and engine keys ----------

export function toEngineKey(item: Item): EngineKey {
  const key = item.key;
  return {
    id: item.id,
    label: item.name,
    notes: item.notes,
    brand: item.brand,
    keyway: key?.keyway,
    type: key?.type,
    blank: key?.blank,
    flags: key?.flags,
    idSource: key?.idSource,
    ocrTokens: key?.ocrTokens ?? [],
    captures: key?.captures ?? [],
  };
}

const r3 = (a: number[]) => a.map((v) => Math.round(v * 1000) / 1000);

export function scaledCanvas(src: CanvasImageSource & { width: number; height: number }, max: number, sw = src.width, sh = src.height): HTMLCanvasElement {
  const s = Math.min(1, max / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * s));
  canvas.height = Math.max(1, Math.round(sh * s));
  canvas.getContext('2d')!.drawImage(src, 0, 0, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export const WORK_MAX = 1600;
export const PHOTO_MAX = 640;
export const TARGET_CAPTURES = 3;
export const KEY_TYPES = ['house', 'padlock', 'mailbox', 'car', 'high security', 'other'];

export function makeCapture(photo: HTMLCanvasElement, prof: Profile, ident: Identification): KeyCapture {
  return {
    id: uid(),
    at: new Date().toISOString(),
    photo: scaledCanvas(photo, PHOTO_MAX).toDataURL('image/jpeg', 0.75),
    silhouette: prof.silhouette,
    sig: r3(prof.sig),
    top: r3(prof.top),
    bot: r3(prof.bot),
    ratio: Math.round(prof.ratio * 1000) / 1000,
    headShape: prof.headShape,
    headFeat: prof.headFeat,
    ocrText: ident.text.bestText || '',
    ocrTokens: ident.tokens,
  };
}

/** Apply a better automatic identification to a key the homeowner hasn't confirmed. */
export function mergeIdent(item: Item, ident: Identification, rank: Record<KeyIdSource, number>): { item: Item; upgraded: boolean } {
  const key = item.key!;
  let next = { ...item, key: { ...key, flags: { ...key.flags } } };
  let upgraded = false;
  if (key.idSource !== 'user' && ident.primary && (rank[ident.source] ?? 0) > (rank[key.idSource] ?? 0)) {
    next = {
      ...next,
      brand: ident.primary.brand || undefined,
      key: { ...next.key, keyway: ident.primary.keyway || undefined, type: ident.primary.type || undefined, blank: ident.primary.blank || undefined, idSource: ident.source },
    };
    upgraded = true;
  }
  next.key.flags.dnd = Boolean(next.key.flags.dnd || ident.flags.dnd);
  next.key.flags.transponder = Boolean(next.key.flags.transponder || ident.flags.transponder);
  next.key.ocrTokens = [...new Set([...(next.key.ocrTokens ?? []), ...ident.tokens])];
  return { item: next, upgraded };
}

export async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return scaledCanvas(img, WORK_MAX, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}
