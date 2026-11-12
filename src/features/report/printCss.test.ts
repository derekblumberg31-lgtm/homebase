import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../styles/app.css', import.meta.url), 'utf8');
const print = css.slice(css.indexOf('@media print'));

describe('report print styles', () => {
  it('force black ink on every report element, so no screen colour (dark theme grey) can win', () => {
    expect(print).toMatch(/\.report \*\s*\{\s*color: #000 !important;/);
  });
  it('let the Systems table fit a phone by breaking long words', () => {
    expect(css).toMatch(/@media \(max-width: 600px\)\s*\{\s*\.report table[\s\S]*overflow-wrap: anywhere/);
  });
});
