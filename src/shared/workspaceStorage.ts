import { Workspace, PinnedApp, Folder, FolderItem } from "./types";
import { WORKSPACE_TEMPLATES } from "./templates";

const WORKSPACES_KEY = "workspaces";
const ACTIVE_WORKSPACE_KEY = "activeWorkspaceId";
const SCHEMA_VERSION_KEY = "schemaVersion";
const TAB_WORKSPACE_MAP_KEY = "tabWorkspaceMap";

const CURRENT_SCHEMA_VERSION = 3;

const DEFAULT_WORKSPACE_ID = "default";
const MAX_PINNED_APPS = 12;

function createDefaultWorkspace(): Workspace {
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: "Default",
    emoji: "\u{1F3E0}",
    accentColor: "#2E75B6",
    pinnedApps: [],
    folders: [],
    sortOrder: 0,
    notes: "",
    notesCollapsed: true,
    notesLastEditedAt: 0,
  };
}

/**
 * Migrate from V1 (global pinnedApps/folders keys) to V2 (per-workspace).
 * Copies global data into the Default workspace, clears legacy keys.
 */
async function migrateToV2(): Promise<void> {
  const result = await chrome.storage.local.get([
    WORKSPACES_KEY,
    "pinnedApps",
    "folders",
  ]);

  const workspaces = (result[WORKSPACES_KEY] as Workspace[]) ?? [];
  const globalPinnedApps = (result["pinnedApps"] as PinnedApp[]) ?? [];
  const globalFolders = (result["folders"] as Folder[]) ?? [];

  for (const ws of workspaces) {
    if (ws.id === DEFAULT_WORKSPACE_ID) {
      // Merge global data into Default workspace
      ws.pinnedApps = globalPinnedApps;
      ws.folders = globalFolders;
    } else {
      // Other workspaces start empty if they don't already have data
      ws.pinnedApps = ws.pinnedApps ?? [];
      ws.folders = ws.folders ?? [];
    }
  }

  // Atomic write: update workspaces, bump schema, remove legacy keys
  await chrome.storage.local.set({
    [WORKSPACES_KEY]: workspaces,
    [SCHEMA_VERSION_KEY]: CURRENT_SCHEMA_VERSION,
  });
  await chrome.storage.local.remove(["pinnedApps", "folders"]);
}

/**
 * Migrate from V2 to V3: add notes fields to each workspace.
 */
async function migrateToV3(): Promise<void> {
  const result = await chrome.storage.local.get(WORKSPACES_KEY);
  const workspaces = (result[WORKSPACES_KEY] as Workspace[]) ?? [];

  for (const ws of workspaces) {
    if (ws.notes === undefined) ws.notes = "";
    if (ws.notesCollapsed === undefined) ws.notesCollapsed = true;
    if (ws.notesLastEditedAt === undefined) ws.notesLastEditedAt = 0;
  }

  await chrome.storage.local.set({
    [WORKSPACES_KEY]: workspaces,
    [SCHEMA_VERSION_KEY]: CURRENT_SCHEMA_VERSION,
  });
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
    return;
  }

  const version = (result[SCHEMA_VERSION_KEY] as number) ?? 1;
  if (version < 2) {
    await migrateToV2();
  }
  if (version < 3) {
    await migrateToV3();
  }
}

