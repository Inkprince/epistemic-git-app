/**
 * Minimal promise wrapper over IndexedDB, no dependency. Stores:
 *  - "imports":   user-imported bundles, keyed by case id
 *  - "snapshots": bundle snapshots for history diffs, keyed by digest (LRU-capped by caller)
 * Degrades to a no-op in environments without IndexedDB (SSR smoke test, old browsers).
 */

const DB_NAME = "egit";
const DB_VERSION = 1;
export type StoreName = "imports" | "snapshots";

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolvePromise, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("imports")) db.createObjectStore("imports");
      if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots");
    };
    req.onsuccess = () => resolvePromise(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return openDb().then((db) => {
    if (!db) return undefined;
    return new Promise<T | undefined>((resolvePromise, reject) => {
      const t = db.transaction(store, mode);
      const req = run(t.objectStore(store));
      req.onsuccess = () => resolvePromise(req.result);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
    });
  });
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  return tx<T>(store, "readonly", (s) => s.get(key) as IDBRequest<T>);
}

export async function idbGetAllEntries<T>(store: StoreName): Promise<[string, T][]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolvePromise, reject) => {
    const t = db.transaction(store, "readonly");
    const s = t.objectStore(store);
    const keysReq = s.getAllKeys();
    const valsReq = s.getAll();
    t.oncomplete = () => resolvePromise((keysReq.result as string[]).map((k, i) => [k, valsReq.result[i] as T]));
    t.onerror = () => reject(t.error ?? new Error("IndexedDB getAll failed"));
  });
}

export async function idbPut<T>(store: StoreName, key: string, value: T): Promise<void> {
  await tx(store, "readwrite", (s) => s.put(value, key));
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  await tx(store, "readwrite", (s) => s.delete(key));
}

export async function idbKeys(store: StoreName): Promise<string[]> {
  const keys = await tx<IDBValidKey[]>(store, "readonly", (s) => s.getAllKeys());
  return (keys ?? []).map(String);
}
