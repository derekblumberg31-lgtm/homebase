import type { RecordKind } from '../../data/types';

export const RECORD_KIND_LABEL: Record<RecordKind, string> = {
  warranty: 'Warranty',
  receipt: 'Receipt',
  invoice: 'Invoice',
  manual: 'Manual',
  permit: 'Permit',
  inspection: 'Inspection',
  insurance: 'Insurance',
  contractor: 'Contractor',
  note: 'Household note',
  other: 'Document',
};

/** Kinds that usually have an end date worth a reminder. */
export const EXPIRING_KINDS: RecordKind[] = ['warranty', 'insurance', 'permit'];

export const EXPIRY_WARNING_DAYS = 60;
