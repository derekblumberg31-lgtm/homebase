import type { Database } from './db';
import type {
  Activity,
  ActivityKind,
  HomeRecord,
  HomeSystem,
  Household,
  Item,
  Property,
  Room,
  ServiceEvent,
  Settings,
  StoredFile,
  Task,
} from './types';
import { uid } from './ids';

/** Everything the screens read, held in memory. Files are loaded on demand. */
export interface HomeData {
  household?: Household;
  property?: Property;
  settings: Settings;
  rooms: Room[];
  systems: HomeSystem[];
  items: Item[];
  tasks: Task[];
  serviceEvents: ServiceEvent[];
  records: HomeRecord[];
  activity: Activity[];
}

type Collection = 'rooms' | 'systems' | 'items' | 'tasks' | 'serviceEvents' | 'records' | 'activity';
type RowOf<C extends Collection> = HomeData[C][number];

const ACTIVITY_LIMIT = 200;

export function defaultSettings(): Settings {
  return { id: 'settings', theme: 'system', reminders: false, dismissedTips: [], keyDebug: false };
}

export function emptyData(): HomeData {
  return {
    settings: defaultSettings(),
    rooms: [],
    systems: [],
    items: [],
    tasks: [],
    serviceEvents: [],
    records: [],
    activity: [],
  };
}

/**
 * The single source of truth for Homebase's data. Writes go to IndexedDB first, then the in-memory
 * snapshot is replaced (never mutated) and subscribers are told, so React re-renders only on change.
 */
export class HomeStore {
  private data: HomeData = emptyData();
  private listeners = new Set<() => void>();

  constructor(private db: Database) {}

  async load(): Promise<void> {
    const [meta, rooms, systems, items, tasks, serviceEvents, records, activity] = await Promise.all([
      this.db.all<Household | Property | Settings>('meta'),
      this.db.all<Room>('rooms'),
      this.db.all<HomeSystem>('systems'),
      this.db.all<Item>('items'),
      this.db.all<Task>('tasks'),
      this.db.all<ServiceEvent>('serviceEvents'),
      this.db.all<HomeRecord>('records'),
      this.db.all<Activity>('activity'),
    ]);
    const byId = new Map(meta.map((row) => [row.id, row]));
    this.data = {
      household: byId.get('household') as Household | undefined,
      property: byId.get('property') as Property | undefined,
      settings: { ...defaultSettings(), ...(byId.get('settings') as Settings | undefined) },
      rooms,
      systems,
      items,
      tasks,
      serviceEvents,
      records,
      activity: activity.sort((a, b) => b.at.localeCompare(a.at)),
    };
    this.emit();
  }

  getSnapshot = (): HomeData => this.data;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit() {
    for (const listener of this.listeners) listener();
  }

  private set(patch: Partial<HomeData>) {
    this.data = { ...this.data, ...patch };
    this.emit();
  }

  // ---------- singletons ----------

  async saveHousehold(household: Household) {
    await this.db.put('meta', household);
    this.set({ household });
  }

  async saveProperty(property: Omit<Property, 'id' | 'updatedAt'>) {
    const row: Property = { ...property, id: 'property', updatedAt: new Date().toISOString() };
    await this.db.put('meta', row);
    this.set({ property: row });
  }

  async updateSettings(patch: Partial<Omit<Settings, 'id'>>) {
    const settings: Settings = { ...this.data.settings, ...patch, id: 'settings' };
    await this.db.put('meta', settings);
    this.set({ settings });
  }

  // ---------- collections ----------

  async put<C extends Collection>(collection: C, row: RowOf<C>) {
    await this.db.put(collection, row);
    const list = this.data[collection] as RowOf<C>[];
    const next = list.some((existing) => existing.id === row.id)
      ? list.map((existing) => (existing.id === row.id ? row : existing))
      : [...list, row];
    this.set({ [collection]: next } as Partial<HomeData>);
  }

  async putMany<C extends Collection>(collection: C, rows: RowOf<C>[]) {
    if (rows.length === 0) return;
    await this.db.putMany(collection, rows);
    const incoming = new Map(rows.map((row) => [row.id, row]));
    const list = this.data[collection] as RowOf<C>[];
    const kept = list.filter((existing) => !incoming.has(existing.id));
    this.set({ [collection]: [...kept, ...rows] } as Partial<HomeData>);
  }

  async remove<C extends Collection>(collection: C, id: string) {
    await this.db.remove(collection, id);
    const list = this.data[collection] as RowOf<C>[];
    this.set({ [collection]: list.filter((row) => row.id !== id) } as Partial<HomeData>);
  }

  async log(kind: ActivityKind, text: string, href?: string) {
    const entry: Activity = { id: uid(), at: new Date().toISOString(), kind, text, href };
    await this.db.put('activity', entry);
    const activity = [entry, ...this.data.activity];
    const dropped = activity.slice(ACTIVITY_LIMIT);
    for (const old of dropped) await this.db.remove('activity', old.id);
    this.set({ activity: activity.slice(0, ACTIVITY_LIMIT) });
  }

  // ---------- files (attachments) ----------

  async saveFile(file: File | Blob, name = 'file'): Promise<StoredFile> {
    const row: StoredFile = {
      id: uid(),
      name: file instanceof File ? file.name : name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      data: file,
      createdAt: new Date().toISOString(),
    };
    await this.db.put('files', row);
    return row;
  }

  getFile(id: string) {
    return this.db.get<StoredFile>('files', id);
  }

  removeFile(id: string) {
    return this.db.remove('files', id);
  }

  allFiles() {
    return this.db.all<StoredFile>('files');
  }

  /** Remove everything on this device. */
  async eraseAll() {
    for (const store of ['meta', 'rooms', 'systems', 'items', 'tasks', 'serviceEvents', 'records', 'files', 'activity'] as const) {
      await this.db.clear(store);
    }
    this.data = emptyData();
    this.emit();
  }

  /** Replace everything with a restored backup in one pass. */
  async replaceAll(data: HomeData, files: StoredFile[]) {
    await this.eraseAll();
    const meta = [data.household, data.property, data.settings].filter(Boolean) as (Household | Property | Settings)[];
    await this.db.putMany('meta', meta);
    for (const collection of ['rooms', 'systems', 'items', 'tasks', 'serviceEvents', 'records', 'activity'] as const) {
      await this.db.putMany(collection, data[collection] as unknown[]);
    }
    await this.db.putMany('files', files);
    await this.load();
  }
}
