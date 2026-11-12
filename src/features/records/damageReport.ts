import { formatDate, toDateInput } from '../../lib/dates';

/** A prefilled "other" record for documenting damage: photos, what happened, and the claim number. */
export function damageReportHref(what = '') {
  const date = toDateInput();
  const title = `Damage report${what ? `: ${what}` : ''}, ${formatDate(date)}`;
  const notes = ['What happened:', 'When it was noticed:', 'Rooms and items affected:', 'What was done to stop it:', 'Insurance claim number:'].join('\n');
  return `/records?new=other&title=${encodeURIComponent(title)}&notes=${encodeURIComponent(notes)}`;
}
