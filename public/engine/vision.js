/* vision.js — extracts a key's silhouette, head shape and cut signature with OpenCV.js.
 *
 * Canonical frame after processing: head on the LEFT, blade pointing RIGHT, principal axis
 * horizontal. A key placed the other way round is rotated 180° (never mirrored), so a key that
 * was flipped face-down shows up as a vertical mirror, which the matcher tests separately.
 */
const SIG_N = 256;          // samples in a cut signature
const LOW_CONTRAST = 28;    // warn below this
const MIN_CONTRAST = 14;    // minimum colour difference at the key's outline (Lab units, 0–255 scale)
const MIN_BLADE_PX = 28;    // reject: blade too few pixels tall to measure cuts
const GOOD_BLADE_PX = 60;   // warn below this: move closer for better precision
const MIN_EDGE_CUT = 0.06;  // deepest edge cut (fraction of blade height) needed to call it edge-cut
const PERSPECTIVE_MIN = 0.08; // blade taper above this switches on full perspective correction
const MAX_TILT_WARN = 0.12; // warn above this: blade taper from camera tilt (fraction of blade height)
const MAX_TILT_BAD = 0.30;  // suggest a retake above this
const MAX_EDGE_ROUGH = 0.035; // warn above this: wobble of the blade's straight back edge (fraction of blade height)
const MAX_EDGE_WIDTH = 4.5; // warn above this: edge transition width in px (blur / focus)
const MAX_GLARE = 0.04;     // warn above this: fraction of key pixels blown out
const MAX_EDGE_GLARE = 0.01; // reject above this: blown-out area that has eaten into the outline

