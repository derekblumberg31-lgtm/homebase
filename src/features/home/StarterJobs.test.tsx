import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { emptyData } from '../../data/store';
import { starterJobsFor } from './starter';
import { StarterList } from './StarterJobs';

const NOW = new Date('2026-10-27T19:00:00').getTime();
const jobs = starterJobsFor(emptyData(), NOW);
const noop = () => {};
const render = (picks: Record<string, 'not-sure' | 'this-month' | 'few-months' | 'over-a-year'>) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <StarterList jobs={jobs} picks={picks} now={NOW} season="fall" onToggle={noop} onChoose={noop} onAdd={noop} onDismiss={noop} />
    </MemoryRouter>,
  );

describe('StarterList', () => {
  it('shows five unticked rows, no choices, and a disabled Add when nothing is ticked', () => {
    const html = render({});
    expect(html.match(/role="checkbox"/g)).toHaveLength(5);
    expect(html.match(/aria-checked="false"/g)).toHaveLength(5);
    expect(html).not.toContain('radiogroup');
    expect(html).not.toContain('When did you last do this?');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Add jobs<\/button>/);
    expect(html).toContain('Suggested for fall');
    expect(html).toContain('Add your own');
    expect(html).toContain('Not now');
  });

  it('opens the question and a radio group under the ticked row only, with Not sure selected', () => {
    const html = render({ [jobs[0].key]: 'not-sure' });
    expect(html.match(/role="radiogroup"/g)).toHaveLength(1);
    expect(html.match(/role="radio"/g)).toHaveLength(4);
    expect(html).toMatch(/role="radio"[^>]*aria-checked="true"[^>]*>Not sure</);
    expect(html).toContain('Add 1 job</button>');
    expect(html).not.toMatch(/disabled=""/);
  });

  it('counts several ticked rows', () => {
    expect(render({ [jobs[0].key]: 'not-sure', [jobs[1].key]: 'few-months' })).toContain('Add 2 jobs</button>');
  });
});
