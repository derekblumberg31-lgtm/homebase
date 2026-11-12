import { useState } from 'react';
import { FEED_GUIDES, FEED_PRIVACY_LINE, type CalendarPlatform } from '../features/settings/calendarGuide';
import { TextField } from '../ui/controls';
import { Section } from '../ui/layout';
import { Confirm, useToast } from '../ui/overlays';
import { useCloud } from './cloudContext';
import { webcalUrl } from './feed';

export const NEW_LINK_MESSAGE = 'Calendars using the old link stop updating until you add the new one.';
export const LINK_KEPT_LINE = 'Your link is set up. To add it to another calendar, get a new link.';

/** The signed-in half of the calendar guide: a private link a calendar app subscribes to. Shown only while signed in. */
export function CalendarLinkSection({ platform }: { platform: CalendarPlatform }) {
  const cloud = useCloud();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  if (!cloud?.user) return null;

  const { feed } = cloud;
  const guide = FEED_GUIDES[platform];

  async function make() {
    if (busy) return;
    setBusy(true);
    try {
      await cloud!.makeCalendarLink();
    } catch {
      toast('That didn’t finish. Try again.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    } catch {
      toast('The link couldn’t be copied. Select it and copy it yourself.', { tone: 'error' });
    }
  }

  return (
    <Section title="Calendar link" id="link">
      {feed.phase !== 'ready' ? (
        <div className="button-stack">
          <button type="button" className="button is-secondary is-block" aria-disabled={busy || feed.phase === 'unknown' || undefined} aria-busy={busy || undefined} onClick={() => feed.phase === 'none' && void make()}>
            Make a calendar link
          </button>
        </div>
      ) : feed.url ? (
        <>
          <TextField label="Your calendar link" value={feed.url} readOnly onFocus={(e) => e.currentTarget.select()} />
          <div className="button-stack">
            <button type="button" className="button is-secondary is-block" onClick={() => void copy(feed.url!)}>
              Copy link
            </button>
            <a className="button is-secondary is-block" href={webcalUrl(feed.url)}>
              Subscribe on this iPhone or Mac
            </a>
            <button type="button" className="button is-quiet is-block" onClick={() => setConfirmNew(true)}>
              Get a new link
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="section-foot">{LINK_KEPT_LINE}</p>
          <div className="button-stack">
            <button type="button" className="button is-quiet is-block" onClick={() => setConfirmNew(true)}>
              Get a new link
            </button>
          </div>
        </>
      )}
      <p className="section-foot">{FEED_PRIVACY_LINE}</p>
      <ol className="guide-steps">
        {guide.steps.map((step) => (
          <li key={step.text}>{step.text}</li>
        ))}
      </ol>
      {guide.note && <p className="section-foot">{guide.note}</p>}
      {confirmNew && (
        <Confirm
          title="Make a new link?"
          message={NEW_LINK_MESSAGE}
          confirmLabel="Get a new link"
          onCancel={() => setConfirmNew(false)}
          onConfirm={() => {
            setConfirmNew(false);
            void make();
          }}
        />
      )}
    </Section>
  );
}
