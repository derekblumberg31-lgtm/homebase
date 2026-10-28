import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useData } from '../../data/DataProvider';
import type { HomeRecord, RecordKind } from '../../data/types';
import { addDays, formatCurrency, formatDate, toDateInput } from '../../lib/dates';
import { Chips, SearchField } from '../../ui/controls';
import { Plus } from '../../ui/Icons';
import { EmptyState, Group, Page, Row, Section } from '../../ui/layout';
import { useToast } from '../../ui/overlays';
import { EXPIRY_WARNING_DAYS, RECORD_KIND_LABEL } from './labels';
import { RecordForm } from './RecordForm';

/** The start of a note, cut at a word with an ellipsis. */
function preview(text = '', max = 110) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, clean.lastIndexOf(' ', max)).replace(/[,.;:]$/, '')}…`;
}

type Filter = 'all' | 'warranties' | 'paperwork' | 'contractors' | 'notes';

const FILTER_KINDS: Record<Exclude<Filter, 'all'>, RecordKind[]> = {
  warranties: ['warranty', 'insurance'],
  paperwork: ['receipt', 'invoice', 'manual', 'permit', 'inspection', 'other'],
  contractors: ['contractor'],
  notes: ['note'],
};

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'warranties', label: 'Warranties' },
  { value: 'paperwork', label: 'Receipts and manuals' },
  { value: 'contractors', label: 'Contractors' },
  { value: 'notes', label: 'Notes' },
];

/** Records: the Warranty Vault, paperwork, contractors and household notes, plus Service History. */
export function RecordsPage() {
  const data = useData();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const newKind = params.get('new') as RecordKind | null;
  const [adding, setAdding] = useState<RecordKind | null>(newKind);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (newKind) setAdding(newKind);
  }, [newKind]);
  const today = toDateInput();
  const soon = toDateInput(addDays(new Date(), EXPIRY_WARNING_DAYS));
  const itemOf = (id?: string) => data.items.find((i) => i.id === id);

  const records = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...data.records]
      .filter((r) => {
        if (!needle) return true;
        const item = data.items.find((i) => i.id === r.itemId);
        return [r.title, r.vendor, r.notes, r.phone, r.email, item?.name, item?.brand, item?.model, RECORD_KIND_LABEL[r.kind]].some((v) => v?.toLowerCase().includes(needle));
      })
      .sort((a, b) => (b.date ?? b.createdAt).localeCompare(a.date ?? a.createdAt));
  }, [data.records, data.items, query]);

  const byFilter = (f: Exclude<Filter, 'all'>) => records.filter((r) => FILTER_KINDS[f].includes(r.kind));
  const warranties = byFilter('warranties').sort((a, b) => (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999'));
  const expiring = warranties.filter((r) => r.expiresAt && r.expiresAt >= today && r.expiresAt <= soon).length;

  function expirySub(r: HomeRecord) {
    const item = itemOf(r.itemId);
    const end = !r.expiresAt ? 'No end date' : r.expiresAt < today ? `Ended ${formatDate(r.expiresAt)}` : `${r.expiresAt <= soon ? 'Ends soon · ' : 'Ends '}${formatDate(r.expiresAt)}`;
    return [end, item ? [item.brand, item.name].filter(Boolean).join(' ') : null].filter(Boolean).join(' · ');
  }

  function closeForm() {
    setAdding(null);
    if (newKind) setParams({}, { replace: true });
  }

  const sections: { id: Exclude<Filter, 'all'>; title: string; rows: HomeRecord[]; empty: { title: string; body: string; kind: RecordKind; action: string } }[] = [
    {
      id: 'warranties',
      title: 'Warranty Vault',
      rows: warranties,
      empty: { title: 'No warranties yet', body: 'Save warranties and insurance with their end dates. Homebase reminds you two months before one runs out.', kind: 'warranty', action: 'Add a warranty' },
    },
    {
      id: 'paperwork',
      title: 'Receipts, manuals and documents',
      rows: byFilter('paperwork'),
      empty: { title: 'No paperwork filed', body: 'Snap the receipt for a new appliance, or save a manual so the model number is always at hand.', kind: 'receipt', action: 'Add a receipt' },
    },
    {
      id: 'contractors',
      title: 'Contractors',
      rows: byFilter('contractors'),
      empty: { title: 'No contractors saved', body: 'Keep the plumber, electrician and HVAC company you trust, with their numbers, in one place.', kind: 'contractor', action: 'Add a contractor' },
    },
    {
      id: 'notes',
      title: 'Household notes',
      rows: byFilter('notes'),
      empty: { title: 'No notes yet', body: 'Alarm codes, where the shut-off valves are, which breaker runs the garage.', kind: 'note', action: 'Add a note' },
    },
  ];
  const visible = filter === 'all' ? sections : sections.filter((s) => s.id === filter);

  function rowFor(r: HomeRecord) {
    const item = itemOf(r.itemId);
    if (r.kind === 'warranty' || r.kind === 'insurance') return <Row key={r.id} title={r.title} sub={expirySub(r)} wrap to={`/records/${r.id}`} />;
    if (r.kind === 'contractor') return <Row key={r.id} title={r.title} sub={[r.vendor, r.phone].filter(Boolean).join(' · ') || 'Add a phone number'} wrap to={`/records/${r.id}`} />;
    if (r.kind === 'note') return <Row key={r.id} title={r.title} sub={preview(r.notes) || 'Empty note'} wrap to={`/records/${r.id}`} />;
    return (
      <Row
        key={r.id}
        title={r.title}
        sub={[RECORD_KIND_LABEL[r.kind], r.date ? formatDate(r.date) : null, item?.name ?? r.vendor].filter(Boolean).join(' · ')}
        value={r.amount != null ? formatCurrency(r.amount) : undefined}
        wrap
        to={`/records/${r.id}`}
      />
    );
  }

  return (
    <Page
      title="Records"
      subtitle={data.records.length ? `${data.records.length} ${data.records.length === 1 ? 'record' : 'records'}${expiring ? ` · ${expiring} ending soon` : ''}` : 'Warranties, receipts, manuals, contractors and notes'}
      profile
      actions={
        <button type="button" className="round-button" aria-label="Add a record" onClick={() => setAdding('warranty')}>
          <Plus size={20} />
        </button>
      }
    >
      {data.records.length === 0 ? (
        <div className="section">
          <EmptyState
            title="Keep your home’s paperwork in one place"
            body="Start with the documents you’d hunt for in an emergency: the water heater warranty, the furnace manual, the plumber’s number."
            action={{ label: 'Add a warranty', onClick: () => setAdding('warranty') }}
            secondary={{ label: 'Save a contractor', onClick: () => setAdding('contractor') }}
          />
        </div>
      ) : (
        <>
          <div className="section records-tools">
            <Chips label="Show" value={filter} onChange={setFilter} options={FILTERS} />
            {data.records.length >= 6 && <SearchField value={query} onChange={setQuery} label="Search records" placeholder="Search by name, appliance, company or note" />}
          </div>

          {visible.map((section) =>
            section.rows.length === 0 && filter === 'all' && !query ? (
              <Section key={section.id} title={section.title}>
                <div className="group">
                  <div className="inline-empty">
                    <p>{section.empty.body}</p>
                    <button type="button" className="text-button" onClick={() => setAdding(section.empty.kind)}>
                      {section.empty.action}
                    </button>
                  </div>
                </div>
              </Section>
            ) : section.rows.length === 0 ? (
              <Section key={section.id} title={section.title}>
                <EmptyState
                  inline
                  title={query ? `Nothing here matches “${query}”` : section.empty.title}
                  body={query ? 'Try a shorter word, a brand or an appliance name.' : section.empty.body}
                  action={query ? undefined : { label: section.empty.action, onClick: () => setAdding(section.empty.kind) }}
                />
              </Section>
            ) : (
              <Section key={section.id} title={section.title} aside={String(section.rows.length)}>
                <Group>{section.rows.map(rowFor)}</Group>
              </Section>
            ),
          )}
        </>
      )}

      <Section title="Service History">
        <Group>
          <Row
            title="Everything done around the home"
            sub={data.serviceEvents.length ? `${data.serviceEvents.length} ${data.serviceEvents.length === 1 ? 'job' : 'jobs'} recorded` : 'Filled in as you mark tasks done'}
            to="/records/service-history"
          />
        </Group>
        {data.items.some((i) => i.kind === 'appliance') && (
          <p className="section-foot">
            Appliance model and serial numbers live in <Link to="/property/inventory">Home Inventory</Link>. Link a record to an appliance to see both together.
          </p>
        )}
      </Section>

      {adding && (
        <RecordForm
          key={adding}
          draft={{ kind: adding, itemId: params.get('itemId') ?? undefined }}
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
