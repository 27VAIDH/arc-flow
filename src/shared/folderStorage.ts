import { Folder, FolderItem } from "./types";

const STORAGE_KEY = "folders";

export async function getFolders(): Promise<Folder[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const folders = (result[STORAGE_KEY] as Folder[] | undefined) ?? [];
  return folders.sort((a, b) => a.sortOrder - b.sortOrder);
}

async function saveFolders(folders: Folder[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: folders });
}

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Count ancestor depth by traversing parentId chain.
 * Returns 0 for top-level folders, 1 for first-level nesting, etc.
 */
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

export async function createFolder(
  name: string,
  parentId?: string | null
): Promise<Folder> {
  if (!name.trim()) {
    throw new Error("Folder name must be non-empty.");
  }

  const folders = await getFolders();
  const resolvedParentId = parentId ?? null;

  // Validate nesting depth: the new folder itself will be at depth = parent's depth + 1
  // We allow max depth of 3, meaning indices 0, 1, 2
  if (resolvedParentId !== null) {
    const parentDepth = getDepth(resolvedParentId, folders);
    // parentDepth is how deep the parent is (0-indexed from top-level)
    // The new folder will be at parentDepth + 1, but since parent is already
    // at some depth, we need the parent's own depth level
    const parentFolder = folders.find((f) => f.id === resolvedParentId);
    if (!parentFolder) {
      throw new Error(`Parent folder with id "${resolvedParentId}" not found.`);
    }
    const newDepth = parentDepth + 1;
    if (newDepth >= 3) {
      throw new Error(
        "Maximum nesting depth of 3 levels reached. Cannot create a deeper subfolder."
      );
    }
  }

  const siblings = folders.filter((f) => f.parentId === resolvedParentId);
  const maxOrder = siblings.reduce((max, f) => Math.max(max, f.sortOrder), -1);

  const newFolder: Folder = {
    id: generateId(),
    name: name.trim(),
    parentId: resolvedParentId,
    items: [],
    isCollapsed: false,
    sortOrder: maxOrder + 1,
  };

  folders.push(newFolder);
  await saveFolders(folders);
  return newFolder;
}

export async function renameFolder(id: string, name: string): Promise<Folder> {
  if (!name.trim()) {
    throw new Error("Folder name must be non-empty.");
  }

  const folders = await getFolders();
  const index = folders.findIndex((f) => f.id === id);
  if (index === -1) {
    throw new Error(`Folder with id "${id}" not found.`);
  }

  folders[index] = { ...folders[index], name: name.trim() };
  await saveFolders(folders);
  return folders[index];
}

/**
 * Delete a folder and all its descendants (nested subfolders).
 */
export async function deleteFolder(id: string): Promise<void> {
  const folders = await getFolders();
  const idsToDelete = new Set<string>();

  // Collect the folder and all descendants
  function collectDescendants(folderId: string): void {
    idsToDelete.add(folderId);
    for (const f of folders) {
      if (f.parentId === folderId) {
        collectDescendants(f.id);
      }
    }
  }

  collectDescendants(id);
  const remaining = folders.filter((f) => !idsToDelete.has(f.id));
  await saveFolders(remaining);
}

export async function moveItemToFolder(
  itemId: string,
  targetFolderId: string
): Promise<void> {
  const folders = await getFolders();

  // Find the item across all folders
  let sourceFolder: Folder | undefined;
  let item: FolderItem | undefined;

  for (const folder of folders) {
    const found = folder.items.find((i) => i.id === itemId);
    if (found) {
      sourceFolder = folder;
      item = found;
      break;
    }
  }

  if (!sourceFolder || !item) {
    throw new Error(`Item with id "${itemId}" not found in any folder.`);
  }

  const targetFolder = folders.find((f) => f.id === targetFolderId);
  if (!targetFolder) {
    throw new Error(`Target folder with id "${targetFolderId}" not found.`);
  }

  // Remove from source
  sourceFolder.items = sourceFolder.items.filter((i) => i.id !== itemId);

  // Add to target
  targetFolder.items.push(item);

  await saveFolders(folders);
}

export async function updateFolder(
  id: string,
  data: Partial<Omit<Folder, "id">>
): Promise<Folder> {
  const folders = await getFolders();
  const index = folders.findIndex((f) => f.id === id);
  if (index === -1) {
    throw new Error(`Folder with id "${id}" not found.`);
  }

  folders[index] = { ...folders[index], ...data };
  await saveFolders(folders);
  return folders[index];
}

export async function addItemToFolder(
  folderId: string,
  item: FolderItem
): Promise<void> {
  const folders = await getFolders();
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) {
    throw new Error(`Folder with id "${folderId}" not found.`);
  }

  folder.items.push(item);
  await saveFolders(folders);
}

export async function removeItemFromFolder(
  folderId: string,
  itemId: string
): Promise<void> {
  const folders = await getFolders();
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) {
    throw new Error(`Folder with id "${folderId}" not found.`);
  }

  folder.items = folder.items.filter((i) => i.id !== itemId);
  await saveFolders(folders);
}
