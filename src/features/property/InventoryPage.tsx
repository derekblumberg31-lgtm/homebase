import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData, useStore } from '../../data/DataProvider';
import { formatCurrency } from '../../lib/dates';
import { SearchField } from '../../ui/controls';
import { EmptyState, Group, Page, Row, Section } from '../../ui/layout';
import { useToast } from '../../ui/overlays';
import { ItemForm } from './ItemForm';
import { ITEM_KIND_LABEL } from './labels';

/** Home Inventory: appliances and belongings with their details, value and paperwork. */
export function InventoryPage() {
  const data = useData();
  const store = useStore();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(params.get('new') === '1');
  const [query, setQuery] = useState('');
  const items = useMemo(() => data.items.filter((i) => i.kind !== 'key').sort((a, b) => a.name.localeCompare(b.name)), [data.items]);
  const shown = query.trim() ? items.filter((i) => [i.name, i.brand ?? '', i.model ?? '', i.serial ?? ''].some((v) => v.toLowerCase().includes(query.trim().toLowerCase()))) : items;
  const total = items.reduce((sum, i) => sum + (i.value ?? 0), 0);
  const roomName = (id?: string) => data.rooms.find((r) => r.id === id)?.name;

  return (
    <Page
      title="Home Inventory"
      subtitle={items.length ? [`${items.length} ${items.length === 1 ? 'item' : 'items'}`, total ? `${formatCurrency(Math.round(total))} recorded value` : null].filter(Boolean).join(' · ') : undefined}
      back={{ to: '/property', label: 'Property' }}
      actions={<button type="button" className="button is-quiet" onClick={() => setAdding(true)}>Add</button>}
    >
      {items.length === 0 ? (
        <div className="section">
          <EmptyState
            title="Nothing in your inventory yet"
            body="Add appliances and valuables with their model and serial numbers. It helps with repairs, warranties and insurance claims."
            action={{ label: 'Add an item', onClick: () => setAdding(true) }}
          />
        </div>
      ) : (
        <>
          {items.length >= 6 && (
            <div className="section">
              <SearchField value={query} onChange={setQuery} label="Search inventory" placeholder="Search by name, brand or serial" />
            </div>
          )}
          <Section>
            <Group>
              {shown.map((item) => (
                <Row
                  key={item.id}
                  title={item.name}
                  sub={[item.kind !== 'other' ? ITEM_KIND_LABEL[item.kind as keyof typeof ITEM_KIND_LABEL] : null, [item.brand, item.model].filter(Boolean).join(' '), roomName(item.roomId)].filter(Boolean).join(' · ') || undefined}
                  value={item.value ? formatCurrency(item.value) : undefined}
                  to={`/property/items/${item.id}`}
                />
              ))}
            </Group>
            {shown.length === 0 && <EmptyState inline title={`Nothing matches “${query.trim()}”`} body="Try a brand or part of the name." />}
          </Section>
        </>
      )}

      {adding && (
        <ItemForm
          draft={{ roomId: params.get('roomId') ?? undefined }}
          onClose={() => {
            setAdding(false);
            if (params.get('new')) setParams({}, { replace: true });
          }}
          onSave={async (item) => {
            await store.put('items', item);
            await store.log('item-added', `Added ${item.name} to Home Inventory`, `/property/items/${item.id}`);
            setAdding(false);
            if (params.get('new')) setParams({}, { replace: true });
            toast(`${item.name} added`);
          }}
        />
      )}
    </Page>
  );
}
