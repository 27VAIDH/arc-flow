import type { NavigationEvent } from "./types";

const DB_NAME = "arcflow-navigation";
const DB_VERSION = 1;
const STORE_NAME = "navEvents";
const DEFAULT_MAX_AGE_DAYS = 30;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("tabId", "tabId", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function initNavigationDb(): Promise<void> {
  const db = await openDb();
  db.close();
}

export async function addNavEvent(event: NavigationEvent): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).add(event);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getNavEvents(
  tabId: number,
): Promise<NavigationEvent[]> {
  const db = await openDb();
  try {
    return await new Promise<NavigationEvent[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const index = tx.objectStore(STORE_NAME).index("tabId");
      const request = index.getAll(tabId);
      request.onsuccess = () => resolve(request.result as NavigationEvent[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function getNavEventsSince(
  timestamp: number,
): Promise<NavigationEvent[]> {
  const db = await openDb();
  try {
    return await new Promise<NavigationEvent[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const index = tx.objectStore(STORE_NAME).index("timestamp");
      const range = IDBKeyRange.lowerBound(timestamp);
      const request = index.getAll(range);
      request.onsuccess = () => resolve(request.result as NavigationEvent[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function pruneOldEvents(
  maxAgeDays: number = DEFAULT_MAX_AGE_DAYS,
): Promise<void> {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const index = tx.objectStore(STORE_NAME).index("timestamp");
      const range = IDBKeyRange.upperBound(cutoff);
      const cursorReq = index.openCursor(range);
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
