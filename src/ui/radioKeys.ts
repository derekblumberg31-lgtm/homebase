/**
 * Where an arrow key sends focus in a radio group, as native radios do: forward or back by one,
 * wrapping at the ends. Starts from the focused choice, not the selected one, so the first press
 * moves on even when nothing is selected yet. Returns null for any other key.
 */
export function nextRadioIndex(key: string, focused: number, count: number): number | null {
  if (count <= 0) return null;
  const step = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0;
  if (!step) return null;
  const from = focused < 0 ? 0 : focused;
  return (from + step + count) % count;
}

/** Which choice takes Tab: the selected one, or the first when none is selected. */
export function radioTabIndex(selected: number): number {
  return Math.max(selected, 0);
}
