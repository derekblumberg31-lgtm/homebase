/**
 * Photos being stored for a sheet that hasn't been saved yet. Saves run one after another, and `settled()`
 * waits for any still running, so Save or Cancel always sees every file that was stored, even one picked a moment ago.
 */
export function createAttachQueue(saveOne: (file: File) => Promise<string | undefined>) {
  const ids: string[] = [];
  let pending: Promise<unknown> = Promise.resolve();
  return {
    /** Stores one file; resolves to its id, or undefined when it could not be saved. */
    add(file: File): Promise<string | undefined> {
      const run = pending.then(() => saveOne(file)).then((id) => {
        if (id) ids.push(id);
        return id;
      });
      pending = run.catch(() => undefined);
      return run;
    },
    /** Waits for every save in progress, then returns the ids stored so far. */
    async settled(): Promise<string[]> {
      await pending;
      return [...ids];
    },
    /** Forgets an id the user removed. */
    forget(id: string) {
      const at = ids.indexOf(id);
      if (at >= 0) ids.splice(at, 1);
    },
  };
}
