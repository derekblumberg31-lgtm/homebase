import type { HomeData } from '../../data/store';
import type { HomeRecord, HomeSystem, Item } from '../../data/types';
import { formatDate, toDateInput } from '../../lib/dates';
import { SYSTEM_LABEL, SYSTEM_LIFESPAN } from '../property/labels';
import { contactsFor, noGas, shutoffLocation, shutoffRecord, telHref } from '../safety/safety';
import { TRADE_LABEL, TRADE_WORDS, type Guide } from './guides';
import { plural } from '../../lib/plural';

/** One thing Homebase already knows that matters for this problem. */
export interface ContextFact {
  label: string;
  text: string;
  href?: string;
  /** Digits to dial, when the fact is somebody to call. */
  tel?: string;
  /** The number as the homeowner typed it, for the accessible name. */
  phoneText?: string;
  /** Who the call goes to: the link text and its accessible name. */
  callName?: string;
  /** A record with a photo of this (a shutoff), shown as "See photo". */
  photoRecordId?: string;
  /** Shown with a warning tone, e.g. a system past its lifespan or a missing shutoff location. */
  warn?: boolean;
}

export interface IssueSubject {
  kind: 'system' | 'item';
  id: string;
  name: string;
}

/** What a guide answer knows about this home, and the targets its actions use. */
export interface IssueContext {
  facts: ContextFact[];
  subject?: IssueSubject;
  contractor?: HomeRecord;
  /** The best warranty or manual on file for the subject, if any. */
  warranty?: { label: string; href: string; found: boolean };
}

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, '');

/** A system or appliance the question names: "my Rheem water heater", "the dishwasher". */
export function findSubject(question: string, data: HomeData, guide?: Guide): { system?: HomeSystem; item?: Item } {
  const q = norm(question);
  const named = (name?: string) => Boolean(name && name.length > 2 && q.includes(norm(name)));
  const system = data.systems.find((s) => named(s.name) || named(s.brand) || named(SYSTEM_LABEL[s.kind]));
  if (system) return { system };
  const item = data.items.find((i) => i.kind !== 'key' && (named(i.name) || named(i.brand)));
  if (item) return { item };
  // Fall back to the guide's own system, when the home has exactly one of that kind.
  const kinds = guide?.systemKinds ?? [];
  const matches = data.systems.filter((s) => kinds.includes(s.kind));
  return matches.length >= 1 && kinds[0] !== 'plumbing' ? { system: matches.find((s) => s.kind === kinds[0]) ?? matches[0] } : {};
}

/** Gas, carbon monoxide and fire: leaving and calling for help is the whole answer, and little else is shown. */
export const isCriticalGuide = (guide: Guide) => Boolean(guide.urgentWhen) && !guide.questions?.length;

function contractorFor(data: HomeData, guide: Guide, linkedId?: string): HomeRecord | undefined {
  if (linkedId) {
    const linked = data.records.find((r) => r.kind === 'contractor' && r.id === linkedId);
    if (linked) return linked;
  }
  if (!guide.trade) return undefined;
  if (guide.trade === 'plumber' || guide.trade === 'electrician' || guide.trade === 'hvac') return contactsFor(data, guide.trade)[0];
  const words = TRADE_WORDS[guide.trade];
  return data.records.find((r) => r.kind === 'contractor' && words.test([r.title, r.vendor, r.notes].filter(Boolean).join(' ')));
}

const dial = (phone?: string) => telHref(phone)?.slice(4);
const photoOf = (data: HomeData, id: 'water-shutoff' | 'electrical-panel' | 'gas-shutoff') => {
  const record = shutoffRecord(data, id);
  return record?.fileIds.length ? record.id : undefined;
};

