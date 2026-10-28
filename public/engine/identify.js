/* identify.js — suggests brand / keyway / key type from OCR text, head shape, blade ratio
 * and the user's own past corrections. Every result carries a `source` so the UI can say how
 * it was obtained; nothing here is presented as fact. */
const SOURCE_LABEL = {
  user: 'Confirmed by you',
  text: 'Read from text',
  'text-brand': 'Brand read from text, keyway guessed',
  learned: 'Guessed from your past corrections',
  shape: 'Guessed from shape',
  unknown: 'Unknown',
};
const SOURCE_RANK = { unknown: 0, shape: 1, learned: 2, 'text-brand': 3, text: 4, user: 5 };

const Identify = (() => {
  let table = [];
  const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  function lev(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[a.length][b.length];
  }

  async function load() {
    if (window.__KEYWAYS__) { table = window.__KEYWAYS__.keyways || []; return table; } // embedded build
    try {
      const r = await fetch((window.__ENGINE_BASE__ || '/engine/') + 'keyways.json', { cache: 'no-cache' });
      table = (await r.json()).keyways || [];
    } catch (e) {
      console.warn('keyways.json not loaded', e);
      table = [];
    }
    return table;
  }

  function find(keyway) {
    const k = norm(keyway);
    if (!k) return null;
    return table.find(e => e.keyway && (norm(e.keyway) === k || (e.codes || []).some(c => norm(c) === k))) || null;
  }

  // Reference entry for a saved key: by keyway, else the brand-level entry (car makers etc.).
  function entryFor(k) {
    return find(k.keyway) || (k.brand ? table.find(e => !e.keyway && norm(e.brand) === norm(k.brand)) || null : null);
  }

  const entryName = e => [e.brand, e.keyway].filter(Boolean).join(' ');

  // OCR commonly confuses I/L with 1 and O with 0 in short codes.
  function variants(t) {
    const v = new Set([t, t.replace(/[IL]$/, '1'), t.replace(/O/g, '0')]);
    v.add(t.replace(/[IL]$/, '1').replace(/O/g, '0'));
    return [...v];
  }

  function readText(ocr) {
    const res = { codes: [], brands: [], dnd: false, tokens: [], bestRot: null, bestText: '' };
    if (!ocr || !ocr.results) return res;
    const aliases = [];
    for (const e of table) for (const a of e.brandAliases || []) {
      const n = norm(a);
      if (!aliases.some(x => x.alias === n)) aliases.push({ alias: n, brand: e.brand });
    }
    let bestScore = -1;
    for (const r of ocr.results) {
      let hits = 0;
      const flat = norm(r.text);
      // Tolerant of partial reads ("ONOT PLICAT"): one strong fragment, or "NOT" plus a weak one.
      const strong = /DUPLIC|UPLICAT|PLICATE|NOTDUP|DONOTCOPY|DONTCOPY/.test(flat);
      const weak = /DONOT|ONOT|DONT/.test(flat) && /DUP|PLIC|COPY/.test(flat);
      if (strong || weak) { res.dnd = true; hits++; }
      // Brands first: a clearly read brand in the same pass corroborates a low-confidence code
      // (Tesseract gives short non-dictionary tokens like "KW1" very low word confidence).
      const passBrands = new Set();
      for (const w of r.words) {
        const t = norm(w.text);
        if (t.length < 4) continue;
        for (const b of aliases) {
          const fuzzy = b.alias.length >= 6 && (lev(t, b.alias) <= 1 || t.includes(b.alias));
          if (t === b.alias || fuzzy) {
            res.brands.push({ brand: b.brand, token: w.text, conf: w.conf, rot: r.rot }); hits++;
            if (w.conf >= 60) passBrands.add(b.brand);
          }
        }
      }
      for (const w of r.words) {
        const t = norm(w.text);
        if (t.length < 2) continue;
        if (w.conf >= 40 && t.length >= 3) res.tokens.push(t);
        const vs = variants(t);
        for (const e of table) for (const c of e.codes || []) {
          const cn = norm(c);
          if (!vs.includes(cn)) continue;
          // Exact 3+ character codes (KW1, SC1, WR5) are distinctive enough to trust at any
          // confidence; OCR-corrected variants and 2-character codes (M1, Y1) need more evidence.
          const corroborated = passBrands.has(e.brand);
          const exact = t === cn;
          if (corroborated || (exact && cn.length > 2) || w.conf >= (cn.length > 2 ? 45 : 75)) {
            res.codes.push({ entry: e, token: w.text, conf: w.conf, rot: r.rot, corroborated }); hits++;
            if (t.length >= 2) res.tokens.push(t);
          }
        }
      }
      const sc = hits * 100 + (r.conf || 0);
      if (sc > bestScore) { bestScore = sc; res.bestRot = r.rot; res.bestText = r.text; }
    }
    const seen = new Set();
    res.codes = res.codes.filter(c => !seen.has(c.entry.id) && seen.add(c.entry.id));
    const seenB = new Set();
    res.brands = res.brands.filter(b => !seenB.has(b.brand) && seenB.add(b.brand));
    res.tokens = [...new Set(res.tokens)];
    return res;
  }

  const fromEntry = e => ({
    brand: e.brand, keyway: e.keyway, type: e.type, blank: e.blank || '', entryId: e.id,
    verify: !!e.verify, restricted: !!e.restricted, transponderLikely: !!e.transponderLikely,
  });

  // keys = saved keys; those with idSource 'user' act as training examples.
  function suggest({ ocr, headShape, ratio, keys = [] }) {
    const text = readText(ocr);
    const cand = new Map();
    const add = (entry, pts, why, src) => {
      if (!cand.has(entry.id)) cand.set(entry.id, { entry, score: 0, why: [], src: {} });
      const c = cand.get(entry.id);
      c.score += pts;
      if (why) c.why.push(why);
      if (src) c.src[src] = (c.src[src] || 0) + pts;
    };

    for (const h of text.codes) add(h.entry, 10, `read "${h.token}"`, 'text');
    for (const b of text.brands) for (const e of table.filter(x => x.brand === b.brand)) add(e, 4, `read "${b.token}"`, 'text-brand');
    for (const e of table) {
      if ((e.headShapes || []).includes(headShape)) add(e, 1, `${headShape} head`, 'shape');
      if (e.ratio && ratio >= e.ratio[0] && ratio <= e.ratio[1]) add(e, 1, 'blade proportions', 'shape');
      if (cand.has(e.id)) cand.get(e.id).score += e.prior || 0; // tie-breaker: how common it is
    }

    // Learn from the user's confirmed keys.
    for (const k of keys) {
      if (k.idSource !== 'user' || !(k.keyway || k.brand)) continue;
      let pts = 0;
      const shapeLike = (k.captures || []).some(c => c.headShape === headShape && Math.abs(c.ratio - ratio) / c.ratio < 0.12);
      if (shapeLike) pts += 2.5;
      const kt = new Set(k.ocrTokens || []);
      if (text.tokens.some(t => t.length >= 3 && kt.has(t))) pts += 3;
      if (!pts) continue;
      const e = entryFor(k) || {
        id: 'user:' + norm(k.brand) + ':' + norm(k.keyway), brand: k.brand, keyway: k.keyway,
        type: k.type, blank: k.blank, custom: true,
      };
      add(e, pts, `like your "${k.label}"`, 'learned');
    }

    const list = [...cand.values()].sort((a, b) => b.score - a.score);
    const top = list[0];
    let source = 'unknown';
    if (top) {
      if (top.src.text) source = 'text';
      else if (top.src['text-brand']) source = 'text-brand';
      else if ((top.src.learned || 0) >= 2.5) source = 'learned';
      else if (top.score >= 2) source = 'shape';
    }
    let primary = source === 'unknown' ? null : fromEntry(top.entry);
    let alternatives = source === 'text' || source === 'unknown' ? [] : list.slice(1, 4)
      .filter(c => c.score >= 1 && (source !== 'text-brand' || c.entry.brand === top.entry.brand))
      .map(c => fromEntry(c.entry));
    // Shape alone can't tell brands apart: if near-tied candidates span brands, name only the type.
    if (source === 'shape') {
      const ties = list.filter(c => top.score - c.score < 0.3);
      if (new Set(ties.map(c => c.entry.brand)).size > 1) {
        const types = new Set(ties.map(c => c.entry.type));
        primary = { brand: '', keyway: '', type: types.size === 1 ? top.entry.type : '', blank: '', transponderLikely: !!top.entry.transponderLikely };
        alternatives = ties.slice(0, 4).map(c => fromEntry(c.entry));
        if (!primary.type) { primary = null; source = 'unknown'; }
      }
    }
    if (!primary && headShape === 'plastic') {
      primary = { brand: '', keyway: '', type: 'car', blank: '', transponderLikely: true };
      source = 'shape';
    }

    // Closest reference entries even when nothing is confident enough to name (for "is it one of these?").
    const suggestions = list.filter(c => c.score >= 1).slice(0, 4).map(c => fromEntry(c.entry));
    return {
      primary, alternatives, suggestions, source, label: SOURCE_LABEL[source],
      why: top && source !== 'unknown' ? top.why : [],
      flags: {
        dnd: text.dnd,
        transponder: headShape === 'plastic' || !!(primary && primary.transponderLikely),
        restricted: !!(primary && primary.restricted),
      },
      text, tokens: text.tokens, ocrError: (ocr && ocr.error) || null,
      candidates: list.slice(0, 8).map(c => ({ name: entryName(c.entry), score: +c.score.toFixed(2), why: c.why.join(', ') })),
    };
  }

  // "Likely: Kwikset KW1, house key"
  function describe(p, source) {
    if (!p || (!p.brand && !p.keyway && !p.type)) return 'Brand and keyway unknown';
    const prefix = source === 'user' ? '' : source === 'text' ? 'Likely: ' : 'Possibly: ';
    const name = [p.brand, p.keyway].filter(Boolean).join(' ');
    const type = p.type ? (p.type === 'high security' ? 'high-security key' : `${p.type} key`) : '';
    if (!name) return `${prefix}${type}, brand unknown`;
    return prefix + name + (type ? `, ${type}` : '');
  }

  return {
    load, find, entryFor, entryName, suggest, describe, readText,
    get table() { return table; },
  };
})();
