import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../../data/DataProvider';
import type { RecordKind } from '../../data/types';
import { addDays, formatCurrency, formatDate, toDateInput } from '../../lib/dates';
import { SearchField } from '../../ui/controls';
import { Plus } from '../../ui/Icons';
import { EmptyState, Group, Page, Row, Section } from '../../ui/layout';
import { useToast } from '../../ui/overlays';
import { EXPIRY_WARNING_DAYS, RECORD_KIND_LABEL } from './labels';
import { RecordForm } from './RecordForm';

/** Records: the Warranty Vault, everything else filed by kind, and Service History. */
export function RecordsPage() {
  const data = useData();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const newKind = params.get('new') as RecordKind | null;
  const [adding, setAdding] = useState(Boolean(newKind));
  const [query, setQuery] = useState('');
  const today = toDateInput();
  const soon = toDateInput(addDays(new Date(), EXPIRY_WARNING_DAYS));

  const records = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...data.records]
      .filter((r) => !needle || [r.title, r.vendor ?? '', r.notes ?? '', RECORD_KIND_LABEL[r.kind]].some((v) => v.toLowerCase().includes(needle)))
      .sort((a, b) => (b.date ?? b.createdAt).localeCompare(a.date ?? a.createdAt));
  }, [data.records, query]);

  const warranties = records.filter((r) => r.kind === 'warranty' || r.kind === 'insurance');
  const others = records.filter((r) => r.kind !== 'warranty' && r.kind !== 'insurance');
  const expiring = warranties.filter((r) => r.expiresAt && r.expiresAt >= today && r.expiresAt <= soon).length;
  const itemName = (id?: string) => data.items.find((i) => i.id === id)?.name;

  function expirySub(expiresAt?: string) {
    if (!expiresAt) return 'No end date';
    if (expiresAt < today) return `Expired ${formatDate(expiresAt)}`;
    return `${expiresAt <= soon ? 'Ends soon · ' : 'Ends '}${formatDate(expiresAt)}`;
  }

  function closeForm() {
    setAdding(false);
    if (newKind) setParams({}, { replace: true });
  }

  return (
    <Page
      title="Records"
      subtitle={data.records.length ? `${data.records.length} ${data.records.length === 1 ? 'record' : 'records'}${expiring ? ` · ${expiring} ending soon` : ''}` : undefined}
      profile
      actions={
        <button type="button" className="round-button" aria-label="Add a record" onClick={() => setAdding(true)}>
          <Plus size={20} />
        </button>
      }
    >
      {data.records.length >= 6 && (
        <div className="section">
          <SearchField value={query} onChange={setQuery} label="Search records" placeholder="Search warranties, receipts, manuals" />
        </div>
      )}

      <Section title="Warranty Vault" aside={warranties.length ? String(warranties.length) : undefined}>
        {warranties.length === 0 ? (
          <EmptyState
            title={query ? 'No warranties match' : 'No warranties yet'}
            body="Add warranties and insurance with their end dates. Homebase reminds you two months before one runs out."
            action={query ? undefined : { label: 'Add a warranty', onClick: () => setAdding(true) }}
          />
        ) : (
          <Group>
            {warranties.map((r) => (
              <Row key={r.id} title={r.title} sub={[expirySub(r.expiresAt), itemName(r.itemId)].filter(Boolean).join(' · ')} to={`/records/${r.id}`} />
            ))}
          </Group>
        )}
      </Section>

      <Section title="Receipts, manuals and paperwork" aside={others.length ? String(others.length) : undefined}>
        {others.length === 0 ? (
          <div className="group">
            <EmptyState inline title="Nothing filed yet" body="Keep receipts, invoices, manuals, permits and inspection reports here, with photos or PDFs." />
          </div>
        ) : (
          <Group>
            {others.map((r) => (
              <Row
                key={r.id}
                title={r.title}
                sub={[RECORD_KIND_LABEL[r.kind], r.date ? formatDate(r.date) : null, r.vendor].filter(Boolean).join(' · ')}
                value={r.amount != null ? formatCurrency(r.amount) : undefined}
                to={`/records/${r.id}`}
              />
            ))}
          </Group>
        )}
      </Section>

      <Section title="Service History">
        <Group>
          <Row title="Everything done around the home" sub={data.serviceEvents.length ? `${data.serviceEvents.length} ${data.serviceEvents.length === 1 ? 'visit' : 'visits'} recorded` : 'Filled in as you mark tasks done'} to="/records/service-history" />
        </Group>
      </Section>

      {adding && (
        <RecordForm
          draft={{ kind: newKind ?? undefined, itemId: params.get('itemId') ?? undefined }}
          onClose={closeForm}
          onSaved={(r) => {
            closeForm();
            toast(`${r.title} saved`);
          }}
        />
      )}
    </Page>
  );
}
