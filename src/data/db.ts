import { STORES, type StoreName } from './types';

/**
 * One IndexedDB database for everything Homebase keeps. Each schema version adds its changes in
 * MIGRATIONS; IndexedDB runs every step between the stored version and DB_VERSION in order.
 */
export const DB_NAME = 'homebase';
export const DB_VERSION = 1;

type Migration = (db: IDBDatabase) => void;

const MIGRATIONS: Record<number, Migration> = {
  1: (db) => {
    for (const name of STORES) {
      if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
    }
  },
};

let opening: Promise<IDBDatabase> | null = null;

export function openDatabase(name = DB_NAME): Promise<IDBDatabase> {
  if (opening && name === DB_NAME) return opening;
  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      for (let version = event.oldVersion + 1; version <= DB_VERSION; version += 1) {
        MIGRATIONS[version]?.(db);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other Homebase tabs to finish updating.'));
  });
  if (name === DB_NAME) opening = promise;
  return promise;
}

function run<T>(db: IDBDatabase, store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = fn(tx.objectStore(store));
    let result: T;
    if (request) request.onsuccess = () => (result = request.result as T);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('The change was not saved.'));
  });
}

export interface Database {
  all<T>(store: StoreName): Promise<T[]>;
  get<T>(store: StoreName, id: string): Promise<T | undefined>;
  put<T>(store: StoreName, value: T): Promise<void>;
  putMany<T>(store: StoreName, values: T[]): Promise<void>;
  remove(store: StoreName, id: string): Promise<void>;
  clear(store: StoreName): Promise<void>;
}

export async function createDatabase(name = DB_NAME): Promise<Database> {
  const db = await openDatabase(name);
  return {
    all: <T>(store: StoreName) => run<T[]>(db, store, 'readonly', (s) => s.getAll()).then((rows) => rows ?? []),
    get: <T>(store: StoreName, id: string) => run<T | undefined>(db, store, 'readonly', (s) => s.get(id)),
    put: (store, value) => run<void>(db, store, 'readwrite', (s) => s.put(value)),
    putMany: (store, values) =>
      run<void>(db, store, 'readwrite', (s) => {
        for (const value of values) s.put(value);
      }),
    remove: (store, id) => run<void>(db, store, 'readwrite', (s) => s.delete(id)),
    clear: (store) => run<void>(db, store, 'readwrite', (s) => s.clear()),
  };
}
