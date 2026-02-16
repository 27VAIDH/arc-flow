import { PinnedApp } from "./types";

const STORAGE_KEY = "pinnedApps";
const MAX_PINNED_APPS = 12;

export async function getPinnedApps(): Promise<PinnedApp[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const apps = (result[STORAGE_KEY] as PinnedApp[] | undefined) ?? [];
  return apps.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function addPinnedApp(
  app: Omit<PinnedApp, "sortOrder">
): Promise<PinnedApp> {
  const apps = await getPinnedApps();
  if (apps.length >= MAX_PINNED_APPS) {
    throw new Error(
      `Maximum of ${MAX_PINNED_APPS} pinned apps reached. Remove one before adding another.`
    );
  }
  const maxOrder = apps.reduce((max, a) => Math.max(max, a.sortOrder), -1);
  const newApp: PinnedApp = { ...app, sortOrder: maxOrder + 1 };
  apps.push(newApp);
  await chrome.storage.local.set({ [STORAGE_KEY]: apps });
  return newApp;
}

export async function removePinnedApp(id: string): Promise<void> {
  const apps = await getPinnedApps();
  const filtered = apps.filter((a) => a.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
}

export async function updatePinnedApp(
  id: string,
  data: Partial<Omit<PinnedApp, "id">>
): Promise<PinnedApp> {
  const apps = await getPinnedApps();
  const index = apps.findIndex((a) => a.id === id);
  if (index === -1) {
    throw new Error(`Pinned app with id "${id}" not found.`);
  }
  apps[index] = { ...apps[index], ...data };
  await chrome.storage.local.set({ [STORAGE_KEY]: apps });
  return apps[index];
}

export async function reorderPinnedApps(ids: string[]): Promise<void> {
  const apps = await getPinnedApps();
  const appMap = new Map(apps.map((a) => [a.id, a]));
  const reordered: PinnedApp[] = [];
  for (let i = 0; i < ids.length; i++) {
    const app = appMap.get(ids[i]);
    if (app) {
      reordered.push({ ...app, sortOrder: i });
    }
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: reordered });
}
