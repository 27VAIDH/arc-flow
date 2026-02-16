import type { Session, PinnedApp, Folder } from "./types";

const SESSIONS_KEY = "sessions";
const MAX_SESSIONS = 20;
const EXPORT_SCHEMA_VERSION = 1;

export interface SessionExport {
  schemaVersion: number;
  exportedAt: number;
  session: Session;
}

export function exportSessionToJSON(session: Session): string {
  const exportData: SessionExport = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: Date.now(),
    session: structuredClone(session),
  };
  return JSON.stringify(exportData, null, 2);
}

export function validateSessionImport(data: unknown): {
  valid: boolean;
  error?: string;
  session?: Session;
} {
  if (typeof data !== "object" || data === null) {
    return { valid: false, error: "Invalid JSON: expected an object." };
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.schemaVersion !== "number") {
    return { valid: false, error: "Missing or invalid schemaVersion." };
  }

  if (typeof obj.session !== "object" || obj.session === null) {
    return { valid: false, error: "Missing session data." };
  }

  const session = obj.session as Record<string, unknown>;

  if (typeof session.name !== "string" || session.name.trim().length === 0) {
    return { valid: false, error: "Session name is required." };
  }

  if (
    typeof session.workspaceSnapshot !== "object" ||
    session.workspaceSnapshot === null
  ) {
    return { valid: false, error: "Missing workspace snapshot." };
  }

  const snapshot = session.workspaceSnapshot as Record<string, unknown>;

  if (!Array.isArray(snapshot.pinnedApps)) {
    return {
      valid: false,
      error: "Missing workspace.pinnedApps array.",
    };
  }

  if (!Array.isArray(snapshot.folders)) {
    return {
      valid: false,
      error: "Missing workspace.folders array.",
    };
  }

  if (!Array.isArray(session.tabUrls)) {
    return { valid: false, error: "Missing tabUrls array." };
  }

  // Assign a new ID and timestamp to avoid collisions
  const importedSession: Session = {
    id: crypto.randomUUID(),
    name: session.name as string,
    savedAt: Date.now(),
    workspaceSnapshot: {
      pinnedApps: snapshot.pinnedApps as PinnedApp[],
      folders: snapshot.folders as Folder[],
    },
    tabUrls: session.tabUrls as {
      url: string;
      title: string;
      favicon: string;
    }[],
  };

  return { valid: true, session: importedSession };
}

export async function importSession(session: Session): Promise<Session> {
  return saveSession(session);
}

export async function getSessions(): Promise<Session[]> {
  const result = await chrome.storage.local.get(SESSIONS_KEY);
  const sessions = (result[SESSIONS_KEY] as Session[] | undefined) ?? [];
  return sessions.sort((a, b) => b.savedAt - a.savedAt);
}

export async function saveSession(session: Session): Promise<Session> {
  const sessions = await getSessions();

  if (sessions.length >= MAX_SESSIONS) {
    // Remove oldest session to make room
    sessions.sort((a, b) => a.savedAt - b.savedAt);
    sessions.shift();
  }

  sessions.push(session);
  await persistSessions(sessions);
  return session;
}

export async function createSessionFromState({
  name,
  pinnedApps,
  folders,
  tabUrls,
}: {
  name: string;
  pinnedApps: PinnedApp[];
  folders: Folder[];
  tabUrls: { url: string; title: string; favicon: string }[];
}): Promise<Session> {
  const session: Session = {
    id: crypto.randomUUID(),
    name: name.trim(),
    savedAt: Date.now(),
    workspaceSnapshot: {
      pinnedApps: structuredClone(pinnedApps),
      folders: structuredClone(folders),
    },
    tabUrls: structuredClone(tabUrls),
  };

  return saveSession(session);
}

export async function updateSession(
  id: string,
  data: Partial<Omit<Session, "id">>
): Promise<Session> {
  const sessions = await getSessions();
  const index = sessions.findIndex((s) => s.id === id);
  if (index === -1) {
    throw new Error(`Session with id "${id}" not found.`);
  }
  sessions[index] = { ...sessions[index], ...data };
  await persistSessions(sessions);
  return sessions[index];
}

export async function deleteSession(id: string): Promise<void> {
  const sessions = await getSessions();
  const filtered = sessions.filter((s) => s.id !== id);
  await persistSessions(filtered);
}

async function persistSessions(sessions: Session[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [SESSIONS_KEY]: sessions });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("QUOTA_BYTES_PER_ITEM")
    ) {
      throw new Error("Storage quota exceeded. Try removing old sessions.");
    }
    throw error;
  }
}
