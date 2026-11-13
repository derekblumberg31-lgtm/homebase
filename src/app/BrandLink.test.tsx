import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { BrandLink } from './BrandLink';

describe('BrandLink', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <BrandLink />
    </MemoryRouter>,
  );

  it('is a link to Home with a name that says where it goes', () => {
    expect(html).toContain('<a ');
    expect(html).toContain('href="/home"');
    expect(html).toContain('aria-label="Homebase, go to Home"');
  });

  it('keeps the logo decorative and shows the name', () => {
    expect(html).toContain('alt=""');
    expect(html).toContain('Homebase</div>');
  });

  it('is focusable like any link: no tabindex override', () => {
    expect(html).not.toContain('tabindex');
  });
});
