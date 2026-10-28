/* ocr.js — reads stamped text on the key head with Tesseract.js, at 4 rotations. */
const OCR = (() => {
  let worker = null, loading = null, progressCb = null, dead = null;
  const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + ' timed out')), ms))]);

  async function init(onProgress) {
    if (onProgress) progressCb = onProgress;
    if (dead) throw dead;
    if (worker) return worker;
    if (!loading) {
      loading = (async () => {
        if (!window.Tesseract) throw new Error('Tesseract.js did not load (offline?)');
        // Everything loads from the bundled vendor/ folder: the worker, the OCR engine (Tesseract
        // picks the SIMD or plain build for the device) and the English model.
        const base = new URL((window.__ENGINE_BASE__ || '/engine/') + 'vendor/', location.href).href;
        const w = await Tesseract.createWorker('eng', 1, {
          workerPath: base + 'worker.min.js',
          corePath: base,
          langPath: base,
          workerBlobURL: false,
          logger: m => progressCb && progressCb(m),
        });
        await w.setParameters({
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
          tessedit_pageseg_mode: '11', // sparse text: stamps are short scattered words
        });
        worker = w;
        return w;
      })();
      // The model download can be blocked by a sandbox (silently). Give up after 25 s and
      // don't retry on every scan.
      loading = withTimeout(loading, 25000, 'Text reader load').catch(e => { dead = e; loading = null; throw e; });
    }
    return loading;
  }

  // Upscale small crops, rotate, and stretch contrast.
  function prep(src, rot) {
    const s = Math.max(1, Math.min(4, 260 / Math.min(src.width, src.height)));
    const w = Math.round(src.width * s), h = Math.round(src.height * s);
    const c = document.createElement('canvas');
    const swap = rot % 180 !== 0;
    c.width = swap ? h : w; c.height = swap ? w : h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(rot * Math.PI / 180);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, -w / 2, -h / 2, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) hist[d[i]]++;
    const total = d.length / 4;
    let lo = 0, hi = 255, acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.02) { lo = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.02) { hi = v; break; } }
    const span = Math.max(1, hi - lo);
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.max(0, Math.min(255, (d[i] - lo) * 255 / span));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  // Reads the binarized head crop and (optionally) a grey variant at 4 rotations, most likely
  // orientations first. Stops early once `stopWhen(results)` is satisfied.
  async function read(headCanvas, onProgress, { alt = null, stopWhen = null } = {}) {
    const w = await init(onProgress);
    const passes = [[headCanvas, 'bin', 0], [headCanvas, 'bin', 180]];
    if (alt) passes.push([alt, 'grey', 0], [alt, 'grey', 180]);
    passes.push([headCanvas, 'bin', 90], [headCanvas, 'bin', 270]); // text stamped across the head
    const results = [];
    for (const [src, variant, rot] of passes) {
      const c = prep(src, rot);
      const { data } = await withTimeout(w.recognize(c), 20000, 'Text reading');
      const words = (data.words || [])
        .map(x => ({ text: (x.text || '').toUpperCase().replace(/[^A-Z0-9-]/g, ''), conf: Math.round(x.confidence) }))
        .filter(x => x.text.length >= 2);
      results.push({ rot, variant, text: (data.text || '').replace(/\s+/g, ' ').trim(), conf: Math.round(data.confidence || 0), words, canvas: c });
      if (stopWhen && stopWhen(results)) break;
    }
    return { results };
  }

  return { init, read };
})();
