/* match.js — compares keys two ways:
 *  1. Whole-profile similarity with banded Dynamic Time Warping (overall shape, tolerant of shifts).
 *  2. Cut-by-cut depth comparison: finds each cut bottom on each edge and compares depths of
 *     matching cuts. This is what tells apart keys that differ by a single cut, which a
 *     whole-profile average hides.
 * The final score is the lower of the two. Tuning constants live at the top of app.js. */
const Matcher = (() => {
  // Sakoe–Chiba banded DTW; mean absolute depth difference along the warp path.
  function dtw(a, b, band = DTW_BAND) {
    const n = a.length, m = b.length, INF = 1e9;
    let prev = new Float64Array(m + 1).fill(INF), cur = new Float64Array(m + 1).fill(INF);
    prev[0] = 0;
    for (let i = 1; i <= n; i++) {
      cur.fill(INF);
      const jl = Math.max(1, i - band), jh = Math.min(m, i + band);
      for (let j = jl; j <= jh; j++)
        cur[j] = Math.abs(a[i - 1] - b[j - 1]) + Math.min(prev[j], prev[j - 1], cur[j - 1]);
      [prev, cur] = [cur, prev];
    }
    return prev[m] / n;
  }

  // Cut bottoms on one edge profile (depth, 0 = uncut). Ignores the tapered tip.
  function cutsOf(d) {
    const n = d.length, win = 4, out = [];
    for (let i = Math.round(n * 0.12); i < Math.round(n * 0.88); i++) { // skip the shoulder stops (first cuts sit at ~17–21%) and the tip
      if (d[i] < CUT_MIN_DEPTH) continue;
      let isMax = true;
      for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) if (d[j] > d[i]) { isMax = false; break; }
      if (!isMax) continue;
      let lo = Infinity;
      for (let j = Math.max(0, i - 3 * win); j <= Math.min(n - 1, i + 3 * win); j++) lo = Math.min(lo, d[j]);
      if (d[i] - lo < CUT_MIN_DEPTH * 0.75) continue;
      const last = out[out.length - 1];
      if (last && i - last.end <= 2 * win) { last.end = i; last.pos = (last.start + i) / 2; last.depth = Math.max(last.depth, d[i]); }
      else out.push({ start: i, end: i, pos: i, depth: d[i] });
    }
    return out.map(c => ({ pos: c.pos, depth: c.depth }));
  }

  // Worst depth difference between matching cuts. A cut found on only one key is compared with
  // the other key's profile depth at that spot (deepest within a few samples): every position on a
  // real key has some depth, and a shallow or narrow cut can be visible without passing the detector.
  function cutDiff(qc, cc, qArr, cArr) {
    const depthNear = (arr, pos) => {
      if (!arr) return 0;
      let d = 0;
      for (let i = Math.max(0, Math.round(pos) - 4); i <= Math.min(arr.length - 1, Math.round(pos) + 4); i++) d = Math.max(d, arr[i]);
      return d;
    };
    let worst = 0, at = null;
    const used = new Set();
    for (const c of cc) {
      let best = -1;
      qc.forEach((q, k) => {
        if (used.has(k) || Math.abs(q.pos - c.pos) > CUT_POS_TOLERANCE) return;
        if (best < 0 || Math.abs(q.pos - c.pos) < Math.abs(qc[best].pos - c.pos)) best = k;
      });
      const dd = best < 0 ? Math.abs(c.depth - depthNear(qArr, c.pos)) : Math.abs(qc[best].depth - c.depth);
      if (best >= 0) used.add(best);
      if (dd > worst) { worst = dd; at = c.pos; }
    }
    qc.forEach((q, k) => {
      if (used.has(k)) return;
      const dd = Math.abs(q.depth - depthNear(cArr, q.pos));
      if (dd > worst) { worst = dd; at = q.pos; }
    });
    return { worst, at };
  }

  const sim = (d, scale) => Math.max(0, Math.min(100, 100 * (1 - d / scale)));

  // Best mapping p' = s·p + off of query cut positions onto saved ones (offset up to ~15% of the
  // blade, stretch up to ±8%). Scored by depth agreement of the cuts it pairs up.
  function align(qc, cc) {
    const none = { s: 1, off: 0 };
    if (!qc.length || !cc.length) return none;
    const cost = (s, off) => {
      let c = 0; const used = new Set();
      for (const p of qc) {
        const x = s * p.pos + off; let bi = -1, bd = 1e9;
        cc.forEach((t, k) => { const d = Math.abs(t.pos - x); if (!used.has(k) && d < bd) { bd = d; bi = k; } });
        if (bi >= 0 && bd <= CUT_POS_TOLERANCE * 0.75) { used.add(bi); c += Math.abs(cc[bi].depth - p.depth) + bd * 0.004; }
        else c += p.depth + 0.05;
      }
      cc.forEach((t, k) => { if (!used.has(k)) c += t.depth + 0.05; });
      return c;
    };
    let best = { ...none, c: cost(1, 0) - 0.02 }; // small preference for no change
    const maxOff = SIG_N_MATCH * 0.15;
    for (const s of [0.92, 0.96, 1, 1.04, 1.08])
      for (const p of qc) for (const t of cc) {
        const off = t.pos - s * p.pos;
        if (Math.abs(off) > maxOff) continue;
        const c = cost(s, off) + Math.abs(s - 1) * 0.6 + Math.abs(off) * 0.0008; // prefer small corrections
        if (c < best.c) best = { s, off, c };
      }
    return { s: best.s, off: best.off };
  }
  // Resample a profile under p' = s·p + off (values outside the blade are clamped to the ends).
  function warp(a, { s, off }) {
    const n = a.length, out = new Array(n);
    for (let i = 0; i < n; i++) {
      const x = Math.min(n - 1, Math.max(0, (i - off) / s)), k = Math.floor(x), f = x - k;
      out[i] = k + 1 < n ? a[k] * (1 - f) + a[k + 1] * f : a[n - 1];
    }
    return out;
  }
  const SIG_N_MATCH = 256;

  // Linear resample (captures saved by older versions used a different SIG_N).
  function resample(a, n) {
    if (a.length === n) return a;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const x = i * (a.length - 1) / (n - 1), k = Math.floor(x), f = x - k;
      out[i] = k + 1 < a.length ? a[k] * (1 - f) + a[k + 1] * f : a[a.length - 1];
    }
    return out;
  }

  // q and c are capture-like objects: { sig, top, bot, ratio, headShape }.
  function compare(q, c) {
    if (!c || !c.sig || !q.sig) return { score: 0, filtered: 'no signature' };
    if (c.sig.length !== q.sig.length) {
      const n = q.sig.length;
      c = { ...c, sig: resample(c.sig, n), top: resample(c.top, n), bot: resample(c.bot, n) };
    }
    const rd = Math.abs(q.ratio - c.ratio) / c.ratio;
    if (rd > RATIO_TOLERANCE) return { score: 0, filtered: `blade ratio ${q.ratio.toFixed(2)} vs ${c.ratio.toFixed(2)}` };

    // Line the two blades up first: where the shoulder is detected (and a tilted camera) shifts
    // and stretches positions a little from photo to photo. Find the offset/stretch that best
    // overlays the cut bottoms, then warp this photo's profiles onto the saved one.
    const al = align(cutsOf(q.top).concat(cutsOf(q.bot)), cutsOf(c.top).concat(cutsOf(c.bot)));
    if (al.s !== 1 || al.off !== 0) q = { ...q, sig: warp(q.sig, al), top: warp(q.top, al), bot: warp(q.bot, al) };

    const width = sim(dtw(q.sig, c.sig), DTW_SCALE);                                          // mirror-invariant
    const normal = (sim(dtw(q.top, c.top), DTW_SCALE) + sim(dtw(q.bot, c.bot), DTW_SCALE)) / 2;
    const mirror = (sim(dtw(q.top, c.bot), DTW_SCALE) + sim(dtw(q.bot, c.top), DTW_SCALE)) / 2; // key flipped over
    const mirrored = mirror > normal + 1;
    const profile = 0.5 * width + 0.5 * Math.max(normal, mirror);

    const qT = cutsOf(q.top), qB = cutsOf(q.bot);
    const cT = cutsOf(mirrored ? c.bot : c.top), cB = cutsOf(mirrored ? c.top : c.bot);
    const dT = cutDiff(qT, cT, q.top, mirrored ? c.bot : c.top), dB = cutDiff(qB, cB, q.bot, mirrored ? c.top : c.bot);
    const worst = dT.worst >= dB.worst ? dT : dB;
    const cuts = sim(worst.worst, CUT_SCALE);

    let score = Math.min(profile, cuts);
    // Round/oval/square/bow blur together in a tilted photo; plastic vs metal is the reliable difference.
    if ((q.headShape === 'plastic') !== (c.headShape === 'plastic')) score -= HEAD_SHAPE_PENALTY;
    return {
      score: Math.max(0, score), mirrored,
      cutDiff: worst.worst, cutAt: worst.at, cutCount: qT.length + qB.length,
      parts: { profile, cuts, width, normal, mirror, shift: al.off, stretch: al.s },
    };
  }

  // A key's template: its photos lined up on the first one and combined point by point (median for
  // 3+ photos, so one poor photo can't drag it off). Measurement noise averages out, so every photo
  // added to a key makes it more precise.
  function template(k) {
    const caps = (k.captures || []).filter(c => c.sig);
    if (caps.length < 2) return null;
    const n = caps[0].sig.length;
    const ref = caps[0];
    const aligned = caps.map((c, i) => {
      let cc = c.sig.length === n ? c : { ...c, sig: resample(c.sig, n), top: resample(c.top, n), bot: resample(c.bot, n) };
      if (i === 0) return cc;
      const al = align(cutsOf(cc.top).concat(cutsOf(cc.bot)), cutsOf(ref.top).concat(cutsOf(ref.bot)));
      return al.s === 1 && al.off === 0 ? cc : { ...cc, sig: warp(cc.sig, al), top: warp(cc.top, al), bot: warp(cc.bot, al) };
    });
    const comb = key => Array.from({ length: n }, (_, i) => {
      const v = aligned.map(c => c[key][i]).sort((x, y) => x - y);
      return v.length >= 3 ? v[Math.floor(v.length / 2)] : (v[0] + v[1]) / 2;
    });
    const shapes = caps.map(c => c.headShape);
    return {
      sig: comb('sig'), top: comb('top'), bot: comb('bot'),
      ratio: caps.reduce((p, c) => p + c.ratio, 0) / caps.length,
      headShape: shapes.sort((x, y) => shapes.filter(v => v === y).length - shapes.filter(v => v === x).length)[0],
      isTemplate: true,
    };
  }

  // Score per key: its combined template when it has 2+ photos; single photos can still win (so a
  // confirmed photo from an unusual angle helps next time) but with a small handicap.
  function best(q, keys) {
    const ranked = [];
    for (const k of keys) {
      let top = null;
      const tpl = template(k);
      if (tpl) { const r = compare(q, tpl); top = { ...r, capture: tpl }; }
      for (const c of k.captures || []) {
        const r = compare(q, c);
        const sc = tpl ? r.score - SINGLE_PHOTO_HANDICAP : r.score;
        if (!top || sc > top.score) top = { ...r, score: Math.max(0, sc), capture: c };
      }
      if (top) ranked.push({ key: k, ...top, photos: (k.captures || []).length });
    }
    ranked.sort((a, b) => b.score - a.score);
    return { best: ranked[0] || null, runnerUp: ranked[1] || null, ranked };
  }

  return { template, dtw, cutsOf, compare, best, warp };
})();
