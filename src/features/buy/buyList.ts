import type { HomeRecord, HomeSystem } from '../../data/types';

export interface BuyEntry {
  label: string;
  value: string;
}

/** The note that holds the list is found by this exact title, ignoring case and spacing. */
export const BUY_TITLE = 'What to buy';

/** Labels the edit sheet offers. They add the label only: the value is always typed by the homeowner. */
export const BUY_SUGGESTIONS = ['Furnace filter', 'Light bulbs', 'Paint', 'Smoke alarm batteries', 'Fridge water filter', 'Air purifier filter', 'Vacuum bags'];

export function findBuyRecord(records: HomeRecord[]): HomeRecord | undefined {
  return records.find((r) => r.kind === 'note' && r.title.trim().toLowerCase() === BUY_TITLE.toLowerCase());
}

/** One entry per line, split on the first colon. A line with no colon is a label on its own. Blank lines are dropped. */
export function parseBuyList(notes: string | undefined): BuyEntry[] {
  return (notes ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf(':');
      return at < 0 ? { label: line, value: '' } : { label: line.slice(0, at).trim(), value: line.slice(at + 1).trim() };
    });
}

export function formatBuyList(entries: BuyEntry[]): string {
  return entries
    .map((e) => ({ label: e.label.trim(), value: e.value.trim() }))
    .filter((e) => e.label || e.value)
    .map((e) => (e.value ? `${e.label}: ${e.value}` : e.label))
    .join('\n');
}

const SIZE = /\d{1,2}\s?[x×]\s?\d{1,2}\s?[x×]\s?\d(\.\d+)?/i;

/** A filter size written in a heating or cooling system's notes ("16 x 25 x 1"), offered as a suggestion only. */
export function filterSizeFrom(text: string | undefined): string | undefined {
  return text?.match(SIZE)?.[0];
}

export function filterSizeSuggestion(systems: HomeSystem[]): string | undefined {
  for (const system of systems) {
    if (system.kind !== 'heating' && system.kind !== 'cooling') continue;
    const size = filterSizeFrom(system.notes);
    if (size) return size;
  }
  return undefined;
}
