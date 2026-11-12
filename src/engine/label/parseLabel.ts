import { LABEL_BRANDS } from './labelBrands';

export interface LabelFields {
  brand?: string;
  model?: string;
  serial?: string;
}

const TOKEN = '([A-Za-z0-9][A-Za-z0-9\\-/.]{2,24})(?![A-Za-z0-9\\-/.])';
const AFTER = '(?![A-Za-z0-9])\\s*[:#.]*\\s*';
const MODEL_RE = new RegExp(`(?<![A-Za-z0-9])(?:MODEL\\s+NUMBER|MODEL\\s+NO\\b\\.?|MODEL|MOD\\.?|M/N|MDL)${AFTER}${TOKEN}`, 'gi');
const SERIAL_RE = new RegExp(`(?<![A-Za-z0-9])(?:SERIAL\\s+NUMBER|SERIAL\\s+NO\\b\\.?|SERIAL|SER\\.?|S/N|SN)${AFTER}${TOKEN}`, 'gi');

/** O, I and l next to a digit are read as 0, 1 and 1. Only ever applied inside a captured token. */
function fixDigits(token: string): string {
  let out = token;
  for (let i = 0; i < token.length; i++) {
    const next = out.replace(/(?<=[0-9])[OIl]|[OIl](?=[0-9])/g, (c) => (c === 'O' ? '0' : '1'));
    if (next === out) break;
    out = next;
  }
  return out;
}

function pick(text: string, re: RegExp): string | undefined {
  for (const match of text.matchAll(re)) {
    const raw = match[1].replace(/[.\-/]+$/, '');
    if (raw.length < 3 || !/[0-9]/.test(raw)) continue;
    return fixDigits(raw).toUpperCase();
  }
  return undefined;
}

function brandIn(text: string): string | undefined {
  let best: { name: string; at: number } | undefined;
  for (const { name, pattern } of LABEL_BRANDS) {
    const source = pattern?.source ?? name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const found = new RegExp(`(?<![A-Za-z0-9])(?:${source})(?![A-Za-z0-9])`, 'i').exec(text);
    if (found && (!best || found.index < best.at)) best = { name, at: found.index };
  }
  return best?.name;
}

/** Brand, model and serial number from text read off an equipment label. A field appears only when it was found. */
export function parseLabel(text: string): LabelFields {
  const out: LabelFields = {};
  const brand = brandIn(text);
  const model = pick(text, MODEL_RE);
  const serial = pick(text, SERIAL_RE);
  if (brand) out.brand = brand;
  if (model) out.model = model;
  if (serial) out.serial = serial;
  return out;
}
