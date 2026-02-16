import { Workspace, PinnedApp, Folder } from "./types";

const WORKSPACES_KEY = "workspaces";
const ACTIVE_WORKSPACE_KEY = "activeWorkspaceId";
const SCHEMA_VERSION_KEY = "schemaVersion";
const TAB_WORKSPACE_MAP_KEY = "tabWorkspaceMap";

const CURRENT_SCHEMA_VERSION = 1;

const DEFAULT_WORKSPACE_ID = "default";

function createDefaultWorkspace(): Workspace {
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: "Default",
    emoji: "🏠",
    accentColor: "#2E75B6",
    pinnedApps: [],
    folders: [],
    sortOrder: 0,
  };
}

async function ensureInitialized(): Promise<void> {
  const result = await chrome.storage.local.get([
    WORKSPACES_KEY,
    SCHEMA_VERSION_KEY,
  ]);
  if (!result[WORKSPACES_KEY]) {
    await chrome.storage.local.set({
      [WORKSPACES_KEY]: [createDefaultWorkspace()],
      [ACTIVE_WORKSPACE_KEY]: DEFAULT_WORKSPACE_ID,
      [SCHEMA_VERSION_KEY]: CURRENT_SCHEMA_VERSION,
      [TAB_WORKSPACE_MAP_KEY]: {},
    });
  }
}

export async function getWorkspaces(): Promise<Workspace[]> {
  await ensureInitialized();
  const result = await chrome.storage.local.get(WORKSPACES_KEY);
  const workspaces = (result[WORKSPACES_KEY] as Workspace[]) ?? [];
  return workspaces.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function createWorkspace(name: string): Promise<Workspace> {
  if (!name.trim()) {
    throw new Error("Workspace name must be non-empty.");
  }

  const workspaces = await getWorkspaces();
  const maxOrder = workspaces.reduce(
    (max, w) => Math.max(max, w.sortOrder),
    -1
  );

  const newWorkspace: Workspace = {
    id: crypto.randomUUID(),
    name: name.trim(),
    emoji: "📁",
    accentColor: "#2E75B6",
    pinnedApps: [],
    folders: [],
    sortOrder: maxOrder + 1,
  };

  workspaces.push(newWorkspace);
  await saveWorkspaces(workspaces);
  return newWorkspace;
}

export async function updateWorkspace(
  id: string,
  data: Partial<Omit<Workspace, "id">>
): Promise<Workspace> {
  if (id === DEFAULT_WORKSPACE_ID && data.name !== undefined) {
    throw new Error("The Default workspace cannot be renamed.");
  }

  const workspaces = await getWorkspaces();
  const index = workspaces.findIndex((w) => w.id === id);
  if (index === -1) {
    throw new Error(`Workspace with id "${id}" not found.`);
  }

  workspaces[index] = { ...workspaces[index], ...data };
  await saveWorkspaces(workspaces);
  return workspaces[index];
}

export async function deleteWorkspace(id: string): Promise<void> {
  if (id === DEFAULT_WORKSPACE_ID) {
    throw new Error("The Default workspace cannot be deleted.");
  }

  const workspaces = await getWorkspaces();
  const filtered = workspaces.filter((w) => w.id !== id);
  if (filtered.length === workspaces.length) {
    throw new Error(`Workspace with id "${id}" not found.`);
  }

  await saveWorkspaces(filtered);

  // If the deleted workspace was active, switch to Default
  const activeId = await getActiveWorkspaceId();
  if (activeId === id) {
    await setActiveWorkspace(DEFAULT_WORKSPACE_ID);
  }

  // Clean up tab-workspace mappings for the deleted workspace
  const tabMap = await getTabWorkspaceMap();
  const cleanedMap: Record<string, string> = {};
  for (const [tabId, wsId] of Object.entries(tabMap)) {
    if (wsId !== id) {
      cleanedMap[tabId] = wsId;
    }
  }
  await chrome.storage.local.set({ [TAB_WORKSPACE_MAP_KEY]: cleanedMap });
}

export async function getActiveWorkspace(): Promise<Workspace> {
  const workspaces = await getWorkspaces();
  const activeId = await getActiveWorkspaceId();
  const active = workspaces.find((w) => w.id === activeId);
  return active ?? workspaces[0];
}

export async function setActiveWorkspace(id: string): Promise<void> {
  const workspaces = await getWorkspaces();
  const exists = workspaces.some((w) => w.id === id);
  if (!exists) {
    throw new Error(`Workspace with id "${id}" not found.`);
  }
  await chrome.storage.local.set({ [ACTIVE_WORKSPACE_KEY]: id });
}

// Tab-to-workspace mapping helpers

export async function getTabWorkspaceMap(): Promise<Record<string, string>> {
  const result = await chrome.storage.local.get(TAB_WORKSPACE_MAP_KEY);
  return (
    (result[TAB_WORKSPACE_MAP_KEY] as Record<string, string> | undefined) ?? {}
  );
}

export async function assignTabToWorkspace(
  tabId: number,
  workspaceId: string
): Promise<void> {
  const tabMap = await getTabWorkspaceMap();
  tabMap[String(tabId)] = workspaceId;
  await chrome.storage.local.set({ [TAB_WORKSPACE_MAP_KEY]: tabMap });
}

export async function removeTabFromMap(tabId: number): Promise<void> {
  const tabMap = await getTabWorkspaceMap();
  delete tabMap[String(tabId)];
  await chrome.storage.local.set({ [TAB_WORKSPACE_MAP_KEY]: tabMap });
}

// Internal helpers

async function getActiveWorkspaceId(): Promise<string> {
  const result = await chrome.storage.local.get(ACTIVE_WORKSPACE_KEY);
  return (
    (result[ACTIVE_WORKSPACE_KEY] as string | undefined) ?? DEFAULT_WORKSPACE_ID
  );
}

async function saveWorkspaces(workspaces: Workspace[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [WORKSPACES_KEY]: workspaces });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("QUOTA_BYTES_PER_ITEM")
    ) {
      throw new Error(
        "Storage quota exceeded. Try removing unused workspaces or archived items."
      );
    }
    throw error;
  }
}

// Workspace-specific pinned apps helpers

export async function getWorkspacePinnedApps(
  workspaceId: string
): Promise<PinnedApp[]> {
  const workspaces = await getWorkspaces();
  const workspace = workspaces.find((w) => w.id === workspaceId);
  if (!workspace) return [];
  return workspace.pinnedApps.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getWorkspaceFolders(
  workspaceId: string
): Promise<Folder[]> {
  const workspaces = await getWorkspaces();
  const workspace = workspaces.find((w) => w.id === workspaceId);
  if (!workspace) return [];
  return workspace.folders.sort((a, b) => a.sortOrder - b.sortOrder);
}
