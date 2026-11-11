export interface QueuedToast {
  id: number;
  action?: unknown;
}

/** Append a toast; over the cap, drop the oldest without an Undo-style action (else the oldest). */
export function pushToast<T extends QueuedToast>(list: readonly T[], toast: T, max = 3): T[] {
  const next = [...list, toast];
  if (next.length <= max) return next;
  const drop = next.findIndex((t) => !t.action);
  next.splice(drop === -1 ? 0 : drop, 1);
  return next;
}

export function removeToast<T extends QueuedToast>(list: readonly T[], id: number): T[] {
  return list.filter((t) => t.id !== id);
}
