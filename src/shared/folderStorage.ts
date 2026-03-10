import { Folder, FolderItem } from "./types";
import {
  getActiveWorkspaceId,
  getWorkspaceFolders,
  createFolderInWorkspace,
  renameFolderInWorkspace,
  deleteFolderInWorkspace,
  moveFolderItemToFolderInWorkspace,
  updateFolderInWorkspace,
  addItemToFolderInWorkspace,
  removeItemFromFolderInWorkspace,
  renameItemInFolderInWorkspace,
  reorderFoldersInWorkspace,
  reorderItemsInFolderInWorkspace,
  addSavedItemToWorkspace,
  removeSavedItemFromWorkspace,
  renameSavedItemInWorkspace,
  reorderSavedItemsInWorkspace,
  moveSavedItemToFolderInWorkspace,
  moveFolderItemToSavedItemsInWorkspace,
} from "./workspaceStorage";

export async function getFolders(): Promise<Folder[]> {
  const wsId = await getActiveWorkspaceId();
  return getWorkspaceFolders(wsId);
}

export async function createFolder(
  name: string,
  parentId?: string | null
): Promise<Folder> {
  const wsId = await getActiveWorkspaceId();
  return createFolderInWorkspace(wsId, name, parentId);
}

export async function renameFolder(id: string, name: string): Promise<Folder> {
  const wsId = await getActiveWorkspaceId();
  return renameFolderInWorkspace(wsId, id, name);
}

export async function deleteFolder(id: string): Promise<void> {
  const wsId = await getActiveWorkspaceId();
  return deleteFolderInWorkspace(wsId, id);
}

export async function moveItemToFolder(
  itemId: string,
  targetFolderId: string
): Promise<void> {
  const wsId = await getActiveWorkspaceId();
  return moveFolderItemToFolderInWorkspace(wsId, itemId, targetFolderId);
}

export async function updateFolder(
  id: string,
  data: Partial<Omit<Folder, "id">>
): Promise<Folder> {
  const wsId = await getActiveWorkspaceId();
  return updateFolderInWorkspace(wsId, id, data);
}

export async function addItemToFolder(
  folderId: string,
  item: FolderItem
): Promise<void> {
  const wsId = await getActiveWorkspaceId();
  return addItemToFolderInWorkspace(wsId, folderId, item);
}

export async function removeItemFromFolder(
  folderId: string,
  itemId: string
): Promise<void> {
  const wsId = await getActiveWorkspaceId();
  return removeItemFromFolderInWorkspace(wsId, folderId, itemId);
}

export async function renameItemInFolder(
  folderId: string,
  itemId: string,
  newTitle: string
): Promise<void> {
  const wsId = await getActiveWorkspaceId();
  return renameItemInFolderInWorkspace(wsId, folderId, itemId, newTitle);
}

export async function reorderFolders(
  orderedIds: string[],
  parentId: string | null
): Promise<void> {
  const wsId = await getActiveWorkspaceId();
  return reorderFoldersInWorkspace(wsId, orderedIds, parentId);
}

export async function reorderItemsInFolder(
  folderId: string,
  orderedItemIds: string[]
): Promise<void> {
  const wsId = await getActiveWorkspaceId();
  return reorderItemsInFolderInWorkspace(wsId, folderId, orderedItemIds);
}

// ── Saved Items facades ──

export async function addSavedItem(item: FolderItem): Promise<void> {
  const wsId = await getActiveWorkspaceId();
  return addSavedItemToWorkspace(wsId, item);
}

export async function removeSavedItem(itemId: string): Promise<void> {
  const wsId = await getActiveWorkspaceId();
  return removeSavedItemFromWorkspace(wsId, itemId);
}

export async function renameSavedItem(
  itemId: string,
  newTitle: string
): Promise<void> {
  const wsId = await getActiveWorkspaceId();
  return renameSavedItemInWorkspace(wsId, itemId, newTitle);
}

export async function reorderSavedItems(
  orderedItemIds: string[]
): Promise<void> {
  const wsId = await getActiveWorkspaceId();
  return reorderSavedItemsInWorkspace(wsId, orderedItemIds);
}

export async function moveSavedItemToFolder(
  itemId: string,
  targetFolderId: string
): Promise<void> {
  const wsId = await getActiveWorkspaceId();
  return moveSavedItemToFolderInWorkspace(wsId, itemId, targetFolderId);
}

export async function moveFolderItemToSavedItems(
  itemId: string
): Promise<void> {
  const wsId = await getActiveWorkspaceId();
  return moveFolderItemToSavedItemsInWorkspace(wsId, itemId);
}
