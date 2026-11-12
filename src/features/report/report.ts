import type { HomeData } from '../../data/store';
import type { SystemKind } from '../../data/types';
import { formatCurrency, formatDate, toDateInput } from '../../lib/dates';
import { SYSTEM_LABEL, SYSTEM_LIFESPAN } from '../property/labels';

/**
 * Pure builders for the printable Home report. They read only what the homeowner entered. Keys, contacts'
 * phone and email, notes, photos, the Health Check and shut-off locations are never read here.
 */

const NOT_RECORDED = 'Not recorded';
const KIND_ORDER = Object.keys(SYSTEM_LABEL) as SystemKind[];

const warrantyText = (ends: string | undefined, today: string) => (ends ? `${ends < today ? 'Ended' : 'Ends'} ${formatDate(ends)}` : NOT_RECORDED);

export interface ReportSystem {
  name: string;
  brandModel: string;
  installed: string;
  age: string;
  warranty: string;
  serial?: string;
}

export function reportSystems(data: HomeData, now: number, options: { includeSerials?: boolean } = {}): ReportSystem[] {
  const year = new Date(now).getFullYear();
  const today = toDateInput(new Date(now));
  return [...data.systems]
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name))
    .map((system) => {
      const installYear = system.installYear ?? (system.installDate ? Number(system.installDate.slice(0, 4)) : undefined);
      const age = installYear ? year - installYear : undefined;
      const life = SYSTEM_LIFESPAN[system.kind];
      const ends = system.warrantyExpires ?? data.records.find((r) => r.kind === 'warranty' && r.systemId === system.id && r.expiresAt)?.expiresAt;
      const row: ReportSystem = {
        name: system.name,
        brandModel: [system.brand, system.model].filter(Boolean).join(' ') || NOT_RECORDED,
        installed: system.installDate ? formatDate(system.installDate) : installYear ? String(installYear) : NOT_RECORDED,
        age: age === undefined ? 'Unknown' : `${age <= 0 ? 'Under a year' : `${age} ${age === 1 ? 'year' : 'years'}`}${life ? ` (usual life about ${life})` : ''}`,
        warranty: warrantyText(ends, today),
      };
      if (options.includeSerials) row.serial = system.serial || NOT_RECORDED;
      return row;
    });
}

export interface ReportWarranty {
  title: string;
  covers: string;
  /** The end date, for sorting. */
  ends: string;
  endsText: string;
}

export function reportWarranties(data: HomeData, now: number): ReportWarranty[] {
  const today = toDateInput(new Date(now));
  const rows: ReportWarranty[] = [];
  const nameOf = (r: { systemId?: string; itemId?: string }) =>
    data.systems.find((s) => s.id === r.systemId)?.name ?? data.items.find((i) => i.id === r.itemId && i.kind !== 'key')?.name ?? 'Not linked';
  for (const record of data.records) {
    if ((record.kind !== 'warranty' && record.kind !== 'insurance') || !record.expiresAt) continue;
    rows.push({ title: record.title, covers: nameOf(record), ends: record.expiresAt, endsText: warrantyText(record.expiresAt, today) });
  }
  for (const system of data.systems) {
    if (!system.warrantyExpires) continue;
    // The same warranty kept both on the system and as a record is listed once.
    if (data.records.some((r) => r.kind === 'warranty' && r.systemId === system.id && r.expiresAt === system.warrantyExpires)) continue;
    rows.push({ title: `${system.name} warranty`, covers: system.name, ends: system.warrantyExpires, endsText: warrantyText(system.warrantyExpires, today) });
  }
  return rows.sort((a, b) => a.ends.localeCompare(b.ends) || a.title.localeCompare(b.title));
}

export interface ReportJob {
  date: string;
  job: string;
  on: string;
  by: string;
  /** Present only when costs are included and the job has one. */
  cost?: string;
}

export interface ReportYear {
  year: string;
  rows: ReportJob[];
}

export function reportHistory(data: HomeData, options: { includeCosts?: boolean } = {}): ReportYear[] {
  const years = new Map<string, ReportJob[]>();
  for (const event of [...data.serviceEvents].sort((a, b) => b.date.localeCompare(a.date))) {
    const task = data.tasks.find((t) => t.id === event.taskId);
    const system = data.systems.find((s) => s.id === (event.systemId ?? task?.systemId));
    const item = system ? undefined : data.items.find((i) => i.id === (event.itemId ?? task?.itemId) && i.kind !== 'key');
    const row: ReportJob = { date: formatDate(event.date), job: event.title, on: system?.name ?? item?.name ?? '', by: event.provider ?? '' };
    if (options.includeCosts && typeof event.cost === 'number') row.cost = formatCurrency(event.cost);
    const year = event.date.slice(0, 4);
    years.set(year, [...(years.get(year) ?? []), row]);
  }
  return [...years.entries()].map(([year, rows]) => ({ year, rows }));
}
