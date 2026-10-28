import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData, useStore } from '../../../data/DataProvider';
import type { Item } from '../../../data/types';
import { keyCode, keyFlags, keyKind, keywayEntry, SOURCE_LABEL, whereToCut } from '../../../engine/keys/keyInfo';
import { EmptyState, Group, Notice, Page, Row, Section } from '../../../ui/layout';
import { Confirm, useToast } from '../../../ui/overlays';
import { useKeyways } from './CodeTag';
import { KeyDetailsSheet } from './KeyDetailsSheet';
import { chartColor, ProfileChart } from './ProfileChart';
import { ReplacementCard } from './ReplacementCard';
import { KeyFlagNotices } from './KeyFlagNotices';

export function KeyPage() {
  const { keyId } = useParams();
  const data = useData();
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const rows = useKeyways();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const item = data.items.find((i) => i.id === keyId && i.kind === 'key');

  const series = useMemo(() => {
    if (!item?.key) return [];
    const palette = ['--accent', '--text-2', '--green', '--amber', '--ink-x', '--text'].map(chartColor);
    return item.key.captures.map((c, i) => ({ data: c.top, color: palette[i % palette.length], width: 1.6 }));
  }, [item]);

  if (!item?.key) {
    return (
      <Page title="Key" back={{ to: '/property/keys', label: 'Keys and locks' }}>
        <div className="section">
          <EmptyState title="This key isn’t here" body="It may have been removed." action={{ label: 'Back to keys', to: '/property/keys' }} />
        </div>
      </Page>
    );
  }

  const entry = keywayEntry(item, rows);
  const flags = keyFlags(item, entry);
  const captures = item.key.captures;

  async function saveDetails(v: Parameters<typeof KeyDetailsSheet>[0]['value']) {
    if (!item?.key) return;
    const next: Item = {
      ...item,
      name: v.name || item.name,
      notes: v.notes,
      brand: v.brand,
      key: { ...item.key, keyway: v.keyway, type: v.type, blank: v.blank, flags: { dnd: v.dnd, transponder: v.transponder }, idSource: 'user' },
      updatedAt: new Date().toISOString(),
    };
    await store.put('items', next);
    setEditing(false);
    toast('Saved');
  }

  return (
    <Page title={item.name} subtitle={item.notes} back={{ to: '/property/keys', label: 'Keys and locks' }} actions={<button type="button" className="button is-quiet" onClick={() => setEditing(true)}>Edit</button>}>
      <Section>
        <ReplacementCard
          code={keyCode(item, entry)}
          name={item.brand || keyKind(item)}
          line={[item.brand ? keyKind(item) : null, item.key.blank && item.key.blank !== item.key.keyway ? `Blank ${item.key.blank}` : null, entry?.alt].filter(Boolean).join(' · ')}
          source={item.key.idSource === 'unknown' ? undefined : SOURCE_LABEL[item.key.idSource]}
          sourceTone={item.key.idSource === 'user' || item.key.idSource === 'text' ? 'good' : 'warn'}
          notes={entry?.notes}
          verify={entry?.verify}
        />
      </Section>

      <KeyFlagNotices flags={flags} />

      <Section title={`Trained on ${captures.length} ${captures.length === 1 ? 'photo' : 'photos'}`}>
        {captures.length === 0 ? (
          <div className="group">
            <EmptyState inline title="No photos yet" body="Add one to start matching this key." />
          </div>
        ) : (
          <div className="group chart-card">
            <ProfileChart series={series} label={`Cut profiles from ${captures.length} photos`} />
            <p className="section-foot">Each line is one photo. When they line up, matching is reliable.{captures.length < 3 ? ' More photos make it more precise.' : ''}</p>
            <div className="photo-grid">
              {captures.map((c, i) => (
                <img key={c.id} src={c.photo} alt={`${item.name}, photo ${i + 1}`} />
              ))}
            </div>
          </div>
        )}
      </Section>

      {captures.length > 0 && captures.length < 3 && <Notice>Two or three photos from slightly different angles make this key much easier to recognize.</Notice>}

      <div className="button-stack">
        <Link className="button is-primary is-block" to={`/property/identify-key?enroll=${item.id}`}>
          Add more photos
        </Link>
        <button type="button" className="button is-danger-quiet" onClick={() => setDeleting(true)}>
          Remove key
        </button>
      </div>

      <Section>
        <Group>
          <Row title="Where to get it cut" sub={whereToCut(item.key.type)} />
        </Group>
      </Section>

      {editing && (
        <KeyDetailsSheet
          title="Edit key"
          rows={rows}
          value={{ name: item.name, notes: item.notes, brand: item.brand, keyway: item.key.keyway, type: item.key.type, blank: item.key.blank, dnd: item.key.flags.dnd, transponder: item.key.flags.transponder }}
          onClose={() => setEditing(false)}
          onSave={saveDetails}
        />
      )}
      {deleting && (
        <Confirm
          title={`Remove ${item.name}?`}
          message="Its photos are removed too. You can undo right after."
          confirmLabel="Remove"
          destructive
          onCancel={() => setDeleting(false)}
          onConfirm={async () => {
            await store.remove('items', item.id);
            navigate('/property/keys', { replace: true });
            toast(`Removed “${item.name}”`, { action: { label: 'Undo', run: () => void store.put('items', item) } });
          }}
        />
      )}
    </Page>
  );
}
