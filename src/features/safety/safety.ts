import type { HomeData } from '../../data/store';
import type { HomeRecord } from '../../data/types';
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
