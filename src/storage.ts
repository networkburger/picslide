// Photos the parent has imported, kept on-device in IndexedDB.

export interface StoredPhoto {
  id: string;
  created: number;
  image: Blob; // square, downscaled JPEG used for the puzzle
  thumb: Blob; // small JPEG for the gallery
}

const DB_NAME = "pictureslide";
const STORE = "photos";

let dbPromise: Promise<IDBDatabase> | undefined;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(d.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function listPhotos(): Promise<StoredPhoto[]> {
  const all = await run<StoredPhoto[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => b.created - a.created);
}

export const savePhoto = (photo: StoredPhoto) => run("readwrite", (s) => s.put(photo)).then(() => undefined);
export const deletePhoto = (id: string) => run("readwrite", (s) => s.delete(id)).then(() => undefined);

/** Ask the browser not to evict our photos under storage pressure. */
export function requestPersistence() {
  navigator.storage?.persist?.().catch(() => {});
}
