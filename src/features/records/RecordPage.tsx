import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData, useStore } from '../../data/DataProvider';
import type { StoredFile } from '../../data/types';
import { formatCurrency, formatDate, toDateInput } from '../../lib/dates';
import { formatBytes } from '../../lib/images';
import { EmptyState, Group, Page, Row, Section, Skeleton } from '../../ui/layout';
import { Mail, Phone } from '../../ui/Icons';
import { Confirm, useToast } from '../../ui/overlays';
import { RECORD_KIND_LABEL } from './labels';
import { RecordForm } from './RecordForm';

function useFiles(ids: string[]) {
  const store = useStore();
  const [files, setFiles] = useState<StoredFile[] | null>(null);
  const key = ids.join(',');
  useEffect(() => {
    let live = true;
    void Promise.all(ids.map((id) => store.getFile(id))).then((list) => live && setFiles(list.filter((f): f is StoredFile => Boolean(f))));
    return () => {
      live = false;
    };
    // `key` stands in for the ids array so a new array with the same ids doesn't refetch.
  }, [key, store]);
  return files;
}

export function RecordPage() {
  const { recordId } = useParams();
  const data = useData();
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const record = data.records.find((r) => r.id === recordId);
  const files = useFiles(record?.fileIds ?? []);

  if (!record) {
    return (
      <Page title="Record" back={{ to: '/records', label: 'Records' }}>
        <div className="section">
          <EmptyState title="This record isn’t here" body="It may have been deleted." action={{ label: 'Back to Records', to: '/records' }} />
        </div>
      </Page>
    );
  }

  const item = data.items.find((i) => i.id === record.itemId);
  const today = toDateInput();

  function open(file: StoredFile) {
    const url = URL.createObjectURL(file.data);
    window.open(url, '_blank', 'noopener');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <Page title={record.title} subtitle={RECORD_KIND_LABEL[record.kind]} back={{ to: '/records', label: 'Records' }} actions={<button type="button" className="button is-quiet" onClick={() => setEditing(true)}>Edit</button>}>
      <Section>
        <Group>
          {record.date && <Row title={record.kind === 'warranty' ? 'Starts' : 'Date'} value={formatDate(record.date)} />}
          {record.expiresAt && <Row title={record.expiresAt < today ? 'Ended' : 'Ends'} value={formatDate(record.expiresAt)} />}
          {record.vendor && <Row title={record.kind === 'contractor' ? 'Trade' : 'From'} value={record.vendor} />}
          {record.amount != null && <Row title="Amount" value={formatCurrency(record.amount)} />}
          {!record.date && !record.expiresAt && !record.vendor && record.amount == null && !record.phone && !record.email && record.kind !== 'note' && (
            <Row title="No details yet" sub={record.kind === 'contractor' ? 'Add their trade, phone and email with Edit.' : 'Add dates, the seller and the amount with Edit.'} wrap />
          )}
        </Group>
      </Section>

      {(record.phone || record.email) && (
        <Section title="Contact">
          <div className="group">
            {record.phone && (
              <a className="row" href={`tel:${record.phone.replace(/[^\d+]/g, '')}`}>
                <span className="row-lead"><Phone size={18} /></span>
                <span className="row-main"><span className="row-title">{record.phone}</span><span className="row-sub">Call</span></span>
              </a>
            )}
            {record.email && (
              <a className="row" href={`mailto:${record.email}`}>
                <span className="row-lead"><Mail size={18} /></span>
                <span className="row-main"><span className="row-title">{record.email}</span><span className="row-sub">Email</span></span>
              </a>
            )}
          </div>
        </Section>
      )}

      {item && (
        <Section title="Covers" aside={<Link to={`/property/items/${item.id}`}>Open item</Link>}>
          <Group>
            <Row title={item.name} sub={[item.brand, item.model].filter(Boolean).join(' ') || 'Add the brand and model in Home Inventory'} wrap to={`/property/items/${item.id}`} />
            {item.serial && <Row title="Serial number" value={item.serial} />}
            {item.purchaseDate && <Row title="Bought" value={formatDate(item.purchaseDate)} />}
          </Group>
        </Section>
      )}

      {record.notes && (
        <Section title={record.kind === 'note' ? 'Note' : 'Notes'}>
          <div className="group note-card">{record.notes}</div>
        </Section>
      )}

      <Section title="Files">
        {files === null ? (
          <Skeleton rows={1} label="Loading files" />
        ) : files.length === 0 ? (
          <div className="group">
            <EmptyState inline title="No files attached" body="Add a photo or PDF of the document with Edit." />
          </div>
        ) : (
          <>
            {files.some((f) => f.type.startsWith('image/')) && (
              <div className="photo-grid">
                {files.filter((f) => f.type.startsWith('image/')).map((f) => (
                  <FileImage key={f.id} file={f} />
                ))}
              </div>
            )}
            <div className="section">
              <Group>
                {files.map((f) => (
                  <Row key={f.id} title={f.name} sub={formatBytes(f.size)} onClick={() => open(f)} chevron />
                ))}
              </Group>
            </div>
          </>
        )}
      </Section>

      <div className="button-stack">
        <button type="button" className="button is-danger-quiet" onClick={() => setDeleting(true)}>
          Delete record
        </button>
      </div>

      {editing && (
        <RecordForm
          record={record}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            toast('Saved');
          }}
        />
      )}
      {deleting && (
        <Confirm
          title="Delete this record?"
          message="Its attached files are deleted too. This can’t be undone."
          confirmLabel="Delete"
          destructive
          onCancel={() => setDeleting(false)}
          onConfirm={async () => {
            for (const id of record.fileIds) await store.removeFile(id);
            await store.remove('records', record.id);
            navigate('/records', { replace: true });
            toast(`${record.title} deleted`);
          }}
        />
      )}
    </Page>
  );
}

function FileImage({ file }: { file: StoredFile }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(file.data);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url ? <img src={url} alt={file.name} /> : null;
}
