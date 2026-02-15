import type { Settings } from "./types";

const SETTINGS_KEY = "settings";

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  autoArchiveMinutes: 720, // 12 hours
  suspendAfterMinutes: 720,
  workspaceIsolation: "sidebar-only",
  focusMode: {
    enabled: false,
    redirectRules: [],
  },
  aiGrouping: {
    enabled: false,
    provider: null,
    apiKey: "",
  },
  routingRules: [],
};

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
