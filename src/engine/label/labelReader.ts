import { addEngineScript, fileToCanvas } from '../keys/engine';
import { parseLabel, type LabelFields } from './parseLabel';

/**
 * Reads brand, model and serial from a photo of an equipment label. It loads only Tesseract
 * (about 7 MB the first time, then served from the engine cache) and runs its own worker, so the
 * key reader and its locked-down settings are never touched. No OpenCV.
 */

interface RecognizeResult {
  data: { text?: string };
}
interface LabelWorker {
  setParameters: (params: Record<string, string>) => Promise<unknown>;
  recognize: (image: HTMLCanvasElement) => Promise<RecognizeResult>;
  terminate: () => Promise<unknown>;
}
interface TesseractGlobal {
  createWorker: (lang: string, oem: number, options: Record<string, unknown>) => Promise<LabelWorker>;
}

export const LOAD_FAILED = 'The text reader didn’t download. Check your connection, then try again.';
const LOAD_TIMEOUT = 25000;
const PASS_TIMEOUT = 20000;

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const engineBase = () => new URL(window.__ENGINE_BASE__ ?? `${import.meta.env.BASE_URL}engine/`, location.href).href;

/** True when the text reader's language file is already in the engine cache, so a scan works offline. */
export async function labelReaderCached(): Promise<boolean> {
  try {
    if (typeof caches === 'undefined') return false;
    return Boolean(await caches.match(`${engineBase()}vendor/eng.traineddata.gz`));
  } catch {
    return false;
  }
}

/** Loads Tesseract on its own and starts a worker for label text (no character whitelist). */
export async function loadLabelReader(): Promise<LabelWorker> {
  // Set once the timeout (or any failure) has given up, so a worker that finishes starting later is shut down instead of left running.
  let abandoned = false;
  let worker: LabelWorker | undefined;
  const discard = () => void worker?.terminate().catch(() => undefined);
  const start = async () => {
    try {
      await addEngineScript('vendor/tesseract.min.js');
    } catch {
      throw new Error(LOAD_FAILED);
    }
    const tesseract = (window as unknown as { Tesseract?: TesseractGlobal }).Tesseract;
    if (!tesseract) throw new Error(LOAD_FAILED);
    const base = `${engineBase()}vendor/`;
    worker = await tesseract.createWorker('eng', 1, {
      workerPath: `${base}worker.min.js`,
      corePath: base,
      langPath: base,
      workerBlobURL: false,
    });
    if (abandoned) {
      discard();
      throw new Error(LOAD_FAILED);
    }
    await worker.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' });
    return worker;
  };
  try {
    return await withTimeout(start(), LOAD_TIMEOUT, 'Text reader load');
  } catch {
    abandoned = true;
    discard();
    throw new Error(LOAD_FAILED);
  }
}

/** Greyscale, with the darkest and lightest 2% stretched to black and white, optionally turned by 90 or 270 degrees. */
function prepare(src: HTMLCanvasElement, rotation: 0 | 90 | 270): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const turned = rotation !== 0;
  canvas.width = turned ? src.height : src.width;
  canvas.height = turned ? src.width : src.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  const grey = new Uint8ClampedArray(d.length / 4);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const v = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    grey[p] = v;
    hist[v]++;
  }
  const cut = grey.length * 0.02;
  let lo = 0;
  let hi = 255;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc > cut) {
      lo = v;
      break;
    }
  }
  acc = 0;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc > cut) {
      hi = v;
      break;
    }
  }
  const span = Math.max(1, hi - lo);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const v = Math.max(0, Math.min(255, ((grey[p] - lo) * 255) / span));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export interface LabelReading {
  text: string;
  fields: LabelFields;
}

/** Reads one photo: up to three passes (upright, then turned each way) until a model or serial is found. */
export async function readLabel(file: File, onProgress?: (status: 'loading' | 'reading') => void): Promise<LabelReading> {
  onProgress?.('loading');
  const worker = await loadLabelReader();
  try {
    onProgress?.('reading');
    const source = await fileToCanvas(file);
    let text = '';
    let fields: LabelFields = {};
    for (const rotation of [0, 90, 270] as const) {
      const { data } = await withTimeout(worker.recognize(prepare(source, rotation)), PASS_TIMEOUT, 'Text reading');
      text = data.text ?? '';
      fields = parseLabel(text);
      if (fields.model || fields.serial) break;
    }
    return { text, fields };
  } finally {
    void worker.terminate().catch(() => undefined);
  }
}
