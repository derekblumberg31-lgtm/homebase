import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToastStack } from './overlays';

const noop = () => {};
const render = (props: Partial<Parameters<typeof ToastStack>[0]> = {}) =>
  renderToStaticMarkup(<ToastStack toasts={[]} polite={null} assertive={null} paused={false} setPaused={noop} onDismiss={noop} {...props} />);

describe('ToastStack', () => {
  it('is a Messages landmark with both live regions present before any toast', () => {
    const html = render();
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Messages"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-live="assertive"');
  });

  it('puts each announcement in its own region and leaves the visible toasts plain', () => {
    const html = render({
      toasts: [
        { id: 1, text: 'Furnace filter done', tone: 'info', action: { label: 'Undo', run: noop } },
        { id: 2, text: 'That wasn’t saved.', tone: 'error' },
      ],
      polite: { id: 1, text: 'Furnace filter done. Undo is available.' },
      assertive: { id: 2, text: 'That wasn’t saved.' },
    });
    const [, politePart, assertivePart] = html.split(/aria-live="/);
    expect(politePart).toContain('Furnace filter done. Undo is available.');
    expect(politePart).not.toContain('That wasn’t saved.');
    expect(assertivePart).toContain('That wasn’t saved.');
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('role="alert"');
    expect(html).toContain('>Undo</button>');
  });

  it('marks a leaving toast and takes its Undo out of the tab order', () => {
    const html = render({ toasts: [{ id: 1, text: 'Done', tone: 'info', action: { label: 'Undo', run: noop }, leaving: true }] });
    expect(html).toContain('is-leaving');
    expect(html).toContain('tabindex="-1"');
  });
});
