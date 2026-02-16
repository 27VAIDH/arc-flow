import { PinnedApp } from "./types";
import {
  getActiveWorkspaceId,
  getWorkspacePinnedApps,
  addPinnedAppToWorkspace,
  removePinnedAppFromWorkspace,
  updatePinnedAppInWorkspace,
  reorderPinnedAppsInWorkspace,
} from "./workspaceStorage";

export async function getPinnedApps(): Promise<PinnedApp[]> {
  const wsId = await getActiveWorkspaceId();
  return getWorkspacePinnedApps(wsId);
}

export async function addPinnedApp(
  app: Omit<PinnedApp, "sortOrder">
): Promise<PinnedApp> {
  const wsId = await getActiveWorkspaceId();
  return addPinnedAppToWorkspace(wsId, app);
}

export async function removePinnedApp(id: string): Promise<void> {
  const wsId = await getActiveWorkspaceId();
  return removePinnedAppFromWorkspace(wsId, id);
}

export async function updatePinnedApp(
  id: string,
  data: Partial<Omit<PinnedApp, "id">>
): Promise<PinnedApp> {
  const wsId = await getActiveWorkspaceId();
  return updatePinnedAppInWorkspace(wsId, id, data);
}

export async function reorderPinnedApps(ids: string[]): Promise<void> {
  const wsId = await getActiveWorkspaceId();
  return reorderPinnedAppsInWorkspace(wsId, ids);
}
