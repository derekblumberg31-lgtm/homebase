import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../../data/DataProvider';
import type { HomeRecord, RecordKind } from '../../data/types';
import { ChevronRight, Phone } from '../../ui/Icons';
import { Group, Page, Row, Section } from '../../ui/layout';
import type { StarterStepId } from '../home/starter';
import { RecordForm } from '../records/RecordForm';
import { CONTACT_ROLES, contactsFor, noGas, ROLE_VENDOR, SHUTOFFS, shutoffLocation, shutoffRecord, telHref } from './safety';
import { PhotoThumb, ShutoffSheet } from './ShutoffSheet';

/** Shut-offs and who to call: only what the homeowner saved, nothing filled in for them. */
export function SafetyPage() {
  const data = useData();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<StarterStepId | null>(null);
  const [draft, setDraft] = useState<{ kind: RecordKind; vendor?: string } | null>(null);

  return (
    <Page title="Shut-offs and who to call" subtitle="Where to turn things off, and who to ring. Only what you’ve saved." back={{ to: '/property', label: 'Property' }}>
      <Section title="Shut-offs">
        <Group>
          {SHUTOFFS.map(({ id, label }) => {
            if (id === 'gas-shutoff' && noGas(data)) return <Row key={id} title={label} sub="No gas in this home" />;
            const where = shutoffLocation(data, id);
            const photoId = shutoffRecord(data, id)?.fileIds[0];
            return (
              <button key={id} type="button" className="row safety-row" onClick={() => setEditing(id)}>
                <span className="row-main">
                  <span className="row-title">{label}</span>
                  <span className={`safety-where ${where ? '' : 'is-empty'}`}>{where ?? 'Not saved yet'}</span>
                  {photoId && <PhotoThumb fileId={photoId} alt={`Photo of the ${label.toLowerCase()}`} />}
                </span>
                <ChevronRight size={17} className="row-chevron" />
              </button>
            );
          })}
        </Group>
      </Section>

      <Section title="Who to call">
        <Group>
          {CONTACT_ROLES.map(({ role, label }) => {
            const contacts = contactsFor(data, role);
            if (!contacts.length) {
              const vendor = ROLE_VENDOR[role];
              return (
                <Row
                  key={role}
                  title={label}
                  sub="Not saved yet"
                  chevron
                  onClick={() => setDraft(role === 'insurer' ? { kind: 'insurance' } : { kind: 'contractor', vendor })}
                />
              );
            }
            return contacts.map((contact) => <ContactRow key={contact.id} role={label} contact={contact} />);
          })}
        </Group>
      </Section>

      <p className="safety-foot">In an emergency, call 911 first.</p>

      {editing && <ShutoffSheet id={editing} onClose={() => setEditing(null)} />}
      {draft && (
        <RecordForm
          draft={draft}
          onClose={() => setDraft(null)}
          onSaved={(r) => {
            setDraft(null);
            navigate(`/records/${r.id}`);
          }}
        />
      )}
    </Page>
  );
}

function ContactRow({ role, contact }: { role: string; contact: HomeRecord }) {
  const tel = telHref(contact.phone);
  return (
    <div className="row safety-contact">
      <Link className="safety-contact-main" to={`/records/${contact.id}`}>
        <span className="row-main">
          <span className="row-title">{role}</span>
          <span className="row-sub is-wrap">{[contact.title, contact.phone].filter(Boolean).join(' · ')}</span>
        </span>
        {!tel && <ChevronRight size={17} className="row-chevron" />}
      </Link>
      {tel && (
        <a className="round-button safety-call" href={tel} aria-label={`Call ${contact.title}, ${contact.phone}`}>
          <Phone size={19} />
        </a>
      )}
    </div>
  );
}
