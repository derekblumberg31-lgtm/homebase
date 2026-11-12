import type { HomeData } from '../../data/store';
import type { HomeRecord } from '../../data/types';
import { TRADE_WORDS, type Trade } from '../assistant/guides';
import { STARTER_STEPS, type StarterStepId } from '../home/starter';

/** The three places to turn something off, using the Health Check step ids. */
export const SHUTOFFS: { id: StarterStepId; label: string }[] = [
  { id: 'water-shutoff', label: 'Main water shutoff' },
  { id: 'gas-shutoff', label: 'Gas shutoff' },
  { id: 'electrical-panel', label: 'Electrical panel' },
];

/** The household note that holds a shutoff or panel location, matched the way saveLocation writes it. */
export function shutoffRecord(data: HomeData, id: StarterStepId): HomeRecord | undefined {
  const def = STARTER_STEPS.find((s) => s.id === id);
  if (def?.action.type !== 'locate') return undefined;
  const title = def.action.noteTitle.toLowerCase();
  return data.records.find((r) => r.kind === 'note' && r.title.toLowerCase().startsWith(title));
}

/**
 * Where the homeowner said a shutoff or panel is. The note in Records wins when it exists, so an
 * edit made there is what the Assistant shows; the Health Check step's copy is only the fallback.
 */
export function shutoffLocation(data: HomeData, id: StarterStepId): string | undefined {
  return shutoffRecord(data, id)?.notes || data.settings.healthSteps?.[id]?.note || undefined;
}

export type ContactRole = 'plumber' | 'electrician' | 'hvac' | 'insurer';

/** Who to ring, by role. A trade role finds contractor records; the insurer finds insurance records. */
export const CONTACT_ROLES: { role: ContactRole; label: string }[] = [
  { role: 'plumber', label: 'Plumber' },
  { role: 'electrician', label: 'Electrician' },
  { role: 'hvac', label: 'Heating and cooling' },
  { role: 'insurer', label: 'Home insurance' },
];

/** The trade name a new contact for this role starts with. Only trades have one. */
export const ROLE_VENDOR: Partial<Record<ContactRole, string>> = { plumber: 'Plumber', electrician: 'Electrician', hvac: 'HVAC' };

/** Saved contacts for a role, ones with a phone number first, then the most recently updated. */
export function contactsFor(data: HomeData, role: ContactRole): HomeRecord[] {
  const matches =
    role === 'insurer'
      ? data.records.filter((r) => r.kind === 'insurance')
      : data.records.filter((r) => r.kind === 'contractor' && TRADE_WORDS[role as Trade].test([r.vendor, r.title, r.notes].filter(Boolean).join(' ')));
  return [...matches].sort((a, b) => Number(Boolean(telHref(b.phone))) - Number(Boolean(telHref(a.phone))) || b.updatedAt.localeCompare(a.updatedAt));
}

/** `tel:` plus the digits (and a leading +), or nothing when there are fewer than 3 digits to dial. */
export function telHref(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.length < 3) return undefined;
  return `tel:${phone.trim().startsWith('+') ? '+' : ''}${digits}`;
}

/** True when this home has no gas, so there is no gas shutoff to save. */
export function noGas(data: HomeData): boolean {
  return data.settings.hasGas === false || data.settings.healthSteps?.['gas-shutoff']?.state === 'not-applicable';
}

/** How many of the shutoffs that apply to this home have a saved location. */
export function shutoffProgress(data: HomeData): { saved: number; total: number } {
  const applicable = SHUTOFFS.filter((s) => s.id !== 'gas-shutoff' || !noGas(data));
  return { saved: applicable.filter((s) => shutoffLocation(data, s.id)).length, total: applicable.length };
}
