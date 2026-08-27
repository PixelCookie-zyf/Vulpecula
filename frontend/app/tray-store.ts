export type TrayItem = {
  id: string;
  name: string;
  blob: Blob;
  type: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: number;
  deletedAt: number | null;
};

export const STAGED_DAYS = 30;
export const TRASH_DAYS = 15;
const DAY = 24 * 60 * 60 * 1000;

const DB_NAME = "vulpecula-tray";
const STORE = "items";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

function getAllItems(): Promise<TrayItem[]> {
  return openDb().then(
    (db) =>
      new Promise<TrayItem[]>((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const request = tx.objectStore(STORE).getAll();
        request.onsuccess = () => resolve(request.result as TrayItem[]);
        request.onerror = () => reject(request.error);
      }),
  );
}

function putItem(item: TrayItem): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function deleteItemById(id: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

async function purgeExpired(): Promise<void> {
  const now = Date.now();
  for (const item of await getAllItems()) {
    if (item.deletedAt === null && now - item.createdAt > STAGED_DAYS * DAY) {
      await putItem({ ...item, deletedAt: item.createdAt + STAGED_DAYS * DAY });
    } else if (item.deletedAt !== null && now - item.deletedAt > TRASH_DAYS * DAY) {
      await deleteItemById(item.id);
    }
  }
}

export async function saveToTray(input: {
  name: string;
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
}): Promise<TrayItem> {
  const item: TrayItem = {
    id: crypto.randomUUID(),
    name: input.name,
    blob: input.blob,
    type: input.blob.type,
    width: input.width,
    height: input.height,
    bytes: input.bytes,
    createdAt: Date.now(),
    deletedAt: null,
  };
  await putItem(item);
  return item;
}

export async function listTray(): Promise<{ staged: TrayItem[]; trash: TrayItem[] }> {
  await purgeExpired();
  const all = await getAllItems();
  const staged = all
    .filter((item) => item.deletedAt === null)
    .sort((a, b) => b.createdAt - a.createdAt);
  const trash = all
    .filter((item) => item.deletedAt !== null)
    .sort((a, b) => (b.deletedAt as number) - (a.deletedAt as number));
  return { staged, trash };
}

export async function trashItem(id: string): Promise<void> {
  const item = (await getAllItems()).find((entry) => entry.id === id);
  if (item && item.deletedAt === null) await putItem({ ...item, deletedAt: Date.now() });
}

export async function restoreItem(id: string): Promise<void> {
  const item = (await getAllItems()).find((entry) => entry.id === id);
  if (item && item.deletedAt !== null) {
    const age = Date.now() - item.createdAt;
    await putItem({ ...item, deletedAt: null, createdAt: Date.now() - Math.min(age, STAGED_DAYS * DAY * 0.9) });
  }
}

export async function removeForever(id: string): Promise<void> {
  await deleteItemById(id);
}

export async function emptyTrash(): Promise<void> {
  const all = await getAllItems();
  for (const item of all) {
    if (item.deletedAt !== null) await deleteItemById(item.id);
  }
}

export function daysLeft(item: TrayItem): number {
  if (item.deletedAt === null) {
    return Math.max(0, STAGED_DAYS - Math.floor((Date.now() - item.createdAt) / DAY));
  }
  return Math.max(0, TRASH_DAYS - Math.floor((Date.now() - item.deletedAt) / DAY));
}
