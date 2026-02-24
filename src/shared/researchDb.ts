import type { PageCapture, ResearchSession } from "./types";

const DB_NAME = "arcflow-research";
const DB_VERSION = 1;
const CAPTURES_STORE = "pageCaptures";
const SESSIONS_STORE = "researchSessions";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CAPTURES_STORE)) {
        const store = db.createObjectStore(CAPTURES_STORE, { keyPath: "id" });
        store.createIndex("sessionId", "sessionId", { unique: false });
        store.createIndex("capturedAt", "capturedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        db.createObjectStore(SESSIONS_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function initResearchDb(): Promise<void> {
  const db = await openDb();
  db.close();
}

export async function savePageCapture(capture: PageCapture): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CAPTURES_STORE, "readwrite");
      tx.objectStore(CAPTURES_STORE).put(capture);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getCaptures(
  sessionId: string,
): Promise<PageCapture[]> {
  const db = await openDb();
  try {
    return await new Promise<PageCapture[]>((resolve, reject) => {
      const tx = db.transaction(CAPTURES_STORE, "readonly");
      const index = tx.objectStore(CAPTURES_STORE).index("sessionId");
      const request = index.getAll(sessionId);
      request.onsuccess = () => resolve(request.result as PageCapture[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function saveSession(session: ResearchSession): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, "readwrite");
      tx.objectStore(SESSIONS_STORE).put(session);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getSessions(): Promise<ResearchSession[]> {
  const db = await openDb();
  try {
    return await new Promise<ResearchSession[]>((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, "readonly");
      const request = tx.objectStore(SESSIONS_STORE).getAll();
      request.onsuccess = () => resolve(request.result as ResearchSession[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = await openDb();
  try {
    // Delete the session record
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, "readwrite");
      tx.objectStore(SESSIONS_STORE).delete(sessionId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    // Delete all captures for this session
    const captures = await getCaptures(sessionId);
    if (captures.length > 0) {
      const db2 = await openDb();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db2.transaction(CAPTURES_STORE, "readwrite");
          const store = tx.objectStore(CAPTURES_STORE);
          for (const capture of captures) {
            store.delete(capture.id);
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } finally {
        db2.close();
      }
    }
  } finally {
    db.close();
  }
}