export async function getWorkspaces(): Promise<Workspace[]> {
  await ensureInitialized();
  const result = await chrome.storage.local.get(WORKSPACES_KEY);
  const workspaces = (result[WORKSPACES_KEY] as Workspace[]) ?? [];
  return workspaces.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function createWorkspace(
  name: string,
  cloneFromId?: string
): Promise<Workspace> {
  if (!name.trim()) {
    throw new Error("Workspace name must be non-empty.");
  }

  const workspaces = await getWorkspaces();
  const maxOrder = workspaces.reduce(
    (max, w) => Math.max(max, w.sortOrder),
    -1
  );

  let pinnedApps: PinnedApp[] = [];
  let folders: Folder[] = [];

  if (cloneFromId) {
    const source = workspaces.find((w) => w.id === cloneFromId);
    if (source) {
      // Deep-copy pinned apps with new IDs
      pinnedApps = source.pinnedApps.map((app) => ({
        ...app,
        id: crypto.randomUUID(),
      }));

      // Deep-copy folders with new IDs, mapping old IDs to new IDs for parentId refs
      const folderIdMap = new Map<string, string>();
      for (const folder of source.folders) {
        folderIdMap.set(folder.id, crypto.randomUUID());
      }

      folders = source.folders.map((folder) => ({
        ...folder,
        id: folderIdMap.get(folder.id)!,
        parentId: folder.parentId
          ? (folderIdMap.get(folder.parentId) ?? null)
          : null,
        items: folder.items.map((item) => ({
          ...item,
          id: crypto.randomUUID(),
        })),
      }));
    }
  }

  const newWorkspace: Workspace = {
    id: crypto.randomUUID(),
    name: name.trim(),
    emoji: "\u{1F4C1}",
    accentColor: "#2E75B6",
    pinnedApps,
    folders,
    sortOrder: maxOrder + 1,
    notes: "",
    notesCollapsed: true,
    notesLastEditedAt: 0,
  };

  workspaces.push(newWorkspace);
  await saveWorkspaces(workspaces);
  return newWorkspace;
}

export async function createWorkspaceFromTemplate(
  templateId: string
): Promise<Workspace> {
  const template = WORKSPACE_TEMPLATES.find((t) => t.id === templateId);
  if (!template) {
    throw new Error(`Template "${templateId}" not found.`);
  }

  const workspaces = await getWorkspaces();

  // Deduplicate name
  let name = template.name;
  const existingNames = new Set(workspaces.map((w) => w.name));
  if (existingNames.has(name)) {
    let suffix = 2;
    while (existingNames.has(`${template.name} (${suffix})`)) suffix++;
    name = `${template.name} (${suffix})`;
  }

  const maxOrder = workspaces.reduce(
    (max, w) => Math.max(max, w.sortOrder),
    -1
  );

  const pinnedApps: PinnedApp[] = template.pinnedApps.map((app, i) => ({
    id: crypto.randomUUID(),
    url: app.url,
    title: app.title,
    favicon: "",
    sortOrder: i,
  }));

  const folders: Folder[] = template.folders.map((name, i) => ({
    id: crypto.randomUUID(),
    name,
    parentId: null,
    items: [],
    isCollapsed: false,
    sortOrder: i,
  }));

  const newWorkspace: Workspace = {
    id: crypto.randomUUID(),
    name,
    emoji: template.emoji,
    accentColor: template.accentColor,
    pinnedApps,
    folders,
    sortOrder: maxOrder + 1,
    notes: "",
    notesCollapsed: true,
    notesLastEditedAt: 0,
  };

  workspaces.push(newWorkspace);
  await saveWorkspaces(workspaces);
  await setActiveWorkspace(newWorkspace.id);
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

export async function getActiveWorkspaceId(): Promise<string> {
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

// ── Workspace-scoped Pinned Apps CRUD ──

export async function getWorkspacePinnedApps(
  workspaceId: string
): Promise<PinnedApp[]> {
  const workspaces = await getWorkspaces();
  const workspace = workspaces.find((w) => w.id === workspaceId);
  if (!workspace) return [];
  return [...workspace.pinnedApps].sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function addPinnedAppToWorkspace(
  workspaceId: string,
  app: Omit<PinnedApp, "sortOrder">
): Promise<PinnedApp> {
  const workspaces = await getWorkspaces();
  const ws = workspaces.find((w) => w.id === workspaceId);
  if (!ws) throw new Error(`Workspace "${workspaceId}" not found.`);

  if (ws.pinnedApps.length >= MAX_PINNED_APPS) {
    throw new Error(
      `Maximum of ${MAX_PINNED_APPS} pinned apps reached. Remove one before adding another.`
    );
  }

  const maxOrder = ws.pinnedApps.reduce(
    (max, a) => Math.max(max, a.sortOrder),
    -1
  );
  const newApp: PinnedApp = { ...app, sortOrder: maxOrder + 1 };
  ws.pinnedApps.push(newApp);
  await saveWorkspaces(workspaces);
  return newApp;
}

export async function removePinnedAppFromWorkspace(
  workspaceId: string,
  appId: string
): Promise<void> {
  const workspaces = await getWorkspaces();
  const ws = workspaces.find((w) => w.id === workspaceId);
  if (!ws) return;
  ws.pinnedApps = ws.pinnedApps.filter((a) => a.id !== appId);
  await saveWorkspaces(workspaces);
}

export async function updatePinnedAppInWorkspace(
  workspaceId: string,
  appId: string,
  data: Partial<Omit<PinnedApp, "id">>
): Promise<PinnedApp> {
  const workspaces = await getWorkspaces();
  const ws = workspaces.find((w) => w.id === workspaceId);
  if (!ws) throw new Error(`Workspace "${workspaceId}" not found.`);

  const index = ws.pinnedApps.findIndex((a) => a.id === appId);
  if (index === -1) throw new Error(`Pinned app "${appId}" not found.`);

  ws.pinnedApps[index] = { ...ws.pinnedApps[index], ...data };
  await saveWorkspaces(workspaces);
  return ws.pinnedApps[index];
}

export async function reorderPinnedAppsInWorkspace(
  workspaceId: string,
  orderedIds: string[]
): Promise<void> {
  const workspaces = await getWorkspaces();
  const ws = workspaces.find((w) => w.id === workspaceId);
  if (!ws) return;

  const appMap = new Map(ws.pinnedApps.map((a) => [a.id, a]));
  const reordered: PinnedApp[] = [];
  for (let i = 0; i < orderedIds.length; i++) {
    const app = appMap.get(orderedIds[i]);
    if (app) {
      reordered.push({ ...app, sortOrder: i });
    }
  }
  ws.pinnedApps = reordered;
  await saveWorkspaces(workspaces);
}

// ── Workspace-scoped Folders CRUD ──

export async function getWorkspaceFolders(
  workspaceId: string
): Promise<Folder[]> {
  const workspaces = await getWorkspaces();
  const workspace = workspaces.find((w) => w.id === workspaceId);
  if (!workspace) return [];
  return [...workspace.folders].sort((a, b) => a.sortOrder - b.sortOrder);
}

function getDepth(parentId: string | null, folders: Folder[]): number {
  let depth = 0;
  let currentParentId = parentId;
  while (currentParentId !== null) {
    depth++;
    const parent = folders.find((f) => f.id === currentParentId);
    if (!parent) break;
    currentParentId = parent.parentId;
  }
  return depth;
}

export async function createFolderInWorkspace(
  workspaceId: string,
  name: string,
  parentId?: string | null
): Promise<Folder> {
  if (!name.trim()) throw new Error("Folder name must be non-empty.");

  const workspaces = await getWorkspaces();
  const ws = workspaces.find((w) => w.id === workspaceId);
  if (!ws) throw new Error(`Workspace "${workspaceId}" not found.`);

  const resolvedParentId = parentId ?? null;

  if (resolvedParentId !== null) {
    const parentFolder = ws.folders.find((f) => f.id === resolvedParentId);
    if (!parentFolder) {
      throw new Error(`Parent folder "${resolvedParentId}" not found.`);
    }
    const newDepth = getDepth(resolvedParentId, ws.folders) + 1;
    if (newDepth >= 3) {
      throw new Error(
        "Maximum nesting depth of 3 levels reached. Cannot create a deeper subfolder."
      );
    }
  }

  const siblings = ws.folders.filter((f) => f.parentId === resolvedParentId);
  const maxOrder = siblings.reduce((max, f) => Math.max(max, f.sortOrder), -1);

  const newFolder: Folder = {
    id: crypto.randomUUID(),
    name: name.trim(),
    parentId: resolvedParentId,
    items: [],
    isCollapsed: false,
    sortOrder: maxOrder + 1,
  };

  ws.folders.push(newFolder);
  await saveWorkspaces(workspaces);
  return newFolder;
}

export async function renameFolderInWorkspace(
  workspaceId: string,
  folderId: string,
  name: string
): Promise<Folder> {
  if (!name.trim()) throw new Error("Folder name must be non-empty.");

  const workspaces = await getWorkspaces();
  const ws = workspaces.find((w) => w.id === workspaceId);
  if (!ws) throw new Error(`Workspace "${workspaceId}" not found.`);

  const index = ws.folders.findIndex((f) => f.id === folderId);
  if (index === -1) throw new Error(`Folder "${folderId}" not found.`);

  ws.folders[index] = { ...ws.folders[index], name: name.trim() };
  await saveWorkspaces(workspaces);
  return ws.folders[index];
}

export async function deleteFolderInWorkspace(
  workspaceId: string,
  folderId: string
): Promise<void> {
  const workspaces = await getWorkspaces();
  const ws = workspaces.find((w) => w.id === workspaceId);
  if (!ws) return;

  const idsToDelete = new Set<string>();
  function collectDescendants(id: string): void {
    idsToDelete.add(id);
    for (const f of ws!.folders) {
      if (f.parentId === id) collectDescendants(f.id);
    }
  }
  collectDescendants(folderId);

  ws.folders = ws.folders.filter((f) => !idsToDelete.has(f.id));
  await saveWorkspaces(workspaces);
}

export async function addItemToFolderInWorkspace(
  workspaceId: string,
  folderId: string,
  item: FolderItem
): Promise<void> {
  const workspaces = await getWorkspaces();
  const ws = workspaces.find((w) => w.id === workspaceId);
  if (!ws) throw new Error(`Workspace "${workspaceId}" not found.`);

  const folder = ws.folders.find((f) => f.id === folderId);
  if (!folder) throw new Error(`Folder "${folderId}" not found.`);

  folder.items.push(item);
  await saveWorkspaces(workspaces);
}

export async function removeItemFromFolderInWorkspace(
  workspaceId: string,
  folderId: string,
  itemId: string
): Promise<void> {
  const workspaces = await getWorkspaces();
  const ws = workspaces.find((w) => w.id === workspaceId);
  if (!ws) return;

  const folder = ws.folders.find((f) => f.id === folderId);
  if (!folder) return;

  folder.items = folder.items.filter((i) => i.id !== itemId);
  await saveWorkspaces(workspaces);
}

export async function renameItemInFolderInWorkspace(
  workspaceId: string,
  folderId: string,
  itemId: string,
  newTitle: string
): Promise<void> {
  const workspaces = await getWorkspaces();
  const ws = workspaces.find((w) => w.id === workspaceId);
  if (!ws) return;

  const folder = ws.folders.find((f) => f.id === folderId);
  if (!folder) return;

  const item = folder.items.find((i) => i.id === itemId);
  if (item) item.title = newTitle;

  await saveWorkspaces(workspaces);
}

export async function reorderFoldersInWorkspace(
  workspaceId: string,
  orderedIds: string[],
  parentId: string | null
): Promise<void> {
  const workspaces = await getWorkspaces();
  const ws = workspaces.find((w) => w.id === workspaceId);
  if (!ws) return;

  orderedIds.forEach((id, index) => {
    const folder = ws.folders.find((f) => f.id === id);
    if (folder && folder.parentId === parentId) {
      folder.sortOrder = index;
    }
  });
  await saveWorkspaces(workspaces);
}

export async function reorderItemsInFolderInWorkspace(
  workspaceId: string,
  folderId: string,
  orderedItemIds: string[]
): Promise<void> {
  const workspaces = await getWorkspaces();
  const ws = workspaces.find((w) => w.id === workspaceId);
  if (!ws) return;

  const folder = ws.folders.find((f) => f.id === folderId);
  if (!folder) return;

  const reordered: FolderItem[] = [];
  for (const id of orderedItemIds) {
    const item = folder.items.find((i) => i.id === id);
    if (item) reordered.push(item);
  }
  for (const item of folder.items) {
    if (!orderedItemIds.includes(item.id)) {
      reordered.push(item);
    }
  }
  folder.items = reordered;
  await saveWorkspaces(workspaces);
}

export async function moveFolderItemToFolderInWorkspace(
  workspaceId: string,
  itemId: string,
  targetFolderId: string
): Promise<void> {
  const workspaces = await getWorkspaces();
  const ws = workspaces.find((w) => w.id === workspaceId);
  if (!ws) throw new Error(`Workspace "${workspaceId}" not found.`);

  let sourceFolder: Folder | undefined;
  let item: FolderItem | undefined;

  for (const folder of ws.folders) {
    const found = folder.items.find((i) => i.id === itemId);
    if (found) {
      sourceFolder = folder;
      item = found;
      break;
    }
  }

  if (!sourceFolder || !item) {
    throw new Error(`Item "${itemId}" not found in any folder.`);
  }

  const targetFolder = ws.folders.find((f) => f.id === targetFolderId);
  if (!targetFolder) {
    throw new Error(`Target folder "${targetFolderId}" not found.`);
  }

  sourceFolder.items = sourceFolder.items.filter((i) => i.id !== itemId);
  targetFolder.items.push(item);

  await saveWorkspaces(workspaces);
}

export async function updateFolderInWorkspace(
  workspaceId: string,
  folderId: string,
  data: Partial<Omit<Folder, "id">>
): Promise<Folder> {
  const workspaces = await getWorkspaces();
  const ws = workspaces.find((w) => w.id === workspaceId);
  if (!ws) throw new Error(`Workspace "${workspaceId}" not found.`);

  const index = ws.folders.findIndex((f) => f.id === folderId);
  if (index === -1) throw new Error(`Folder "${folderId}" not found.`);

  ws.folders[index] = { ...ws.folders[index], ...data };
  await saveWorkspaces(workspaces);
  return ws.folders[index];
}
