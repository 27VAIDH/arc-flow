import type { Settings } from "./types";
import { DEFAULT_SETTINGS } from "./constants";

const SETTINGS_KEY = "settings";

export { DEFAULT_SETTINGS };

function migrateSettings(stored: Record<string, unknown>): Record<string, unknown> {
  // Migrate old aiGrouping.apiKey to openRouterApiKey
  if (stored.aiGrouping && typeof stored.aiGrouping === "object" && !stored.openRouterApiKey) {
    const legacy = stored.aiGrouping as Record<string, unknown>;
    if (legacy.apiKey && typeof legacy.apiKey === "string") {
      stored.openRouterApiKey = legacy.apiKey;
    }
    delete stored.aiGrouping;
  }
  return stored;
}

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = result[SETTINGS_KEY] as Record<string, unknown> | undefined;
  const migrated = stored ? migrateSettings({ ...stored }) : {};
  return { ...DEFAULT_SETTINGS, ...migrated } as Settings;
}

export async function updateSettings(
  data: Partial<Settings>
): Promise<Settings> {
  const current = await getSettings();
  const updated = { ...current, ...data };
  await chrome.storage.local.set({ [SETTINGS_KEY]: updated });
  return updated;
}

export async function resetSettings(): Promise<Settings> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  return DEFAULT_SETTINGS;
}
