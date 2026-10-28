import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../../../data/DataProvider';
import { keyCode, keyFlags, keyKind, keywayEntry } from '../../../engine/keys/keyInfo';
import { Camera } from '../../../ui/Icons';
import { EmptyState, Group, Page, Row, Section } from '../../../ui/layout';
import { CodeTag, useKeyways } from './CodeTag';

/** Keys and locks: every saved key, led by the code you'd need to get it copied. */
export function KeysPage() {
  const { items } = useData();
  const rows = useKeyways();
  const keys = useMemo(() => items.filter((i) => i.kind === 'key').sort((a, b) => a.name.localeCompare(b.name)), [items]);

  return (
    <Page
      title="Keys and locks"
      subtitle={keys.length ? `${keys.length} ${keys.length === 1 ? 'key' : 'keys'} saved` : undefined}
      back={{ to: '/property', label: 'Property' }}
      actions={
        <Link className="round-button" to="/property/identify-key" aria-label="Identify a key">
          <Camera size={19} />
        </Link>
      }
    >
      {keys.length === 0 ? (
        <div className="section">
          <EmptyState
            title="No keys saved yet"
            body="Lay a key flat on a plain surface and take a photo. Homebase learns its cuts, tells you which key it is next time, and finds the blank you need for a copy."
            action={{ label: 'Identify a key', to: '/property/identify-key' }}
          />
        </div>
      ) : (
        <>
          <Section>
            <Group>
              {keys.map((item) => {
                const entry = keywayEntry(item, rows);
                const flags = keyFlags(item, entry);
                const notes = [flags.dnd && 'do not duplicate', flags.restricted && 'restricted', flags.transponder && 'possible chip'].filter(Boolean);
                return (
                  <Row
                    key={item.id}
                    lead={<CodeTag code={keyCode(item, entry)} />}
                    title={item.name}
                    sub={[item.brand || keyKind(item), item.notes, ...notes].filter(Boolean).join(' · ')}
                    to={`/property/keys/${item.id}`}
                  />
                );
              })}
            </Group>
          </Section>
          <div className="button-stack">
            <Link className="button is-primary is-block" to="/property/identify-key">
              Identify a key
            </Link>
          </div>
        </>
      )}
    </Page>
  );
}
