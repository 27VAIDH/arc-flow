import type { Settings } from "./types";
import { DEFAULT_SETTINGS } from "./constants";

const SETTINGS_KEY = "settings";

export { DEFAULT_SETTINGS };

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const stored = result[SETTINGS_KEY] as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored };
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
