import type { ArchiveEntry } from "./types";

const STORAGE_KEY = "archiveEntries";
const MAX_ARCHIVE_ENTRIES = 100;

export async function getArchiveEntries(): Promise<ArchiveEntry[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const entries = (result[STORAGE_KEY] as ArchiveEntry[] | undefined) ?? [];
  return entries.sort((a, b) => b.archivedAt - a.archivedAt);
}

export async function addArchiveEntry(entry: ArchiveEntry): Promise<void> {
  const entries = await getArchiveEntries();
  entries.unshift(entry);
  // Cap at MAX_ARCHIVE_ENTRIES
  const capped = entries.slice(0, MAX_ARCHIVE_ENTRIES);
  await chrome.storage.local.set({ [STORAGE_KEY]: capped });
}

export async function removeArchiveEntry(id: string): Promise<void> {
  const entries = await getArchiveEntries();
  const filtered = entries.filter((e) => e.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
}

export async function clearArchiveEntries(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: [] });
}
