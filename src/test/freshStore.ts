import { createDatabase } from '../data/db';
import { HomeStore } from '../data/store';

let count = 0;

// A loaded HomeStore on its own empty fake-indexeddb database, so tests never share data.
export async function freshStore(): Promise<HomeStore> {
  count += 1;
  const store = new HomeStore(await createDatabase(`homebase-shared-test-${count}-${Date.now()}`));
  await store.load();
  return store;
}
