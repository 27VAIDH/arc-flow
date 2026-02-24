import type { TabSwitchEntry } from "./types";

const STORAGE_KEY = "tabSwitchLog";
const MAX_ENTRIES = 10_000;

async function loadLog(): Promise<TabSwitchEntry[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as TabSwitchEntry[] | undefined) ?? [];
}

export async function recordSwitch(
  fromTabId: number,
  toTabId: number
): Promise<void> {
  const entry: TabSwitchEntry = {
    from: fromTabId,
    to: toTabId,
    timestamp: Date.now(),
  };

  const log = await loadLog();
  log.push(entry);

  // Cap at MAX_ENTRIES — drop oldest entries
  const trimmed = log.length > MAX_ENTRIES ? log.slice(-MAX_ENTRIES) : log;

  await chrome.storage.local.set({ [STORAGE_KEY]: trimmed });
}

export async function getAffinityPairs(
  minCount: number
): Promise<{ from: number; to: number; count: number }[]> {
  const log = await loadLog();

  // Count occurrences of each undirected pair (A→B and B→A count together)
  const counts = new Map<string, { from: number; to: number; count: number }>();
  for (const entry of log) {
    const lo = Math.min(entry.from, entry.to);
    const hi = Math.max(entry.from, entry.to);
    const key = `${lo}:${hi}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, { from: lo, to: hi, count: 1 });
    }
  }

  return Array.from(counts.values()).filter((p) => p.count >= minCount);
}

export async function pruneOldSwitches(maxAgeDays: number): Promise<void> {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const log = await loadLog();
  const pruned = log.filter((entry) => entry.timestamp >= cutoff);
  await chrome.storage.local.set({ [STORAGE_KEY]: pruned });
}