const Vision = (() => {
  const api = { ready: false };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  api.init = async () => {
    const t0 = Date.now();
    let hooked = false;
    while (!(window.cv && window.cv.Mat)) {
      // Some opencv.js builds expose a thenable Module until the WASM runtime is ready.
      if (window.cv && typeof window.cv.then === 'function' && !hooked) {
        hooked = true;
        window.cv.then(m => { if (m && m.Mat) { try { delete m.then; } catch (_) {} window.cv = m; } });
      }
      if (Date.now() - t0 > 90000) throw new Error('OpenCV.js did not load. Check your internet connection and reload.');
      await sleep(150);
    }
    api.ready = true;
  };

  // ---------- small numeric helpers ----------
  function percentile(arr, p) {
    const a = Array.from(arr).filter(Number.isFinite).sort((x, y) => x - y);
    if (!a.length) return 0;
    return a[clamp(Math.round(p * (a.length - 1)), 0, a.length - 1)];
  }
  function mean(a, i0, i1) {
    let s = 0, n = 0;
    for (let i = Math.max(0, i0); i < Math.min(a.length, i1); i++) { s += a[i]; n++; }
    return n ? s / n : 0;
  }
  function smooth(a) {
    const k = [1, 2, 1], out = new Array(a.length);
    for (let i = 0; i < a.length; i++) {
      let s = 0, w = 0;
      for (let j = -1; j <= 1; j++) {
        const x = i + j;
        if (x >= 0 && x < a.length) { s += a[x] * k[j + 1]; w += k[j + 1]; }
      }
      out[i] = s / w;
    }
    return out;
  }
  function lerp(a, x) {
    const i = Math.floor(x), f = x - i;
    return i + 1 < a.length ? a[i] * (1 - f) + a[i + 1] * f : a[a.length - 1];
  }
  function linfit(a, i0, i1) {
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = i0; i < i1; i++) { n++; sx += i; sy += a[i]; sxx += i * i; sxy += i * a[i]; }
    const d = n * sxx - sx * sx;
    const slope = d ? (n * sxy - sx * sy) / d : 0;
    const icpt = n ? (sy - slope * sx) / n : 0;
    let r = 0;
    for (let i = i0; i < i1; i++) r += (a[i] - (icpt + slope * i)) ** 2;
    return { slope, resid: Math.sqrt(r / Math.max(1, n)) };
  }
  function borderMean(m) {
    const d = m.data, w = m.cols, h = m.rows;
    let s = 0, n = 0;
    for (let x = 0; x < w; x++) { s += d[x] + d[(h - 1) * w + x]; n += 2; }
    for (let y = 0; y < h; y++) { s += d[y * w] + d[y * w + w - 1]; n += 2; }
    return s / n;
  }
  function toCanvas(mat) {
    const c = document.createElement('canvas');
    cv.imshow(c, mat);
    return c;
  }

  // Rotate the filled silhouette + grey image by `ang` degrees about the centroid and measure
  // per-column top/bottom edges of the silhouette.
  function scanAt(fill, gray, cx, cy, D, ang) {
    const M = cv.getRotationMatrix2D(new cv.Point(cx, cy), ang, 1);
    M.data64F[2] += D / 2 - cx;
    M.data64F[5] += D / 2 - cy;
    const rmask = new cv.Mat(), rgray = new cv.Mat(), size = new cv.Size(D, D);
    cv.warpAffine(fill, rmask, M, size, cv.INTER_NEAREST, cv.BORDER_CONSTANT, new cv.Scalar(0));
    cv.warpAffine(gray, rgray, M, size, cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
    const Mv = Array.from(M.data64F); // original → rotated: [a b tx; c d ty]
    M.delete();

    const d = rmask.data;
    const topA = new Int32Array(D).fill(-1), botA = new Int32Array(D).fill(-1);
    for (let y = 0; y < D; y++) {
      const row = y * D;
      for (let x = 0; x < D; x++) if (d[row + x] > 127) { if (topA[x] < 0) topA[x] = y; botA[x] = y; }
    }
    let xs = D, xe = -1, ys = D, ye = -1;
    for (let x = 0; x < D; x++) if (topA[x] >= 0) {
      if (x < xs) xs = x; if (x > xe) xe = x;
      if (topA[x] < ys) ys = topA[x]; if (botA[x] > ye) ye = botA[x];
    }
    const L = Math.max(0, xe - xs + 1), H = Math.max(0, ye - ys + 1);
    const top = new Float32Array(L), bot = new Float32Array(L), h = new Float32Array(L);
    let lastT = 0, lastB = 0;
    for (let i = 0; i < L; i++) {
      const x = xs + i;
      if (topA[x] >= 0) { lastT = top[i] = topA[x] - ys; lastB = bot[i] = botA[x] - ys; h[i] = botA[x] - topA[x] + 1; }
      else { top[i] = lastT; bot[i] = lastB; h[i] = 0; }
    }
    return { ang, rmask, rgray, xs, ys, L, H, top, bot, h, Mv };
  }
  const freeScan = s => { s.rmask.delete(); s.rgray.delete(); };

  // Decide head vs blade, find the shoulder and the straight back edge.
  function analyze(s) {
    const { L, H } = s;
    let { top, bot, h } = s;
    // Head is the taller end. If it is on the right, rotate 180° (keeps handedness). When the ends
    // are similar in height (steep angle with the head far away), the end with the jagged cut
    // edge is the blade.
    const wl = mean(h, 0, Math.ceil(L * 0.25)), wr = mean(h, Math.floor(L * 0.75), L);
    let flip = wr > wl;
    if (Math.max(wl, wr) / Math.max(1, Math.min(wl, wr)) < 1.3) {
      const rough = (i0, i1) => { let r = 0; for (let i = Math.max(1, i0); i < Math.min(L - 1, i1); i++) r += Math.abs(top[i + 1] - 2 * top[i] + top[i - 1]) + Math.abs(bot[i + 1] - 2 * bot[i] + bot[i - 1]); return r; };
      flip = rough(0, Math.floor(L * 0.45)) > rough(Math.ceil(L * 0.55), L);
    }
    if (flip) {
      const t2 = new Float32Array(L), b2 = new Float32Array(L), h2 = new Float32Array(L);
      for (let i = 0; i < L; i++) {
        const j = L - 1 - i;
        t2[i] = H - 1 - bot[j]; b2[i] = H - 1 - top[j]; h2[i] = h[j];
      }
      top = t2; bot = b2; h = h2;
    }
    // Full (uncut) blade height. Real keys are cut so heavily that most columns are shorter, so take
    // the high end; a low percentile mistakes the uncut stretch by the shoulder for the shoulder.
    // Shoulder: walk from mid-blade toward the head until the outline gets clearly taller than the
    // blade (the shoulder stop is ~1.26× blade height on house keys). The first height estimate
    // comes from mid-blade, which on real keys is mostly cuts, so it reads low; the walk passes the
    // uncut stretch by the shoulder and stops at the stop/head. Blade height is then re-measured over
    // the whole blade, which includes those uncut stretches.
    const hb0 = Math.max(1, percentile(h.slice(Math.floor(L * 0.56), Math.floor(L * 0.9)), 0.97));
    const env = ridgeLine(h, Math.floor(L * 0.56), Math.floor(L * 0.9), false);
    let i = Math.round(L * 0.56);
    while (i > 0 && h[i - 1] <= hb0 * 1.22) i--;
    let shoulder = i > 0 ? i - 1 : Math.round(L * 0.3);
    const bladeMax = Math.max(1, percentile(h.slice(shoulder + 1, Math.floor(L * 0.93)), 0.98));
    const bladeStart = Math.min(L - 10, shoulder + Math.max(2, Math.round(L * 0.012)));
    const bladeLen = L - bladeStart;
    const fitEnd = bladeStart + Math.floor(bladeLen * 0.85);
    const ft = linfit(top, bladeStart, fitEnd), fb = linfit(bot, bladeStart, fitEnd);
    const back = ft.resid < fb.resid ? 'top' : 'bottom';
    const slope = back === 'top' ? ft.slope : fb.slope;
    const hTrend = x => env.m * x + env.c;
    return { flip, top, bot, h, L, H, bladeMax, shoulder, bladeStart, bladeLen, back, slope, hTrend };
  }

  function headFeatures(a) {
    const { top, bot, h, shoulder, L, bladeMax } = a;
    let ht = Infinity, hb = -Infinity, area = 0;
    for (let i = 0; i <= shoulder; i++) if (h[i] > 0) { ht = Math.min(ht, top[i]); hb = Math.max(hb, bot[i]); area += h[i]; }
    if (!Number.isFinite(ht)) { ht = 0; hb = a.H - 1; }
    const hw = shoulder + 1, hh = Math.max(1, hb - ht + 1);
    const f = {
      aspect: +(hw / hh).toFixed(3),          // head width / height
      extent: +(area / (hw * hh)).toFixed(3), // fill of bounding box: 1 = rectangle, .785 = ellipse
      headRel: +(hw / L).toFixed(3),          // head length / whole key length
      headHRel: +(hh / bladeMax).toFixed(3),  // head height / blade height
    };
    let shape;
    if (f.headHRel > 3.2 && f.extent > 0.75 && f.aspect < 1.4) shape = 'plastic';
    else if (f.extent > 0.86) shape = 'square';
    else if (f.extent > 0.7) shape = (f.aspect > 0.8 && f.aspect < 1.25) ? 'round' : 'oval';
    else shape = 'bow';
    return { shape, f, headTop: ht, headBot: hb };
  }

  // Straight line y = m·x + c through the "uncut" extremes of an edge (the ridge the cuts are
  // measured from), fitted per window with one pass of outlier rejection.
  function ridgeLine(edge, i0, i1, wantMin) {
    const win = Math.max(6, Math.ceil((i1 - i0) / 10)), pts = [];
    for (let s0 = i0; s0 + win <= i1; s0 += win) {
      const seg = Array.from(edge.slice(s0, s0 + win));
      pts.push([s0 + win / 2, percentile(seg, wantMin ? 0.08 : 0.92)]);
    }
    const fit = P => {
      const n = P.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const [x, y] of P) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
      const d = n * sxx - sx * sx, m = d ? (n * sxy - sx * sy) / d : 0;
      return { m, c: (sy - m * sx) / n };
    };
    let f = fit(pts);
    const res = pts.map(([x, y]) => Math.abs(y - (f.m * x + f.c))), rms = Math.sqrt(res.reduce((p, q) => p + q * q, 0) / res.length);
    const keep = pts.filter((_, i) => res[i] <= Math.max(1.5, 2 * rms));
    if (keep.length >= 4 && keep.length < pts.length) f = fit(keep);
    return f;
  }

  // Supporting line of an edge: the straight line touching its outermost points (the uncut ridge),
  // with every other point on the inside. Real keys have overlapping cuts, so only short bits of
  // ridge survive between them; a fitted average would sink into the cuts. Uses the convex hull of
  // (x, edge[x]) and picks the hull segment spanning the most of the blade. Falls back to ridgeLine
  // for a straight (uncut) edge, where hull segments are all short.
  function supportLine(edge, i0, i1, wantMin) {
    const P = [];
    for (let x = i0; x < i1; x++) P.push([x, wantMin ? edge[x] : -edge[x]]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const hull = [];
    // lower hull in image coordinates = the boundary on the small-y (outer) side
    for (const p of P) { while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) hull.pop(); hull.push(p); }
    let best = null, span = 0;
    for (let k = 1; k < hull.length; k++) { const sp = hull[k][0] - hull[k - 1][0]; if (sp > span) { span = sp; best = [hull[k - 1], hull[k]]; } }
    if (!best || span < (i1 - i0) * 0.4) return ridgeLine(edge, i0, i1, wantMin);
    const m = (best[1][1] - best[0][1]) / (best[1][0] - best[0][0]), c = best[0][1] - m * best[0][0];
    return wantMin ? { m, c } : { m: -m, c: -c };
  }

  // Cut-depth signature of the blade. Depths are measured down from the uncut ridge and divided by
  // the blade height.
  //  - Normal photos: the ridge is taken parallel to the straight back edge at the blade's full
  //    height. That is steadier than fitting the ridge itself, since real keys have overlapping
  //    cuts and little ridge survives. Small stretch is absorbed when cut patterns are aligned.
  //  - Steep camera angle (the blade visibly tapers): perspective correction. The ridge is the
  //    supporting line over the cut peaks, depths are divided by the local blade height, and samples
  //    are spaced by true position along the blade (∫dx/H², the projective mapping).
  function signature(a) {
    const { top, bot, h, bladeStart, L } = a;
    const iEnd = bladeStart + Math.floor((L - bladeStart) * 0.85);
    const iFit = bladeStart + Math.floor((L - bladeStart) * 0.05); // clear of the shoulder stop's corner
    const rb = supportLine(bot, iFit, iEnd, false), rtFree = supportLine(top, iFit, iEnd, true);
    const yB = x => rb.m * x + rb.c;
    const hFree = x => yB(x) - (rtFree.m * x + rtFree.c);
    const keystone = hFree(iEnd) / Math.max(1, hFree(iFit)); // 1 = parallel edges
    // Second, independent taper estimate from the trend of the blade's column heights. Correct for
    // perspective only when both agree, so cut peaks can't fake a taper on a flat photo.
    const k2 = a.hTrend(iEnd) / Math.max(1, a.hTrend(iFit));
    const perspective = Math.abs(1 - keystone) > PERSPECTIVE_MIN && Math.abs(1 - k2) > PERSPECTIVE_MIN * 0.6 && (keystone - 1) * (k2 - 1) > 0;
    let yT, Hx;
    if (perspective) {
      yT = x => rtFree.m * x + rtFree.c;
      Hx = x => Math.max(4, yB(x) - yT(x));
    } else {
      const span = [];
      for (let x = iFit; x < iEnd; x++) span.push(yB(x) - top[x]);
      const H = Math.max(4, percentile(span, 0.97));
      yT = x => yB(x) - H; Hx = () => H;
    }
    // sample positions: uniform, or projective when correcting perspective
    const n = L - bladeStart, xs = new Float64Array(SIG_N);
    if (perspective) {
      const cum = new Float64Array(n);
      for (let i = 1; i < n; i++) { const hh = Hx(bladeStart + i); cum[i] = cum[i - 1] + 1 / (hh * hh); }
      let j = 0;
      for (let k = 0; k < SIG_N; k++) {
        const t = cum[n - 1] * k / (SIG_N - 1);
        while (j < n - 2 && cum[j + 1] < t) j++;
        const f = cum[j + 1] > cum[j] ? (t - cum[j]) / (cum[j + 1] - cum[j]) : 0;
        xs[k] = bladeStart + j + clamp(f, 0, 1);
      }
    } else for (let k = 0; k < SIG_N; k++) xs[k] = bladeStart + k * (n - 1) / (SIG_N - 1);
    const sig = [], tp = [], bt = [];
    for (const x of xs) {
      const H = Hx(x);
      sig.push(clamp(1 - lerp(h, x) / H, 0, 1.5));          // material removed, both edges
      tp.push(clamp((lerp(top, x) - yT(x)) / H, 0, 1.5));   // top edge depth
      bt.push(clamp((yB(x) - lerp(bot, x)) / H, 0, 1.5));   // bottom edge depth
    }
    const rt = { m: (yT(iEnd) - yT(bladeStart)) / Math.max(1, iEnd - bladeStart), c: 0 };
    rt.c = yT(bladeStart) - rt.m * bladeStart;
    return { sig: smooth(sig), top: smooth(tp), bot: smooth(bt), rt, rb, keystone, perspective, x0: bladeStart, x1: L - 1 };
  }

  // ---------- finding the key in a photo (any background) ----------
  const AUTO_MIN_SCORE = 0.55;     // best candidate must be at least this key-like to be used without asking
  const AUTO_MARGIN = 0.12;        // ...and beat the runner-up by this much,
  const AUTO_AREA_DOMINANCE = 2.2; // ...or be this many times larger than it (the "main" key)
  const SHOW_MIN_SCORE = 0.3;      // candidates below this aren't offered to the user
  const CAND_MIN_AREA = 0.006, CAND_MAX_AREA = 0.6; // fraction of the photo

  // Distance of every pixel from the background colour (median of the photo's border), as an
  // 8-bit "separation" image. Works on any plain-ish surface, not just white paper.
  function separation(src, T) {
    const rgb = T(new cv.Mat()); cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
    const lab = T(new cv.Mat()); cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);
    const W = lab.cols, H = lab.rows, d = lab.data;
    const band = Math.max(3, Math.round(Math.min(W, H) * 0.04));
    const ch = [[], [], []];
    const push = (x, y) => { const i = (y * W + x) * 3; ch[0].push(d[i]); ch[1].push(d[i + 1]); ch[2].push(d[i + 2]); };
    for (let y = 0; y < H; y += 2) {
      if (y < band || y >= H - band) for (let x = 0; x < W; x += 2) push(x, y);
      else { for (let x = 0; x < band; x += 2) push(x, y); for (let x = W - band; x < W; x += 2) push(x, y); }
    }
    const bg = ch.map(a => percentile(a, 0.5));
    const sep = T(new cv.Mat(H, W, cv.CV_8UC1)), sd = sep.data;
    for (let i = 0, j = 0; i < sd.length; i++, j += 3) {
      const dl = d[j] - bg[0], da = d[j + 1] - bg[1], db = d[j + 2] - bg[2];
      sd[i] = Math.min(255, Math.sqrt(dl * dl + da * da + db * db));
    }
    return { rgb, lab, sep, bg };
  }

  // Shape statistics and a 0–1 "looks like a key" score for one outline (points in photo coords).
  function describe(pts, W, H, source, precise) {
    const n = pts.length / 2;
    let sx = 0, sy = 0;
    for (let i = 0; i < pts.length; i += 2) { sx += pts[i]; sy += pts[i + 1]; }
    const cx = sx / n, cy = sy / n;
    let sxx = 0, syy = 0, sxy = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, onEdge = 0, area = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i], y = pts[i + 1], dx = x - cx, dy = y - cy;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x <= 2 || y <= 2 || x >= W - 3 || y >= H - 3) onEdge++;
      const j = (i + 2) % pts.length;
      area += x * pts[j + 1] - pts[j] * y;
    }
    area = Math.abs(area) / 2;
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ca = Math.cos(th), sa = Math.sin(th);
    const NB = 48;
    let umin = 1e9, umax = -1e9, vmin = 1e9, vmax = -1e9;
    const U = new Float32Array(n), V = new Float32Array(n);
    for (let i = 0, k = 0; i < pts.length; i += 2, k++) {
      const dx = pts[i] - cx, dy = pts[i + 1] - cy;
      const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
      U[k] = u; V[k] = v;
      if (u < umin) umin = u; if (u > umax) umax = u; if (v < vmin) vmin = v; if (v > vmax) vmax = v;
    }
    const L = umax - umin, S = Math.max(1, vmax - vmin);
    const lo = new Float32Array(NB).fill(1e9), hi = new Float32Array(NB).fill(-1e9);
    for (let k = 0; k < n; k++) {
      const b = Math.min(NB - 1, Math.floor((U[k] - umin) / Math.max(1e-6, L) * NB));
      if (V[k] < lo[b]) lo[b] = V[k]; if (V[k] > hi[b]) hi[b] = V[k];
    }
    let w = Array.from({ length: NB }, (_, b) => (hi[b] > lo[b] ? hi[b] - lo[b] : 0));
    for (let b = 1; b < NB; b++) if (!w[b]) w[b] = w[b - 1];
    for (let b = NB - 2; b >= 0; b--) if (!w[b]) w[b] = w[b + 1];
    const avg = (a, i, j) => a.slice(i, j).reduce((p, q) => p + q, 0) / Math.max(1, j - i);
    if (avg(w, 0, 12) < avg(w, NB - 12, NB)) w = w.reverse(); // head (wider end) first
    const bladeRef = Math.max(1, percentile(w.slice(22, 41), 0.5));
    const headMax = Math.max(...w.slice(0, 21));
    const headRatio = headMax / bladeRef;
    const bladeFrac = w.filter(v => v <= bladeRef * 1.3).length / NB;
    // Convex hull (monotone chain on a subsample) for solidity.
    const step = Math.max(1, Math.floor(n / 500)), P = [];
    for (let i = 0; i < n; i += step) P.push([pts[2 * i], pts[2 * i + 1]]);
    P.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const p of P) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    for (const p of P.slice().reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
    let ha = 0;
    for (let i = 0; i < hull.length; i++) { const a = hull[i], b = hull[(i + 1) % hull.length]; ha += a[0] * b[1] - b[0] * a[1]; }
    const solidity = Math.min(1, area / Math.max(1, Math.abs(ha) / 2));
    const areaFrac = area / (W * H), elong = L / S, touches = onEdge / n > 0.012;

    const sElong = clamp((elong - 1.3) / 0.7, 0, 1); // real keys are ~2.2–2.6 long; less when tilted
    const sStruct = clamp((headRatio - 1.15) / 0.5, 0, 1) * clamp((bladeFrac - 0.28) / 0.14, 0, 1);
    const sSolid = clamp((solidity - 0.6) / 0.2, 0, 1);
    const sSize = areaFrac < 0.02 ? clamp((areaFrac - 0.006) / 0.014, 0, 1) : areaFrac > 0.35 ? clamp(1 - (areaFrac - 0.35) / 0.25, 0, 1) : 1;
    const centre = 1 - Math.min(1, Math.hypot(cx / W - 0.5, cy / H - 0.5) / 0.7) * 0.3;
    const tooLong = elong > 6 ? clamp(1 - (elong - 6) / 3.5, 0.1, 1) : 1; // wood-grain strips, pens, cables
    const score = tooLong * (0.3 * sElong + 0.35 * sStruct + 0.15 * sSolid + 0.2 * sSize) * (touches ? 0.35 : 1) * (0.85 + 0.15 * centre);
    return {
      pts, source, precise, score, area, areaFrac, elong, headRatio, bladeFrac, solidity, touches,
      bbox: [x0, y0, x1 - x0 + 1, y1 - y0 + 1], cx, cy,
    };
  }

  function candidatesFromMask(mask, back, W, H, source, precise, out) {
    const cs = new cv.MatVector(), hi = new cv.Mat();
    cv.findContours(mask, cs, hi, cv.RETR_EXTERNAL, precise ? cv.CHAIN_APPROX_NONE : cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < cs.size(); i++) {
      const c = cs.get(i);
      const frac = cv.contourArea(c) * back * back / (W * H);
      if (frac >= CAND_MIN_AREA && frac <= CAND_MAX_AREA && c.data32S.length >= 24) {
        const pts = new Int32Array(c.data32S.length);
        for (let k = 0; k < pts.length; k++) pts[k] = Math.round(c.data32S[k] * back);
        out.push(describe(pts, W, H, source, precise));
      }
      c.delete();
    }
    cs.delete(); hi.delete();
  }

  const bboxIoU = (a, b) => {
    const x0 = Math.max(a[0], b[0]), y0 = Math.max(a[1], b[1]);
    const x1 = Math.min(a[0] + a[2], b[0] + b[2]), y1 = Math.min(a[1] + a[3], b[1] + b[3]);
    const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
    return inter / (a[2] * a[3] + b[2] * b[3] - inter);
  };

  // Several independent ways to cut objects out of the photo; every outline is scored for how
  // key-like it is. Strategies: (A) brightness (with lighting flattened on light surfaces),
  // (B) colour distance from the surroundings, (C) colour clusters at low resolution.
  function findCandidates(src, gray, sepInfo, T) {
    const W = src.cols, H = src.rows, cands = [];
    const k3 = T(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3)));
    const k5 = T(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5)));
    const clean = m => { cv.morphologyEx(m, m, cv.MORPH_OPEN, k3); cv.morphologyEx(m, m, cv.MORPH_CLOSE, k5); };

    // A: brightness
    const flat = T(new cv.Mat());
    if (borderMean(gray) > 110) {
      const small = T(new cv.Mat());
      cv.resize(gray, small, new cv.Size(0, 0), 0.25, 0.25, cv.INTER_AREA);
      const ks = Math.max(15, Math.round(Math.min(small.cols, small.rows) * 0.45) | 1);
      const kBig = T(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(ks, ks)));
      cv.morphologyEx(small, small, cv.MORPH_CLOSE, kBig);
      cv.GaussianBlur(small, small, new cv.Size(9, 9), 0);
      const bg = T(new cv.Mat());
      cv.resize(small, bg, new cv.Size(W, H), 0, 0, cv.INTER_LINEAR);
      cv.divide(gray, bg, flat, 235);
    } else gray.copyTo(flat);
    const blurA = T(new cv.Mat()); cv.GaussianBlur(flat, blurA, new cv.Size(5, 5), 0);
    const mA = T(new cv.Mat());
    cv.threshold(blurA, mA, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
    if (borderMean(mA) > 127) cv.bitwise_not(mA, mA);
    clean(mA);
    candidatesFromMask(mA, 1, W, H, 'brightness', true, cands);

    // B: colour distance
    const blurB = T(new cv.Mat()); cv.GaussianBlur(sepInfo.sep, blurB, new cv.Size(5, 5), 0);
    const mB = T(new cv.Mat());
    cv.threshold(blurB, mB, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    clean(mB);
    candidatesFromMask(mB, 1, W, H, 'colour', true, cands);

    // C: colour clusters (coarse; refined later with GrabCut)
    try {
      const sc = Math.min(1, 320 / Math.max(W, H)), sw = Math.round(W * sc), sh = Math.round(H * sc);
      const labS = T(new cv.Mat()); cv.resize(sepInfo.lab, labS, new cv.Size(sw, sh), 0, 0, cv.INTER_AREA);
      const N = sw * sh, samples = T(new cv.Mat(N, 3, cv.CV_32F));
      for (let i = 0; i < N * 3; i++) samples.data32F[i] = labS.data[i];
      const labels = T(new cv.Mat()), centers = T(new cv.Mat());
      cv.kmeans(samples, 3, labels, new cv.TermCriteria(cv.TermCriteria_EPS + cv.TermCriteria_MAX_ITER, 12, 1.0), 4, cv.KMEANS_PP_CENTERS, centers);
      const border = [0, 0, 0], bandPx = Math.max(2, Math.round(Math.min(sw, sh) * 0.04));
      let nb = 0;
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++)
        if (x < bandPx || y < bandPx || x >= sw - bandPx || y >= sh - bandPx) { border[labels.data32S[y * sw + x]]++; nb++; }
      for (let k = 0; k < 3; k++) {
        if (border[k] / nb > 0.35) continue; // that cluster is the surroundings
        const mk = T(new cv.Mat(sh, sw, cv.CV_8UC1));
        for (let i = 0; i < N; i++) mk.data[i] = labels.data32S[i] === k ? 255 : 0;
        clean(mk);
        candidatesFromMask(mk, 1 / sc, W, H, 'clusters', false, cands);
      }
    } catch (e) { console.warn('cluster strategy failed', e); }

    // Dedupe (same object found by several strategies): keep the highest-scoring outline,
    // preferring precise ones when scores are close.
    cands.sort((a, b) => (b.score + (b.precise ? 0.04 : 0)) - (a.score + (a.precise ? 0.04 : 0)));
    const kept = [];
    const mostlyInside = (a, b) => { // is a's box mostly inside b's box (a fragment of the same object)?
      const x0 = Math.max(a[0], b[0]), y0 = Math.max(a[1], b[1]), x1 = Math.min(a[0] + a[2], b[0] + b[2]), y1 = Math.min(a[1] + a[3], b[1] + b[3]);
      return Math.max(0, x1 - x0) * Math.max(0, y1 - y0) / (a[2] * a[3]) > 0.75;
    };
    for (const c of cands) if (!kept.some(k => bboxIoU(k.bbox, c.bbox) > 0.5 || mostlyInside(c.bbox, k.bbox))) kept.push(c);
    const ranked = kept.filter(c => c.score >= SHOW_MIN_SCORE).slice(0, 4);

    let best = null, auto = false, reason = '';
    if (!ranked.length) reason = "I couldn't find a key in this photo.";
    else {
      best = ranked[0];
      const next = ranked[1];
      const dominant = next && best.area >= next.area * AUTO_AREA_DOMINANCE;
      if (best.score < AUTO_MIN_SCORE) reason = "I'm not sure which part of the photo is the key.";
      else if (next && next.score > AUTO_MIN_SCORE - 0.1 && best.score - next.score < AUTO_MARGIN && !dominant) reason = 'I found more than one key-like shape.';
      else auto = true;
    }
    return { candidates: ranked, best, auto, reason, all: kept.slice(0, 8) };
  }

  // GrabCut cut-out, seeded either from a drawn box or from a rough mask. Runs on a crop at
  // reduced size, then scales the result back to the photo.
  function grabCutRegion(rgb, roi, init, T) {
    const crop = T(rgb.roi(roi).clone());
    const sc = Math.min(1, 560 / Math.max(roi.width, roi.height));
    const w = Math.max(8, Math.round(roi.width * sc)), h = Math.max(8, Math.round(roi.height * sc));
    const img = T(new cv.Mat()); cv.resize(crop, img, new cv.Size(w, h), 0, 0, cv.INTER_AREA);
    const m = T(new cv.Mat()), bgd = T(new cv.Mat()), fgd = T(new cv.Mat());
    if (init.box) {
      const r = new cv.Rect(Math.round(init.box.x * sc), Math.round(init.box.y * sc), Math.max(4, Math.round(init.box.w * sc)), Math.max(4, Math.round(init.box.h * sc)));
      cv.grabCut(img, m, r, bgd, fgd, 5, cv.GC_INIT_WITH_RECT);
    } else {
      const coarse = T(new cv.Mat()); cv.resize(init.mask, coarse, new cv.Size(w, h), 0, 0, cv.INTER_NEAREST);
      const ker = (r) => T(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(2 * r + 1, 2 * r + 1)));
      const r1 = Math.max(2, Math.round(Math.min(w, h) * 0.03));
      const grown = T(new cv.Mat()), shrunk = T(new cv.Mat());
      cv.dilate(coarse, grown, ker(r1)); cv.erode(coarse, shrunk, ker(r1));
      m.create(h, w, cv.CV_8UC1); m.setTo(new cv.Scalar(cv.GC_BGD));
      for (let i = 0; i < m.data.length; i++) m.data[i] = shrunk.data[i] ? cv.GC_FGD : coarse.data[i] ? cv.GC_PR_FGD : grown.data[i] ? cv.GC_PR_BGD : cv.GC_BGD;
      cv.grabCut(img, m, new cv.Rect(0, 0, w, h), bgd, fgd, 4, cv.GC_INIT_WITH_MASK);
    }
    const fg = T(new cv.Mat(h, w, cv.CV_8UC1));
    for (let i = 0; i < fg.data.length; i++) fg.data[i] = (m.data[i] === cv.GC_FGD || m.data[i] === cv.GC_PR_FGD) ? 255 : 0;
    const up = T(new cv.Mat()); cv.resize(fg, up, new cv.Size(roi.width, roi.height), 0, 0, cv.INTER_LINEAR);
    cv.threshold(up, up, 127, 255, cv.THRESH_BINARY);
    const full = new cv.Mat.zeros(rgb.rows, rgb.cols, cv.CV_8UC1);
    const dst = full.roi(roi); up.copyTo(dst); dst.delete();
    return full;
  }

  // Second GrabCut pass at full resolution, free to move the outline only within a narrow band
  // (±5 px) around the first result. The first pass finds the key; this one restores the cuts.
  function refineBand(rgb, mask, T) {
    const bb = cv.boundingRect(mask);
    const W = rgb.cols, H = rgb.rows, pad = 16;
    const roi = clampRect(bb.x - pad, bb.y - pad, bb.width + 2 * pad, bb.height + 2 * pad, W, H);
    const sc = Math.min(1, 1500 / Math.max(roi.width, roi.height));
    const w = Math.max(8, Math.round(roi.width * sc)), h = Math.max(8, Math.round(roi.height * sc));
    const img = T(new cv.Mat()), m0 = T(new cv.Mat());
    const cropRgb = T(rgb.roi(roi).clone()), cropMask = T(mask.roi(roi).clone());
    cv.resize(cropRgb, img, new cv.Size(w, h), 0, 0, cv.INTER_AREA);
    cv.resize(cropMask, m0, new cv.Size(w, h), 0, 0, cv.INTER_NEAREST);
    const r = Math.max(3, Math.round(5 * sc)), ker = T(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(2 * r + 1, 2 * r + 1)));
    const core = T(new cv.Mat()), wide = T(new cv.Mat());
    cv.erode(m0, core, ker); cv.dilate(m0, wide, ker);
    const m = T(new cv.Mat(h, w, cv.CV_8UC1)), bgd = T(new cv.Mat()), fgd = T(new cv.Mat());
    for (let i = 0; i < m.data.length; i++) m.data[i] = core.data[i] ? cv.GC_FGD : m0.data[i] ? cv.GC_PR_FGD : wide.data[i] ? cv.GC_PR_BGD : cv.GC_BGD;
    cv.grabCut(img, m, new cv.Rect(0, 0, w, h), bgd, fgd, 3, cv.GC_INIT_WITH_MASK);
    const fg = T(new cv.Mat(h, w, cv.CV_8UC1));
    for (let i = 0; i < fg.data.length; i++) fg.data[i] = (m.data[i] === cv.GC_FGD || m.data[i] === cv.GC_PR_FGD) ? 255 : 0;
    const up = T(new cv.Mat());
    if (sc < 1) { cv.resize(fg, up, new cv.Size(roi.width, roi.height), 0, 0, cv.INTER_LINEAR); cv.threshold(up, up, 127, 255, cv.THRESH_BINARY); } else fg.copyTo(up);
    const full = cv.Mat.zeros(H, W, cv.CV_8UC1);
    const dst = full.roi(roi); up.copyTo(dst); dst.delete();
    return full;
  }

  // Keep only the largest solid blob of a mask (holes filled).
  function largestBlob(mask, T) {
    const cs = new cv.MatVector(), hi = new cv.Mat();
    cv.findContours(mask, cs, hi, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    let bi = -1, ba = 0;
    for (let i = 0; i < cs.size(); i++) { const c = cs.get(i), a = cv.contourArea(c); c.delete(); if (a > ba) { ba = a; bi = i; } }
    const out = cv.Mat.zeros(mask.rows, mask.cols, cv.CV_8UC1);
    if (bi >= 0) cv.drawContours(out, cs, bi, new cv.Scalar(255), -1);
    cs.delete(); hi.delete();
    return out;
  }

  // Keep only the key's top face. At an angle the camera also sees the key's side wall, and the
  // outline picks up its shadow; both are darker than the face and hug the outline, and they
  // partly fill the cut valleys (so cut depths would change with viewing angle). Remove pixels
  // near the outline that are clearly darker than the face.
  function faceOnly(mask, lab, T) {
    const area = cv.countNonZero(mask);
    if (area < 50) return { mask, removed: 0 };
    const dist = T(new cv.Mat());
    cv.distanceTransform(mask, dist, cv.DIST_L2, 3);
    const dd = dist.data32F, ld = lab.data, md = mask.data;
    const band = Math.max(4, 0.06 * Math.sqrt(area));
    const iL = [], iA = [], iB = [];
    for (let i = 0; i < md.length; i += 3) if (md[i] && dd[i] > band) { iL.push(ld[i * 3]); iA.push(ld[i * 3 + 1]); iB.push(ld[i * 3 + 2]); }
    if (iL.length < 50) return { mask, removed: 0 };
    const faceL = percentile(iL, 0.5), faceA = percentile(iA, 0.5), faceB = percentile(iB, 0.5);
    const faceChroma = Math.hypot(faceA - 128, faceB - 128);
    const out = T(mask.clone()), od = out.data;
    let removed = 0;
    for (let i = 0; i < md.length; i++) {
      if (!md[i] || dd[i] > band) continue;
      const L = ld[i * 3], dc = Math.hypot(ld[i * 3 + 1] - faceA, ld[i * 3 + 2] - faceB);
      // side wall / shadow: clearly darker, or (on a coloured key) a different colour that is also a bit darker
      const darker = L < faceL * 0.88, offColour = faceChroma > 12 && dc > Math.max(10, faceChroma * 0.45) && L < faceL * 0.97;
      if (darker || offColour) { od[i] = 0; removed++; }
    }
    if (removed > area * 0.3) return { mask, removed: 0, faceL }; // dark key or uneven face: leave it
    const k3 = T(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3)));
    cv.morphologyEx(out, out, cv.MORPH_OPEN, k3);
    return { mask: largestBlob(out, T), removed: removed / area, faceL };
  }

  function maskFromPoints(pts, W, H) {
    const m = cv.Mat.zeros(H, W, cv.CV_8UC1);
    const c = cv.matFromArray(pts.length / 2, 1, cv.CV_32SC2, Array.from(pts));
    const v = new cv.MatVector(); v.push_back(c);
    cv.drawContours(m, v, 0, new cv.Scalar(255), -1);
    c.delete(); v.delete();
    return m;
  }

  const clampRect = (x, y, w, h, W, H) => {
    const x0 = clamp(Math.round(x), 0, W - 2), y0 = clamp(Math.round(y), 0, H - 2);
    return new cv.Rect(x0, y0, clamp(Math.round(w), 2, W - x0), clamp(Math.round(h), 2, H - y0));
  };

  api.find = (input) => {
    const trash = []; const T = m => { trash.push(m); return m; };
    try {
      const src = T(cv.imread(input)), gray = T(new cv.Mat()); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      return findCandidates(src, gray, separation(src, T), T);
    } finally { for (const m of trash) { try { m.delete(); } catch (_) {} } }
  };

  // Main entry: input is a canvas/img. `sel` optionally says which object is the key:
  //   { candidate }  one of the outlines returned earlier (tapped by the user)
  //   { box: {x,y,w,h} }  a rectangle drawn around the key, in photo pixels
  // With no `sel` the best candidate is used if it is clearly the key; otherwise the result has
  // needsPick: true and a list of candidates for the user to choose from.
  api.process = (input, sel = null) => {
    const out = { ok: false, debug: {}, metrics: {}, canSelect: true };
    const trash = [];
    const T = m => { trash.push(m); return m; };
    const fail = msg => { out.error = msg; return out; };
    try {
      const src = T(cv.imread(input));
      const gray = T(new cv.Mat()); cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      out.warnings = [];
      const W = gray.cols, Hh = gray.rows, imgArea = W * Hh;
      const sepInfo = separation(src, T);

      // 1. Which object is the key?
      let fill0 = null; // single-channel mask, 255 = key
      if (sel && sel.box) {
        const b = sel.box, padX = b.w * 0.12, padY = b.h * 0.12;
        const roi = clampRect(b.x - padX, b.y - padY, b.w + 2 * padX, b.h + 2 * padY, W, Hh);
        fill0 = T(grabCutRegion(sepInfo.rgb, roi, { box: { x: b.x - roi.x, y: b.y - roi.y, w: b.w, h: b.h } }, T));
        fill0 = T(refineBand(sepInfo.rgb, largestBlob(fill0, T), T));
        out.selection = 'box';
      } else {
        let chosen;
        if (sel && sel.candidate) { chosen = sel.candidate; out.selection = 'picked'; }
        else {
          const f = findCandidates(src, gray, sepInfo, T);
          out.candidates = f.candidates.map(c => ({ pts: c.pts, bbox: c.bbox, score: c.score, source: c.source, precise: c.precise }));
          if (!f.auto) { out.needsPick = true; return fail(f.reason); }
          chosen = f.best; out.selection = 'auto';
        }
        out.source = chosen.source;
        fill0 = T(maskFromPoints(chosen.pts, W, Hh));
        if (!chosen.precise) {
          const bb = chosen.bbox, pad = Math.max(bb[2], bb[3]) * 0.1;
          const roi = clampRect(bb[0] - pad, bb[1] - pad, bb[2] + 2 * pad, bb[3] + 2 * pad, W, Hh);
          const sub = T(fill0.roi(roi).clone());
          fill0 = T(grabCutRegion(sepInfo.rgb, roi, { mask: sub }, T));
          fill0 = T(refineBand(sepInfo.rgb, largestBlob(fill0, T), T));
          out.refined = true;
        }
      }
      // Trim side wall and shadow, then keep one solid blob.
      const face = faceOnly(fill0, sepInfo.lab, T);
      if (face.mask !== fill0) fill0 = T(face.mask);
      out.metrics.trimmedPct = +(100 * face.removed).toFixed(1);
      const contours = T(new cv.MatVector()), hier = T(new cv.Mat());
      cv.findContours(fill0, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);
      let bi = -1, ba = 0;
      for (let i = 0; i < contours.size(); i++) {
        const c = contours.get(i); const a = cv.contourArea(c); c.delete();
        if (a > ba) { ba = a; bi = i; }
      }
      out.metrics.areaPct = +(100 * ba / imgArea).toFixed(2);
      if (bi < 0 || ba < imgArea * 0.004) return fail("I couldn't cut the key out of the photo.");
      const cnt = T(contours.get(bi));
      const fill = T(cv.Mat.zeros(Hh, W, cv.CV_8UC1));
      cv.drawContours(fill, contours, bi, new cv.Scalar(255), -1);
      out.debug.mask = toCanvas(fill);
      const br = cv.boundingRect(cnt);
      const dbg = T(src.clone());
      cv.drawContours(dbg, contours, bi, new cv.Scalar(0, 255, 0, 255), 3);
      out.debug.contour = toCanvas(dbg);

      // Contrast at the key's boundary: colour difference between a thin ring just inside the
      // outline and a thin ring just outside it (local, so textured surfaces are fine).
      const kR = T(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(9, 9)));
      const eroded = T(new cv.Mat()), dilated = T(new cv.Mat()), ringIn = T(new cv.Mat()), ringOut = T(new cv.Mat());
      cv.erode(fill, eroded, kR); cv.dilate(fill, dilated, kR);
      cv.subtract(fill, eroded, ringIn); cv.subtract(dilated, fill, ringOut);
      const ringMean = (ring, mat, ch) => {
        const rd = ring.data, md = mat.data, acc = new Float64Array(ch);
        let n = 0;
        for (let i = 0; i < rd.length; i += 3) if (rd[i]) { for (let c = 0; c < ch; c++) acc[c] += md[i * ch + c]; n++; }
        return Array.from(acc, v => v / Math.max(1, n));
      };
      const mIn = ringMean(ringIn, sepInfo.lab, 3), mOut = ringMean(ringOut, sepInfo.lab, 3);
      const contrast = Math.hypot(mIn[0] - mOut[0], mIn[1] - mOut[1], mIn[2] - mOut[2]);
      const grayJump = Math.abs(ringMean(ringIn, gray, 1)[0] - ringMean(ringOut, gray, 1)[0]);
      out.metrics.contrast = +contrast.toFixed(1);
      if (contrast < LOW_CONTRAST) { out.needsBetter = true; out.warnings.push('The key is close in colour to the surface behind it, so the outline may be off. A surface of a different colour works best.'); }
      if (contrast < MIN_CONTRAST) return fail(`The key blends into the surface (contrast ${contrast.toFixed(0)}). Try a surface of a different colour, or more even light.`);

      if (ba > imgArea * 0.6) return fail('The key fills too much of the photo. Move back a little.');
      if (br.x <= 2 || br.y <= 2 || br.x + br.width >= W - 2 || br.y + br.height >= Hh - 2)
        return fail('The key touches the edge of the photo. Move back so the whole key is in view.');
      const rr = cv.minAreaRect(cnt);
      const elong = Math.max(rr.size.width, rr.size.height) / Math.max(1, Math.min(rr.size.width, rr.size.height));
      out.metrics.elongation = +elong.toFixed(2);
      if (elong < 1.35) return fail("That doesn't look like a single key. It may be touching another object, or a shadow.");

      // 3. Principal axis from moments, then rotate horizontal.
      const m = cv.moments(cnt, false);
      const cx = m.m10 / m.m00, cy = m.m01 / m.m00;
      const theta = 0.5 * Math.atan2(2 * m.mu11, m.mu20 - m.mu02);
      const pts = cnt.data32S;
      let maxR = 0;
      for (let i = 0; i < pts.length; i += 2) maxR = Math.max(maxR, Math.hypot(pts[i] - cx, pts[i + 1] - cy));
      const spread = deg => {
        const r = deg * Math.PI / 180, ca = Math.cos(r), sa = Math.sin(r);
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < pts.length; i += 2) {
          const y = -sa * (pts[i] - cx) + ca * (pts[i + 1] - cy);
          if (y < lo) lo = y; if (y > hi) hi = y;
        }
        return hi - lo;
      };
      const tdeg = theta * 180 / Math.PI;
      let ang = spread(tdeg) <= spread(-tdeg) ? tdeg : -tdeg;

      // Axis line on the contour debug image.
      {
        const ctx = out.debug.contour.getContext('2d');
        const r = -ang * Math.PI / 180;
        ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - Math.cos(r) * maxR, cy - Math.sin(r) * maxR);
        ctx.lineTo(cx + Math.cos(r) * maxR, cy + Math.sin(r) * maxR);
        ctx.stroke();
      }

      const D = 2 * Math.ceil(maxR) + 16;

      // 4. Rotate, then refine the tilt using the blade's straight back edge.
      let s = scanAt(fill, gray, cx, cy, D, ang);
      let a = analyze(s);
      const delta = Math.atan(a.slope) * 180 / Math.PI;
      if (Math.abs(delta) > 0.25) {
        for (const cand of [ang + delta, ang - delta]) {
          const s2 = scanAt(fill, gray, cx, cy, D, cand);
          const a2 = analyze(s2);
          if (Math.abs(a2.slope) < Math.abs(a.slope)) { freeScan(s); s = s2; a = a2; ang = cand; }
          else freeScan(s2);
        }
      }
      trash.push(s.rmask, s.rgray);
      out.metrics.angle = +ang.toFixed(2);
      out.metrics.rotated180 = a.flip;
      out.metrics.backEdge = a.back;

      if (a.bladeLen < a.L * 0.3) return fail("Couldn't separate the head from the blade. Lay the key flat so the whole key is visible.");
      const ratio = a.bladeLen / a.bladeMax;
      out.metrics.ratio = +ratio.toFixed(3);
      if (ratio < 1.5 || ratio > 12) return fail('The blade proportions look wrong. Make sure only the key is in the shot.');
      out.metrics.bladePx = Math.round(a.bladeMax);
      if (a.bladeMax < MIN_BLADE_PX) return fail(`The key is too small in the frame (blade ${Math.round(a.bladeMax)} px tall). Move closer so the key fills more of the photo.`);
      if (a.bladeMax < GOOD_BLADE_PX) out.warnings.push('The key is fairly small in the frame. Move closer for more precise cut measurements.');

      const head = headFeatures(a);
      const sg = signature(a);
      // Always put the cut edge on top. A key lying face-down (or upside down) shows its cuts
      // on the other edge; flipping the edges makes both photos read the same.
      {
        const nb = Math.floor(SIG_N * 0.85);
        const depth = arr => { let s = 0; for (let i = 0; i < nb; i++) s += arr[i]; return s; };
        if (depth(sg.bot) > depth(sg.top) * 1.15) { [sg.top, sg.bot] = [sg.bot, sg.top]; out.flippedOver = true; }
      }

      // Camera angle: parallel blade edges that appear to converge mean the phone was tilted.
      // The signature is corrected for it; a strong tilt is flagged because accuracy drops.
      out.metrics.keystone = +sg.keystone.toFixed(3);
      out.metrics.perspective = !!sg.perspective;
      const taper = sg.perspective ? Math.abs(1 - sg.keystone) : 0; // only when the taper is confirmed
      if (taper > MAX_TILT_WARN) out.warnings.push('The photo was taken at an angle. I corrected for it, but holding the phone directly above the key gives the most reliable result.');
      if (taper > MAX_TILT_BAD) { out.needsBetter = true; }

      // Outline quality: the blade's back edge is straight on a real key, so a wobbly one means
      // the cut-out is rough (busy surface, shadows, or low contrast).
      {
        const fitEnd = a.bladeStart + Math.floor(a.bladeLen * 0.85);
        const fr = linfit(a.back === 'top' ? a.top : a.bot, a.bladeStart, fitEnd).resid / a.bladeMax;
        out.metrics.edgeRough = +fr.toFixed(3);
        if (fr > MAX_EDGE_ROUGH) { out.needsBetter = true; out.warnings.push('The outline is rough, so the cut depths may be off. A plainer surface and even light will help.'); }
      }

      // Edge-cut check: dimple and laser-cut (sidewinder) keys have straight edges.
      const body = Math.floor(SIG_N * 0.85); // ignore the tapered tip
      const maxTop = Math.max(...sg.top.slice(0, body)), maxBot = Math.max(...sg.bot.slice(0, body));
      out.metrics.maxEdgeCut = +Math.max(maxTop, maxBot).toFixed(3);
      if (Math.max(maxTop, maxBot) < MIN_EDGE_CUT)
        return fail("No cuts found on the blade edges. This looks like a dimple or laser-cut (sidewinder) key, or a blank. KeyFinder can only read edge-cut keys. A locksmith can identify this one.");

      // Photo-quality checks: focus (edge transition width) and glare on the key.
      {
        const edgeBand = T(new cv.Mat()), er = T(new cv.Mat()), di = T(new cv.Mat());
        const k7 = T(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7)));
        cv.dilate(fill, di, k7); cv.erode(fill, er, k7);
        cv.subtract(di, er, edgeBand);
        const gx = T(new cv.Mat()), gy = T(new cv.Mat()), mag = T(new cv.Mat());
        cv.Sobel(gray, gx, cv.CV_32F, 1, 0, 3); cv.Sobel(gray, gy, cv.CV_32F, 0, 1, 3);
        cv.magnitude(gx, gy, mag);
        const md = mag.data32F, bd = edgeBand.data, vals = [];
        for (let i = 0; i < bd.length; i += 3) if (bd[i]) vals.push(md[i]);
        const g90 = percentile(vals, 0.9) / 8; // Sobel 3x3 gain ≈ 8 → grey levels per pixel
        const edgeWidth = g90 > 0 ? grayJump / g90 : 99;
        out.metrics.edgeWidthPx = +edgeWidth.toFixed(2);
        // Sharpness can only be judged where the outline has some brightness contrast.
        if (grayJump >= 12 && edgeWidth > MAX_EDGE_WIDTH) out.warnings.push('The photo looks blurry or out of focus. Hold the phone steady and tap to focus on the key.');
        // Glare: blown-out pixels brighter than the paper, anywhere within the key's convex hull.
        // (Glare that touches an edge merges with the paper and eats into the outline, so it
        // must be looked for outside the silhouette too.)
        const hull = T(new cv.Mat()), hv = T(new cv.MatVector()), hullMask = T(cv.Mat.zeros(Hh, W, cv.CV_8UC1));
        cv.convexHull(cnt, hull, false, true);
        hv.push_back(hull);
        cv.drawContours(hullMask, hv, 0, new cv.Scalar(255), -1);
        // Median keeps a saturated patch at 255 (sensor noise there is clipped) but removes pixel noise.
        const gb = T(new cv.Mat()); cv.medianBlur(gray, gb, 7);
        const gd = gb.data, hd = hullMask.data;
        const paper = percentile(Array.from({ length: 400 }, (_, i) => gd[Math.floor(i / 400 * W)]), 0.5);
        // On overexposed paper (≥ 245) glare can't be told apart from the paper, so skip the check.
        const blownAt = Math.max(250, paper + 10);
        // Glare outside the silhouette (but inside the hull) has merged with the paper and eaten
        // into the outline, which corrupts the cut measurements. Glare inside only hurts OCR.
        let blownIn = 0, blownOut = 0;
        const fd = fill.data;
        if (blownAt <= 254)
          for (let i = 0; i < hd.length; i += 2) if (hd[i] && gd[i] >= blownAt) { if (fd[i]) blownIn++; else blownOut++; }
        const glareFrac = 2 * (blownIn + blownOut) / Math.max(1, ba); // sampled every 2nd pixel; relative to key area
        const edgeGlare = 2 * blownOut / Math.max(1, ba);
        out.metrics.glarePct = +(100 * glareFrac).toFixed(1);
        out.metrics.edgeGlarePct = +(100 * edgeGlare).toFixed(1);
        if (edgeGlare > MAX_EDGE_GLARE)
          return fail(`Glare on the edge of the key is hiding part of the outline, so the cuts can't be measured. Move the light or turn the key slightly, then retake.`);
        if (glareFrac > MAX_GLARE) out.warnings.push('Glare on the key. Move the light or turn the key slightly so it isn\'t shiny white in the photo.');
      }

      // 5. Crops in the canonical frame.
      const rect = new cv.Rect(s.xs, s.ys, a.L, a.H);
      const g1 = s.rgray.roi(rect), m1 = s.rmask.roi(rect);
      const keyGray = T(g1.clone()), keyMask = T(m1.clone());
      g1.delete(); m1.delete();
      if (a.flip) { cv.flip(keyGray, keyGray, -1); cv.flip(keyMask, keyMask, -1); }

      // Tone cue: a plastic (car-key) head is usually much darker than the metal blade.
      const medianIn = (x0, x1) => {
        const hs = new Uint32Array(256); let n = 0;
        for (let y = 0; y < keyGray.rows; y++) for (let x = x0; x < x1; x++) {
          const i = y * keyGray.cols + x;
          if (keyMask.data[i] > 127) { hs[keyGray.data[i]]++; n++; }
        }
        let acc = 0;
        for (let v = 0; v < 256; v++) { acc += hs[v]; if (acc >= n / 2) return v; }
        return 128;
      };
      const headTone = medianIn(0, Math.max(1, a.shoulder)), bladeTone = medianIn(a.bladeStart, Math.floor(a.L * 0.9));
      head.f.toneDiff = bladeTone - headTone;
      if (head.f.toneDiff > 45 && head.f.extent > 0.7) head.shape = 'plastic';

      // Rotated debug view with shoulder / blade / reference lines.
      const rgba = T(new cv.Mat()); cv.cvtColor(keyGray, rgba, cv.COLOR_GRAY2RGBA);
      const line = (x1, y1, x2, y2, col) => cv.line(rgba, new cv.Point(x1, y1), new cv.Point(x2, y2), col, 2);
      line(a.shoulder, 0, a.shoulder, a.H - 1, new cv.Scalar(255, 60, 60, 255));
      line(a.bladeStart, 0, a.bladeStart, a.H - 1, new cv.Scalar(255, 170, 0, 255));
      line(sg.x0, Math.round(sg.rt.m * sg.x0 + sg.rt.c), sg.x1, Math.round(sg.rt.m * sg.x1 + sg.rt.c), new cv.Scalar(60, 160, 255, 255));
      line(sg.x0, Math.round(sg.rb.m * sg.x0 + sg.rb.c), sg.x1, Math.round(sg.rb.m * sg.x1 + sg.rb.c), new cv.Scalar(60, 160, 255, 255));
      cv.rectangle(rgba, new cv.Point(0, head.headTop), new cv.Point(a.shoulder, head.headBot), new cv.Scalar(255, 230, 0, 255), 2);
      out.debug.rotated = toCanvas(rgba);

      // Head crop for OCR (contrast-enhanced).
      const hy0 = clamp(Math.floor(head.headTop) - 6, 0, a.H - 1), hy1 = clamp(Math.ceil(head.headBot) + 6, 0, a.H - 1);
      const hRect = new cv.Rect(0, hy0, clamp(a.shoulder + 6, 4, a.L), Math.max(4, hy1 - hy0 + 1));
      const hv = keyGray.roi(hRect); const headMat = T(hv.clone()); hv.delete();
      const hmv = keyMask.roi(hRect); const headM = T(hmv.clone()); hmv.delete();
      // Paint everything outside the key with the head's median grey, so the paper/head
      // boundary doesn't dominate binarization; only the stamped strokes remain as contrast.
      const hist = new Uint32Array(256);
      for (let i = 0; i < headMat.data.length; i++) if (headM.data[i] > 127) hist[headMat.data[i]]++;
      let total = 0; for (const v of hist) total += v;
      let med = 128, acc = 0;
      for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total / 2) { med = v; break; } }
      const outside = T(new cv.Mat()); cv.bitwise_not(headM, outside);
      headMat.setTo(new cv.Scalar(med), outside);
      const headEq = T(new cv.Mat());
      try { const cl = new cv.CLAHE(2.5, new cv.Size(4, 4)); cl.apply(headMat, headEq); cl.delete(); }
      catch (_) { cv.equalizeHist(headMat, headEq); }
      const headBin = T(new cv.Mat());
      const block = Math.max(15, (Math.round(Math.min(headEq.rows, headEq.cols) / 6) | 1));
      cv.adaptiveThreshold(headEq, headBin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, block, 10);
      out.headCanvas = toCanvas(headBin);     // dark strokes on white, for OCR
      out.headGrayCanvas = toCanvas(headEq);  // contrast-enhanced grey, second OCR variant

      // Silhouette thumbnail.
      if (out.flippedOver) cv.flip(keyMask, keyMask, 0); // show it the same way round as a face-up key
      const silC = toCanvas(keyMask);
      const sc = Math.min(1, 360 / silC.width);
      const sil = document.createElement('canvas');
      sil.width = Math.max(1, Math.round(silC.width * sc)); sil.height = Math.max(1, Math.round(silC.height * sc));
      sil.getContext('2d').drawImage(silC, 0, 0, sil.width, sil.height);
      out.silhouette = sil.toDataURL('image/png');

      // Overlay for the result screen: key outline plus the head (stamp) and blade (cuts) areas,
      // mapped from the straightened key back into the photo.
      {
        const [ma, mb, mt, mc, md, mty] = s.Mv, det = ma * md - mb * mc;
        const back = (px, py) => {
          const xr = a.flip ? a.L - 1 - px : px, yr = a.flip ? a.H - 1 - py : py;
          const X = xr + s.xs - mt, Y = yr + s.ys - mty;
          return [Math.round((md * X - mb * Y) / det), Math.round((-mc * X + ma * Y) / det)];
        };
        const rect = (x0, y0, x1, y1) => [back(x0, y0), back(x1, y0), back(x1, y1), back(x0, y1)];
        const stepC = Math.max(1, Math.floor(cnt.data32S.length / 2 / 400)), outline = [];
        for (let i = 0; i < cnt.data32S.length; i += 2 * stepC) outline.push([cnt.data32S[i], cnt.data32S[i + 1]]);
        out.overlay = {
          outline,
          head: rect(0, head.headTop, a.shoulder, head.headBot),
          blade: rect(a.bladeStart, 0, a.L - 1, a.H - 1),
          width: W, height: Hh,
        };
      }

      Object.assign(out, {
        ok: true, sig: sg.sig, top: sg.top, bot: sg.bot, ratio,
        headShape: head.shape, headFeat: head.f,
      });
      return out;
    } catch (e) {
      console.error(e);
      return fail('Image processing failed: ' + (e && e.message ? e.message : e));
    } finally {
      for (const m of trash) { try { m.delete(); } catch (_) {} }
    }
  };

  return api;
})();