export function issueContextFor(guide: Guide, question: string, data: HomeData, now: number): IssueContext {
  const facts: ContextFact[] = [];
  const today = toDateInput(new Date(now));
  const year = new Date(now).getFullYear();

  // Where the shutoffs and panel are, for the problems that need them.
  const where = (id: 'water-shutoff' | 'electrical-panel' | 'gas-shutoff', label: string) => {
    const loc = shutoffLocation(data, id);
    facts.push(loc ? { label, text: loc, photoRecordId: photoOf(data, id) } : { label, text: 'Not saved yet. Find it once the problem is under control.', href: '/home/health', warn: true });
  };
  if (guide.id === 'gas-smell') {
    // An emergency shows only what the homeowner saved, never a prompt to save something.
    const loc = noGas(data) ? undefined : shutoffLocation(data, 'gas-shutoff');
    if (loc) facts.push({ label: 'Gas shutoff', text: `${loc}. Only touch it if the gas company or firefighters tell you to.`, photoRecordId: photoOf(data, 'gas-shutoff') });
  } else if (guide.id === 'fire-smoke') {
    const loc = shutoffLocation(data, 'electrical-panel');
    if (loc) facts.push({ label: 'Electrical panel', text: loc, photoRecordId: photoOf(data, 'electrical-panel') });
  } else {
    if (['water-leak', 'frozen-pipes', 'clogged-drain'].includes(guide.id)) where('water-shutoff', 'Main water shutoff');
    if (['water-leak', 'power-out', 'appliance'].includes(guide.id)) where('electrical-panel', 'Electrical panel');
    if (['no-heat', 'no-hot-water'].includes(guide.id) && !noGas(data)) where('gas-shutoff', 'Gas shutoff');
  }

  // The insurer, for the problems where someone is likely to need a claim line.
  let insurerShown = false;
  if (['water-leak', 'fire-smoke'].includes(guide.id) || guide.damage) {
    const insurer = contactsFor(data, 'insurer').find((r) => telHref(r.phone));
    if (insurer) {
      facts.push({ label: 'Home insurance', text: insurer.title, href: `/records/${insurer.id}`, tel: dial(insurer.phone), phoneText: insurer.phone, callName: insurer.title });
      insurerShown = true;
    }
  }
  if (isCriticalGuide(guide)) return { facts };

  const { system, item } = findSubject(question, data, guide);
  let subject: IssueSubject | undefined;
  let warranty: IssueContext['warranty'];

  if (system) {
    subject = { kind: 'system', id: system.id, name: system.name };
    const age = system.installYear ? year - system.installYear : undefined;
    const life = SYSTEM_LIFESPAN[system.kind];
    facts.push({
      label: system.name,
      text: [[system.brand, system.model].filter(Boolean).join(' ') || 'Brand and model not added', system.serial ? `serial ${system.serial}` : null, age !== undefined ? `${plural(age, 'year')} old${life ? ` (usual life about ${life})` : ''}` : 'age unknown']
        .filter(Boolean)
        .join(' · '),
      href: `/property/systems/${system.id}`,
      warn: age !== undefined && life !== undefined && age >= life,
    });
    const record = data.records.find((r) => r.systemId === system.id && (r.kind === 'warranty' || r.kind === 'insurance'));
    const ends = record?.expiresAt ?? system.warrantyExpires;
    if (record || system.warrantyExpires) {
      facts.push({ label: 'Warranty', text: ends ? `${ends < today ? 'Ended' : 'Covered until'} ${formatDate(ends)}${ends >= today ? '. Call the warranty line before paying for a repair.' : ''}` : 'On file, no end date', href: record ? `/records/${record.id}` : `/property/systems/${system.id}` });
      warranty = { label: 'Open the warranty', href: record ? `/records/${record.id}` : `/property/systems/${system.id}`, found: true };
    } else {
      warranty = { label: 'Add its warranty', href: `/records?new=warranty&systemId=${system.id}`, found: false };
    }
    const manual = data.records.find((r) => r.systemId === system.id && r.kind === 'manual');
    if (manual) facts.push({ label: 'Manual', text: manual.title, href: `/records/${manual.id}` });
  } else if (item) {
    subject = { kind: 'item', id: item.id, name: item.name };
    facts.push({
      label: item.name,
      text: [[item.brand, item.model].filter(Boolean).join(' ') || 'Brand and model not added', item.serial ? `serial ${item.serial}` : null, item.purchaseDate ? `bought ${formatDate(item.purchaseDate)}` : null].filter(Boolean).join(' · '),
      href: `/property/items/${item.id}`,
    });
    const record = data.records.find((r) => r.itemId === item.id && (r.kind === 'warranty' || r.kind === 'insurance'));
    if (record) {
      facts.push({ label: 'Warranty', text: record.expiresAt ? `${record.expiresAt < today ? 'Ended' : 'Covered until'} ${formatDate(record.expiresAt)}` : 'On file', href: `/records/${record.id}` });
      warranty = { label: 'Open the warranty', href: `/records/${record.id}`, found: true };
    } else {
      warranty = { label: 'Add its warranty', href: `/records?new=warranty&itemId=${item.id}`, found: false };
    }
    const manual = data.records.find((r) => r.itemId === item.id && r.kind === 'manual');
    if (manual) facts.push({ label: 'Manual', text: manual.title, href: `/records/${manual.id}` });
  } else if (guide.systemKinds?.length && ['heating', 'cooling', 'water-heater'].includes(guide.systemKinds[0])) {
    const kind = guide.systemKinds[0];
    facts.push({ label: SYSTEM_LABEL[kind], text: 'Not in Homebase yet. Adding the brand, model and age helps a technician.', href: `/property/systems?new=${kind}`, warn: false });
  }

  if (!warranty) {
    // No subject: any warranty or insurance policy that might apply.
    const words = (guide.systemKinds ?? []).map((k) => SYSTEM_LABEL[k].toLowerCase().split(' ')[0]);
    const record = data.records.find((r) => (r.kind === 'warranty' || r.kind === 'insurance') && (r.kind === 'insurance' ? guide.damage : words.some((w) => r.title.toLowerCase().includes(w))));
    warranty = record ? { label: `Open ${record.title}`, href: `/records/${record.id}`, found: true } : { label: 'Find a warranty', href: '/records?show=warranties', found: false };
    if (record?.kind === 'insurance' && !insurerShown) facts.push({ label: 'Insurance', text: record.title, href: `/records/${record.id}` });
  }

  const contractor = contractorFor(data, guide, system?.contractorId ?? item?.contractorId);
  if (contractor) facts.push({ label: 'Your contractor', text: [contractor.title, contractor.phone].filter(Boolean).join(' · '), href: `/records/${contractor.id}`, tel: dial(contractor.phone), phoneText: contractor.phone, callName: contractor.title });
  else if (guide.trade && guide.trade !== 'general') facts.push({ label: TRADE_LABEL[guide.trade], text: 'None saved yet. Save the one you call, so it’s here next time.', warn: false });

  // When this was last dealt with.
  const past = data.serviceEvents
    .filter((e) => (system && e.systemId === system.id) || (item && e.itemId === item.id) || norm(e.title) === norm(`Resolved: ${guide.title}`))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (past) facts.push({ label: 'Last time', text: `${past.title}, ${formatDate(past.date)}${past.provider ? ` by ${past.provider}` : ''}`, href: '/records/service-history' });

  return { facts, subject, contractor, warranty };
}
