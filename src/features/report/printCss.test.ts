import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../styles/app.css', import.meta.url), 'utf8');
const print = css.slice(css.indexOf('@media print'));

describe('report print styles', () => {
  it('force black ink on every report element, so no screen colour (dark theme grey) can win', () => {
    expect(print).toMatch(/\.report \*\s*\{\s*color: #000 !important;/);
  });
  it('never break ordinary words in the Systems table on a phone', () => {
    const phone = /@media \(max-width: 600px\)\s*\{\s*\.report table[\s\S]*?\n\}/.exec(css)?.[0] ?? '';
    expect(phone).toMatch(/overflow-wrap: break-word/);
    expect(phone).not.toMatch(/overflow-wrap: anywhere|word-break: (break-all|break-word)/);
  });
});
