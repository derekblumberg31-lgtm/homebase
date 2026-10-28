import type { ItemKind, PropertyType, SystemKind } from '../../data/types';

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  house: 'House',
  townhouse: 'Townhouse',
  condo: 'Condo',
  apartment: 'Apartment',
  other: 'Home',
};

export const SYSTEM_LABEL: Record<SystemKind, string> = {
  heating: 'Heating',
  cooling: 'Cooling',
  'water-heater': 'Water heater',
  plumbing: 'Plumbing',
  electrical: 'Electrical panel',
  roof: 'Roof',
  windows: 'Windows',
  security: 'Security and alarms',
  other: 'Other system',
};

/** Typical service life in years, used for gentle "getting older" reminders on Home. */
export const SYSTEM_LIFESPAN: Partial<Record<SystemKind, number>> = {
  heating: 18,
  cooling: 15,
  'water-heater': 10,
  roof: 22,
  windows: 25,
  electrical: 35,
};

export const ITEM_KIND_LABEL: Record<Exclude<ItemKind, 'key'>, string> = {
  appliance: 'Appliance',
  electronics: 'Electronics',
  furniture: 'Furniture',
  tool: 'Tool',
  other: 'Other',
};
