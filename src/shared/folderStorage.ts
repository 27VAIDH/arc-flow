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
