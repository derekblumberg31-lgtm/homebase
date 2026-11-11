import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { HomeAlertRows, HomeStatusLine } from './HomeSections';
import type { AttentionItem } from './insights';

const item = (over: Partial<AttentionItem>): AttentionItem => ({ id: 'record-r1', kind: 'warranty', title: 'Water heater warranty', detail: 'Ends Nov 5', href: '/records/r1', dismissKey: 'record-r1:2026-11-05', ...over });
const render = (node: React.ReactElement) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);

describe('HomeAlertRows', () => {
  it('renders nothing when there are no rows', () => {
    expect(render(<HomeAlertRows rows={[]} more={[]} onDismiss={() => {}} />)).toBe('');
  });

  it('gives every row a link, one-line sub and a named hide button, then counts the rest', () => {
    const html = render(<HomeAlertRows rows={[item({}), item({ id: 'backup', kind: 'backup', title: 'Save a backup', detail: 'Your data is only on this device', href: '/settings', dismissKey: undefined })]} more={[item({ id: 'a' }), item({ id: 'b' })]} onDismiss={() => {}} />);
    expect(html).toContain('aria-label="Hide from Home: Water heater warranty"');
    expect(html).toContain('aria-label="Hide from Home: Save a backup"');
    expect(html).toContain('href="/records/r1"');
    expect(html).toContain('2 more need a look');
    expect(html).toContain('Needs a look');
    expect(html.match(/home-alert-row/g)).toHaveLength(2);
  });

  it('makes the backup row a button once the page passes onBackup', () => {
    const backup = item({ id: 'backup', kind: 'backup', title: 'Save a backup', href: '/settings', dismissKey: undefined });
    expect(render(<HomeAlertRows rows={[backup]} more={[]} onDismiss={() => {}} onBackup={() => {}} />)).not.toContain('href="/settings"');
    expect(render(<HomeAlertRows rows={[backup]} more={[]} onDismiss={() => {}} />)).toContain('href="/settings"');
  });
});

describe('HomeStatusLine', () => {
  it('puts only the overdue clause in the overdue style', () => {
    const html = renderToStaticMarkup(<HomeStatusLine status={{ tone: 'overdue', clauses: ['2 jobs are overdue', '1 warranty ends soon'], text: '2 jobs are overdue, and 1 warranty ends soon' }} />);
    expect(html).toContain('<span class="home-status-clause is-overdue">2 jobs are overdue</span>, and 1 warranty ends soon');
    expect(renderToStaticMarkup(<HomeStatusLine status={{ tone: 'attention', clauses: ['2 jobs are due this week'], text: '2 jobs are due this week' }} />)).not.toContain('is-overdue');
  });
});
