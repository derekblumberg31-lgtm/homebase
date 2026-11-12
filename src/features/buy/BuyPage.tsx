import { useState } from 'react';
import { useData, useStore } from '../../data/DataProvider';
import { uid } from '../../data/ids';
import type { HomeRecord } from '../../data/types';
import { FormGroup, TextField } from '../../ui/controls';
import { EmptyState, Page, Section } from '../../ui/layout';
import { Sheet, useToast } from '../../ui/overlays';
import { BUY_SUGGESTIONS, BUY_TITLE, filterSizeSuggestion, findBuyRecord, formatBuyList, parseBuyList, type BuyEntry } from './buyList';

/** What to buy: the sizes and colours you look up every time you are in a store, in large type. */
export function BuyPage() {
  const data = useData();
  const store = useStore();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const record = findBuyRecord(data.records);
  const entries = parseBuyList(record?.notes);

  async function save(next: BuyEntry[]) {
    const now = new Date().toISOString();
    const notes = formatBuyList(next) || undefined;
    if (record) await store.put('records', { ...record, notes, updatedAt: now });
    else if (notes) {
      const row: HomeRecord = { id: uid(), kind: 'note', title: BUY_TITLE, notes, fileIds: [], createdAt: now, updatedAt: now };
      await store.put('records', row);
      await store.log('record-added', 'Saved what to buy', '/property/buy');
    }
    setEditing(false);
    toast('Saved');
  }

  return (
    <Page
      title="What to buy"
      subtitle="Sizes and colours to have with you in a store."
      back={{ to: '/property', label: 'Property' }}
      actions={
        entries.length > 0 ? (
          <button type="button" className="button is-quiet" onClick={() => setEditing(true)}>
            Edit
          </button>
        ) : undefined
      }
    >
      {entries.length === 0 ? (
        <Section>
          <EmptyState
            primary
            title="Nothing saved yet"
            body="Save the sizes and colours you always have to look up: furnace filter, light bulbs, paint, batteries."
            action={{ label: 'Add the first one', onClick: () => setEditing(true) }}
          />
        </Section>
      ) : (
        <ul className="buy-list">
          {entries.map((entry, i) => (
            <li key={`${entry.label}-${i}`}>
              {entry.value ? (
                <>
                  <span className="buy-label">{entry.label}</span>
                  <span className="buy-value">{entry.value}</span>
                </>
              ) : (
                <span className="buy-value">{entry.label}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && <BuySheet initial={entries} suggestion={filterSizeSuggestion(data.systems)} onClose={() => setEditing(false)} onSave={save} />}
    </Page>
  );
}

interface Draft {
  key: string;
  label: string;
  value: string;
  fromNotes?: boolean;
}

function BuySheet({ initial, suggestion, onClose, onSave }: { initial: BuyEntry[]; suggestion?: string; onClose: () => void; onSave: (entries: BuyEntry[]) => Promise<void> }) {
  const toast = useToast();
  const [drafts, setDrafts] = useState<Draft[]>(() => (initial.length ? initial.map((e) => ({ ...e, key: uid() })) : [{ key: uid(), label: '', value: '' }]));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const change = (key: string, patch: Partial<Draft>) => setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const used = (label: string) => drafts.some((d) => d.label.trim().toLowerCase() === label.toLowerCase());

  function addLabel(label: string) {
    const prefill = label === 'Furnace filter' ? suggestion : undefined;
    const draft: Draft = { key: uid(), label, value: prefill ?? '', fromNotes: Boolean(prefill) };
    // A blank starter row makes way for the first suggestion.
    setDrafts((list) => (list.length === 1 && !list[0].label.trim() && !list[0].value.trim() ? [draft] : [...list, draft]));
  }

  async function save() {
    const next: Record<string, string> = {};
    for (const d of drafts) if (d.value.trim() && !d.label.trim()) next[d.key] = 'Say what it’s for.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      await onSave(drafts.filter((d) => d.label.trim() || d.value.trim()));
    } catch {
      toast('That wasn’t saved. The device may be out of space.', { tone: 'error' });
      setSaving(false);
    }
  }

  return (
    <Sheet
      title="What to buy"
      onClose={onClose}
      leading={
        <button type="button" className="sheet-action" onClick={onClose}>
          Cancel
        </button>
      }
      trailing={
        <button type="button" className="sheet-action is-strong" onClick={save} disabled={saving}>
          Save
        </button>
      }
    >
      {drafts.map((d) => (
        <div key={d.key} className="buy-entry">
          <FormGroup>
            <TextField label="What it’s for" value={d.label} onChange={(e) => change(d.key, { label: e.target.value })} placeholder="Furnace filter" error={errors[d.key]} />
            <TextField
              label="What to buy"
              value={d.value}
              onChange={(e) => change(d.key, { value: e.target.value, fromNotes: false })}
              placeholder="16x25x1 MERV 8"
              hint={d.fromNotes ? 'From your furnace notes' : undefined}
            />
          </FormGroup>
          <button type="button" className="text-button buy-remove" onClick={() => setDrafts((list) => list.filter((x) => x.key !== d.key))}>
            Remove
          </button>
        </div>
      ))}
      <div className="button-stack">
        <button type="button" className="button is-secondary is-block" onClick={() => setDrafts((list) => [...list, { key: uid(), label: '', value: '' }])}>
          Add another
        </button>
      </div>
      <div className="chips buy-chips" role="group" aria-label="Ideas">
        {BUY_SUGGESTIONS.filter((s) => !used(s)).map((s) => (
          <button key={s} type="button" className="chip" onClick={() => addLabel(s)}>
            {s}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
