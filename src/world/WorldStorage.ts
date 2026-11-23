import type { ChunkDiff } from './World';

export const DB_NAME = 'MinecraftWebDB';
const DB_VERSION = 1;
const META_STORE = 'meta';
const DIFF_STORE = 'chunk_diffs';
const META_KEY = 'world';

export interface SavedPlayer {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  mode: 'survival' | 'fly';
  hotbarIndex: number;
}

export interface WorldMeta {
  seed: string;
  player: SavedPlayer;
  savedAt: number;
}

interface DiffRecord {
  key: string;
  /** Parallel arrays: local flat index and block id. */
  indices: Uint16Array;
  ids: Uint8Array;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/**
 * Thin promise wrapper around IndexedDB. Stores world meta (seed + player) and
 * sparse per-chunk block diffs. Degrades to a no-op when IndexedDB is unavailable.
 */
export class WorldStorage {
  private db: IDBDatabase | null = null;
  readonly available: boolean;

  constructor() {
    this.available = typeof indexedDB !== 'undefined';
  }

  async open(): Promise<boolean> {
    if (!this.available) return false;
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
        if (!db.objectStoreNames.contains(DIFF_STORE)) db.createObjectStore(DIFF_STORE, { keyPath: 'key' });
      };
      this.db = await req(request);
      return true;
    } catch {
      this.db = null;
      return false;
    }
  }

  async loadMeta(): Promise<WorldMeta | null> {
    if (!this.db) return null;
    const tx = this.db.transaction(META_STORE, 'readonly');
    const value: unknown = await req(tx.objectStore(META_STORE).get(META_KEY));
    return isWorldMeta(value) ? value : null;
  }

  async saveMeta(meta: WorldMeta): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put(meta, META_KEY);
    await txDone(tx);
  }

  async loadAllDiffs(): Promise<Map<string, ChunkDiff>> {
    const out = new Map<string, ChunkDiff>();
    if (!this.db) return out;
    const tx = this.db.transaction(DIFF_STORE, 'readonly');
    const records: unknown = await req(tx.objectStore(DIFF_STORE).getAll());
    if (!Array.isArray(records)) return out;
    for (const r of records) {
      if (!isDiffRecord(r)) continue;
      const diff: ChunkDiff = new Map();
      for (let i = 0; i < r.indices.length; i++) diff.set(r.indices[i], r.ids[i]);
      out.set(r.key, diff);
    }
    return out;
  }

  /** Write (or overwrite) the diffs of the given chunks in one transaction. */
  async saveDiffs(diffs: Iterable<[string, ChunkDiff]>): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction(DIFF_STORE, 'readwrite');
    const store = tx.objectStore(DIFF_STORE);
    for (const [key, diff] of diffs) {
      const indices = new Uint16Array(diff.size);
      const ids = new Uint8Array(diff.size);
      let i = 0;
      for (const [index, id] of diff) {
        indices[i] = index;
        ids[i] = id;
        i++;
      }
      const record: DiffRecord = { key, indices, ids };
      store.put(record);
    }
    await txDone(tx);
  }

  /** Remove everything (new world). */
  async clearAll(): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction([META_STORE, DIFF_STORE], 'readwrite');
    tx.objectStore(META_STORE).clear();
    tx.objectStore(DIFF_STORE).clear();
    await txDone(tx);
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}

function isWorldMeta(v: unknown): v is WorldMeta {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  const p = o.player as Record<string, unknown> | undefined;
  return (
    typeof o.seed === 'string' &&
    typeof p === 'object' &&
    p !== null &&
    typeof p.x === 'number' &&
    typeof p.y === 'number' &&
    typeof p.z === 'number' &&
    typeof p.yaw === 'number' &&
    typeof p.pitch === 'number' &&
    (p.mode === 'survival' || p.mode === 'fly') &&
    typeof p.hotbarIndex === 'number'
  );
}

function isDiffRecord(v: unknown): v is DiffRecord {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.key === 'string' && o.indices instanceof Uint16Array && o.ids instanceof Uint8Array && o.indices.length === o.ids.length;
}
