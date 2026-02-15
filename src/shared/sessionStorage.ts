import type { Session, PinnedApp, Folder } from "./types";

const SESSIONS_KEY = "sessions";
const MAX_SESSIONS = 20;

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
