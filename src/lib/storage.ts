/**
 * Asks the browser not to clear Homebase's data when the device runs low on space. This device
 * holds the only copy, so it's worth asking. Browsers may say no; that isn't an error.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = navigator.storage;
    if (!storage?.persist) return false;
    return (await storage.persisted()) || (await storage.persist());
  } catch {
    return false;
  }
}

/** Reads whether the browser has promised to keep the data. Read-only: it never prompts. */
export async function storagePersisted(): Promise<boolean | 'unsupported'> {
  try {
    const storage = navigator.storage;
    if (!storage?.persisted) return 'unsupported';
    return await storage.persisted();
  } catch {
    return 'unsupported';
  }
}
