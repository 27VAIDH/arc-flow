// ArcFlow service worker - background script
import type {
  TabInfo,
  ServiceWorkerMessage,
  SidePanelMessage,
  WorkspaceSuggestion,
  RecentlyClosedTab,
  Snippet,
} from "../shared/types";
import {
  getPinnedApps,
  addPinnedApp,
  removePinnedApp,
} from "../shared/storage";
import {
  getTabWorkspaceMap,
  getWorkspaces,
  setActiveWorkspace,
  assignTabToWorkspace,
  removeTabFromMap,
  updateWorkspace,
} from "../shared/workspaceStorage";
import { getSettings } from "../shared/settingsStorage";
import { addArchiveEntry, getArchiveEntries } from "../shared/archiveStorage";
import { matchRoute } from "../shared/routingEngine";
import { calculateEnergyScore } from "../shared/energyScore";

const CONTEXT_MENU_ID = "arcflow-pin-toggle";
const SAVE_TO_NOTES_MENU_ID = "arcflow-save-to-notes";
const SAVE_SNIPPET_MENU_ID = "arcflow-save-snippet";

// Register side panel on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({
    path: "src/sidepanel/index.html",
    enabled: true,
  });

  // Create context menu for page-level pin/unpin
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Pin to ArcFlow",
    contexts: ["page"],
  });

  // Create context menu for saving selected text to notes
  chrome.contextMenus.create({
    id: SAVE_TO_NOTES_MENU_ID,
    title: "Save to ArcFlow Notes",
    contexts: ["selection"],
  });

  // Create context menu for saving snippets
  chrome.contextMenus.create({
    id: SAVE_SNIPPET_MENU_ID,
    title: "Save Snippet to ArcFlow",
    contexts: ["selection"],
  });

  // Register auto-archive alarm (every 5 minutes)
  chrome.alarms.create("arcflow-auto-archive", { periodInMinutes: 5 });

  // Register workspace suggestion check alarm (every 5 minutes)
  chrome.alarms.create("arcflow-workspace-suggestion", { periodInMinutes: 5 });

  // Register daily snapshot alarm (every 24 hours)
  chrome.alarms.create("arcflow-daily-snapshot", { periodInMinutes: 1440 });

  // Register energy score recalculation alarm (every 5 minutes)
  chrome.alarms.create("arcflow-energy-recalc", { periodInMinutes: 5 });
});

// Open side panel when the toolbar icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// --- Tab tracking ---

const STORAGE_KEY = "tabList";
const DEBOUNCE_MS = 50;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// --- Recently closed tabs: in-memory tab info cache ---
// We cache tab info because chrome.tabs.get() doesn't work after a tab is removed.
const tabInfoCache = new Map<number, { url: string; title: string; favIconUrl: string }>();
const RECENTLY_CLOSED_KEY = "recentlyClosed";
const MAX_RECENTLY_CLOSED = 20;

function mapTab(tab: chrome.tabs.Tab): TabInfo {
  return {
    id: tab.id ?? -1,
    url: tab.url ?? "",
    title: tab.title ?? "",
    favIconUrl: tab.favIconUrl ?? "",
    active: tab.active ?? false,
    audible: tab.audible ?? false,
    discarded: tab.discarded ?? false,
    windowId: tab.windowId,
  };
}

async function queryCurrentWindowTabs(): Promise<TabInfo[]> {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  return tabs.map(mapTab);
}

async function persistTabs(tabs: TabInfo[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: tabs });
}

function broadcastTabs(tabs: TabInfo[]): void {
  const message: ServiceWorkerMessage = { type: "TABS_UPDATED", tabs };
  chrome.runtime.sendMessage(message).catch(() => {
    // Side panel may not be open; ignore the error
  });
}

function broadcastTabWorkspaceMap(): void {
  getTabWorkspaceMap().then((tabWorkspaceMap) => {
    const message: ServiceWorkerMessage = {
      type: "TAB_WORKSPACE_MAP_UPDATED",
      tabWorkspaceMap,
    };
    chrome.runtime.sendMessage(message).catch(() => {
      // Side panel may not be open
    });
  });
}

function debouncedRefresh(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(async () => {
    debounceTimer = null;
    const tabs = await queryCurrentWindowTabs();
    await persistTabs(tabs);
    broadcastTabs(tabs);
  }, DEBOUNCE_MS);
}

// Reconcile: assign unmapped tabs to the active workspace and remove stale entries
async function reconcileTabWorkspaceMap(): Promise<Record<string, string>> {
  const tabs = await queryCurrentWindowTabs();
  const tabMap = await getTabWorkspaceMap();
  const result = await chrome.storage.local.get("activeWorkspaceId");
  const activeWsId =
    (result.activeWorkspaceId as string | undefined) ?? "default";
  const currentTabIds = new Set(tabs.map((t) => String(t.id)));
  let changed = false;

  for (const tab of tabs) {
    const key = String(tab.id);
    if (!tabMap[key]) {
      tabMap[key] = activeWsId;
      changed = true;
    }
  }

  // Remove stale entries for tabs that no longer exist
  for (const key of Object.keys(tabMap)) {
    if (!currentTabIds.has(key)) {
      delete tabMap[key];
      changed = true;
    }
  }

  if (changed) {
    await chrome.storage.local.set({ tabWorkspaceMap: tabMap });
    broadcastTabWorkspaceMap();
  }

  return tabMap;
}

// On startup, query existing tabs and persist + broadcast
async function initialize(): Promise<void> {
  const tabs = await queryCurrentWindowTabs();
  await persistTabs(tabs);
  broadcastTabs(tabs);

  // Populate tab info cache for recently closed tracking
  for (const tab of tabs) {
    if (tab.id > 0) {
      tabInfoCache.set(tab.id, {
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
      });
    }
  }

  // Reconcile: assign any unmapped tabs to the active workspace
  await reconcileTabWorkspaceMap();
}

initialize();

// --- Chrome context menu: Pin/Unpin to ArcFlow ---

function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

async function updateContextMenuTitle(tabId: number): Promise<void> {
  try {
    const tab = await chrome.tabs.get(tabId);
    const tabOrigin = getOrigin(tab.url ?? "");
    if (!tabOrigin) return;

    const apps = await getPinnedApps();
    const isPinned = apps.some((app) => getOrigin(app.url) === tabOrigin);

    chrome.contextMenus.update(CONTEXT_MENU_ID, {
      title: isPinned ? "Unpin from ArcFlow" : "Pin to ArcFlow",
    });
  } catch {
    // Tab may not exist or context menu not ready
  }
}

const MAX_NOTES_CHARS = 5000;

/**
 * Handle "Save to ArcFlow Notes" context menu action.
 * Sends message to content script for optional annotation, then appends to workspace notes.
 */
async function handleSaveToNotes(
  tabId: number,
  selectedText: string,
  pageTitle: string,
  pageUrl: string
): Promise<void> {
  // Get the active workspace for this tab
  const tabMap = await getTabWorkspaceMap();
  const wsId = tabMap[String(tabId)] ?? "default";
  const workspaces = await getWorkspaces();
  const ws = workspaces.find((w) => w.id === wsId);
  const wsName = ws ? `${ws.emoji} ${ws.name}` : "Default";
  const currentNotes = ws?.notes ?? "";

  // Send message to content script to show annotation popup
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "ARCFLOW_CAPTURE_SELECTION",
      selectedText,
    }) as { action: string; annotation?: string } | undefined;

    if (!response || response.action === "cancel") return;

    const annotation = response.annotation ?? "";

    // Build the note entry
    let noteEntry = `\n\n> ${selectedText}\n— [${pageTitle}](${pageUrl})`;
    if (annotation) {
      noteEntry += `\n📝 ${annotation}`;
    }

    // Check if appending would exceed the limit
    const newNotes = currentNotes + noteEntry;
    if (newNotes.length > MAX_NOTES_CHARS) {
      // Notify content script that notes are full
      chrome.tabs.sendMessage(tabId, { type: "ARCFLOW_NOTES_FULL" }).catch(() => {});
      return;
    }

    // Append to workspace notes
    await updateWorkspace(wsId, {
      notes: newNotes,
      notesLastEditedAt: Date.now(),
    });

    // Notify sidepanel about the notes update
    const notifyMessage: ServiceWorkerMessage = {
      type: "notes-saved-from-page",
      workspaceName: wsName,
    };
    chrome.runtime.sendMessage(notifyMessage).catch(() => {
      // Side panel may not be open
    });
  } catch {
    // Content script may not be injected (e.g., chrome:// pages)
    console.error("Failed to save to ArcFlow Notes — content script not available");
  }
}

const MAX_SNIPPETS_PER_WORKSPACE = 50;

/**
 * Handle "Save Snippet to ArcFlow" context menu action.
 * Shows annotation popup via content script, then saves snippet to workspace storage.
 */
async function handleSaveSnippet(
  tabId: number,
  selectedText: string,
  pageTitle: string,
  pageUrl: string
): Promise<void> {
  const tabMap = await getTabWorkspaceMap();
  const wsId = tabMap[String(tabId)] ?? "default";
  const workspaces = await getWorkspaces();
  const ws = workspaces.find((w) => w.id === wsId);
  const wsName = ws ? `${ws.emoji} ${ws.name}` : "Default";

  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "ARCFLOW_CAPTURE_SNIPPET",
      selectedText,
    }) as { action: string; annotation?: string } | undefined;

    if (!response || response.action === "cancel") return;

    const annotation = response.annotation ?? "";
    const storageKey = `snippets_${wsId}`;

    const result = await chrome.storage.local.get(storageKey);
    const snippets: Snippet[] = (result[storageKey] as Snippet[] | undefined) ?? [];

    const newSnippet: Snippet = {
      id: crypto.randomUUID(),
      text: selectedText,
      annotation,
      sourceUrl: pageUrl,
      sourceTitle: pageTitle,
      savedAt: Date.now(),
    };

    snippets.unshift(newSnippet);

    // Cap at max, remove oldest if exceeded
    let warning = false;
    if (snippets.length > MAX_SNIPPETS_PER_WORKSPACE) {
      snippets.splice(MAX_SNIPPETS_PER_WORKSPACE);
      warning = true;
    }

    await chrome.storage.local.set({ [storageKey]: snippets });

    // Notify sidepanel
    const notifyMessage: ServiceWorkerMessage = {
      type: "snippet-saved",
      workspaceName: wsName,
    };
    chrome.runtime.sendMessage(notifyMessage).catch(() => {});

    if (warning) {
      console.warn(`Snippets for workspace ${wsId} exceeded ${MAX_SNIPPETS_PER_WORKSPACE} — oldest removed`);
    }
  } catch {
    console.error("Failed to save snippet — content script not available");
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  // --- Pin/Unpin to ArcFlow ---
  if (info.menuItemId === CONTEXT_MENU_ID && tab?.id) {
    const tabUrl = tab.url ?? info.pageUrl ?? "";
    const tabOrigin = getOrigin(tabUrl);
    if (!tabOrigin) return;

    const apps = await getPinnedApps();
    const existing = apps.find((app) => getOrigin(app.url) === tabOrigin);

    if (existing) {
      await removePinnedApp(existing.id);
    } else {
      await addPinnedApp({
        id: crypto.randomUUID(),
        url: tabUrl,
        title: tab.title ?? tabUrl,
        favicon: tab.favIconUrl ?? "",
      }).catch(() => {
        // Max pinned apps reached
      });
    }

    // Update menu title after toggle
    if (tab.id) {
      await updateContextMenuTitle(tab.id);
    }
    return;
  }

  // --- Save to ArcFlow Notes ---
  if (info.menuItemId === SAVE_TO_NOTES_MENU_ID && tab?.id) {
    const selectedText = info.selectionText ?? "";
    if (!selectedText) return;

    await handleSaveToNotes(tab.id, selectedText, tab.title ?? "", tab.url ?? "");
    return;
  }

  // --- Save Snippet to ArcFlow ---
  if (info.menuItemId === SAVE_SNIPPET_MENU_ID && tab?.id) {
    const selectedText = info.selectionText ?? "";
    if (!selectedText) return;

    await handleSaveSnippet(tab.id, selectedText, tab.title ?? "", tab.url ?? "");
    return;
  }
});

// Update context menu title when active tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  updateContextMenuTitle(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active && tab.id != null) {
    updateContextMenuTitle(tab.id);
  }
});

// --- Air Traffic Control: URL routing rules ---

/** Normalize a URL for deduplication: strip trailing slash, www. prefix, and hash fragment */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove www. prefix
    const hostname = parsed.hostname.replace(/^www\./, "");
    // Rebuild without hash fragment
    const normalized = `${parsed.protocol}//${hostname}${parsed.port ? ":" + parsed.port : ""}${parsed.pathname}${parsed.search}`;
    // Strip trailing slash (but keep root "/" as-is)
    return normalized.length > 1 ? normalized.replace(/\/$/, "") : normalized;
  } catch {
    return url;
  }
}

/** Returns true for URLs that should be ignored by auto-routing */
function isIgnoredUrl(url: string): boolean {
  return (
    !url ||
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("extension://") ||
    url === "about:blank" ||
    url === "chrome://newtab/" ||
    url === "chrome://newtab"
  );
}

async function getWorkspaceForUrl(url: string): Promise<string | null> {
  if (isIgnoredUrl(url)) return null;
  const settings = await getSettings();
  return matchRoute(url, settings.routingRules);
}

// --- Recently closed tabs tracking ---

/**
 * Track a closed tab for recovery, unless it's an ignored URL or was auto-archived.
 */
async function trackRecentlyClosed(tabId: number): Promise<void> {
  const cached = tabInfoCache.get(tabId);
  if (!cached || !cached.url) return;

  // Skip ignored URLs
  if (isIgnoredUrl(cached.url)) return;

  // Skip tabs closed by auto-archive: check if the same URL was archived in the last 2 seconds
  const archiveEntries = await getArchiveEntries();
  const now = Date.now();
  const recentlyArchived = archiveEntries.some(
    (entry) => entry.url === cached.url && now - entry.archivedAt < 2000
  );
  if (recentlyArchived) return;

  // Get workspace ID for this tab
  const tabMap = await getTabWorkspaceMap();
  const workspaceId = tabMap[String(tabId)] ?? "default";

  const entry: RecentlyClosedTab = {
    url: cached.url,
    title: cached.title,
    favicon: cached.favIconUrl,
    workspaceId,
    closedAt: now,
  };

  const result = await chrome.storage.local.get(RECENTLY_CLOSED_KEY);
  const existing = (result[RECENTLY_CLOSED_KEY] as RecentlyClosedTab[] | undefined) ?? [];
  existing.unshift(entry);
  const capped = existing.slice(0, MAX_RECENTLY_CLOSED);
  await chrome.storage.local.set({ [RECENTLY_CLOSED_KEY]: capped });
}

// --- Tab session counters for Morning Briefing ---
// Track tabs opened/closed since the last session (sidebar close)

async function incrementTabCounter(field: "opened" | "closed"): Promise<void> {
  const result = await chrome.storage.local.get("tabSessionCounters");
  const counters = (result.tabSessionCounters as { opened: number; closed: number }) ?? { opened: 0, closed: 0 };
  counters[field] += 1;
  await chrome.storage.local.set({ tabSessionCounters: counters });
}

// --- Analytics data collection ---
// Track browsing analytics: tabs opened/closed, domain visits, workspace time
// All writes debounced (batch every 30 seconds)

interface AnalyticsDailyEntry {
  opened: number;
  closed: number;
  domains: Record<string, number>;
  workspaceMinutes: Record<string, number>;
}

interface AnalyticsData {
  daily: Record<string, AnalyticsDailyEntry>;
}

// In-memory analytics buffer — flushed to storage every 30 seconds
let analyticsDirty = false;
const analyticsBuffer: {
  openedDelta: number;
  closedDelta: number;
  domainDeltas: Record<string, number>;
  workspaceMinutesDeltas: Record<string, number>;
} = { openedDelta: 0, closedDelta: 0, domainDeltas: {}, workspaceMinutesDeltas: {} };

// Track last activation for workspace time calculation
let lastActivationTime: number = 0;
let lastActivationWorkspaceId: string | null = null;

function getAnalyticsTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function analyticsTrackOpened(): void {
  analyticsBuffer.openedDelta += 1;
  analyticsDirty = true;
}

function analyticsTrackClosed(): void {
  analyticsBuffer.closedDelta += 1;
  analyticsDirty = true;
}

function analyticsTrackDomain(url: string): void {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    if (!hostname) return;
    analyticsBuffer.domainDeltas[hostname] = (analyticsBuffer.domainDeltas[hostname] ?? 0) + 1;
    analyticsDirty = true;
  } catch {
    // Malformed URL
  }
}

function analyticsTrackWorkspaceTime(): void {
  if (lastActivationTime > 0 && lastActivationWorkspaceId) {
    const elapsedMs = Date.now() - lastActivationTime;
    const elapsedMinutes = elapsedMs / 60_000;
    // Cap at 30 minutes to avoid inflated values from idle
    const capped = Math.min(elapsedMinutes, 30);
    if (capped > 0.01) {
      analyticsBuffer.workspaceMinutesDeltas[lastActivationWorkspaceId] =
        (analyticsBuffer.workspaceMinutesDeltas[lastActivationWorkspaceId] ?? 0) + capped;
      analyticsDirty = true;
    }
  }
}

function pruneAnalyticsOlderThan30Days(data: AnalyticsData): void {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const dateKey of Object.keys(data.daily)) {
    const d = new Date(dateKey);
    if (d.getTime() < cutoff) {
      delete data.daily[dateKey];
    }
  }
}

async function flushAnalytics(): Promise<void> {
  if (!analyticsDirty) return;

  const todayKey = getAnalyticsTodayKey();
  const result = await chrome.storage.local.get("analytics");
  const analytics: AnalyticsData = (result.analytics as AnalyticsData) ?? { daily: {} };

  if (!analytics.daily[todayKey]) {
    analytics.daily[todayKey] = { opened: 0, closed: 0, domains: {}, workspaceMinutes: {} };
  }

  const today = analytics.daily[todayKey];
  today.opened += analyticsBuffer.openedDelta;
  today.closed += analyticsBuffer.closedDelta;

  for (const [domain, count] of Object.entries(analyticsBuffer.domainDeltas)) {
    today.domains[domain] = (today.domains[domain] ?? 0) + count;
  }

  for (const [wsId, minutes] of Object.entries(analyticsBuffer.workspaceMinutesDeltas)) {
    today.workspaceMinutes[wsId] = (today.workspaceMinutes[wsId] ?? 0) + minutes;
  }

  // Prune old entries
  pruneAnalyticsOlderThan30Days(analytics);

  await chrome.storage.local.set({ analytics });

  // Reset buffer
  analyticsBuffer.openedDelta = 0;
  analyticsBuffer.closedDelta = 0;
  analyticsBuffer.domainDeltas = {};
  analyticsBuffer.workspaceMinutesDeltas = {};
  analyticsDirty = false;
}

// Debounced flush: every 30 seconds
const ANALYTICS_FLUSH_INTERVAL_MS = 30_000;
setInterval(() => {
  flushAnalytics().catch(() => {});
}, ANALYTICS_FLUSH_INTERVAL_MS);

// --- Tab Energy Score tracking ---
// Track activation counts per tab (in-memory, with timestamps for 24h window)
const tabActivationCounts = new Map<number, number[]>();

function trackTabActivation(tabId: number): void {
  const timestamps = tabActivationCounts.get(tabId) ?? [];
  timestamps.push(Date.now());
  tabActivationCounts.set(tabId, timestamps);
}

function getActivationCountLast24h(tabId: number): number {
  const timestamps = tabActivationCounts.get(tabId);
  if (!timestamps) return 0;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  // Prune old timestamps in place
  const recent = timestamps.filter((t) => t >= cutoff);
  tabActivationCounts.set(tabId, recent);
  return recent.length;
}

async function recalculateEnergyScores(): Promise<void> {
  const allTabs = await chrome.tabs.query({ currentWindow: true });
  const workspaces = await getWorkspaces();

  // Build lastActiveAt map from folder items
  const tabLastActiveMap = new Map<number, number>();
  for (const ws of workspaces) {
    for (const folder of ws.folders) {
      for (const item of folder.items) {
        if (item.type === "tab" && item.tabId != null && item.lastActiveAt) {
          tabLastActiveMap.set(item.tabId, item.lastActiveAt);
        }
      }
    }
  }

  const scores: Record<string, number> = {};
  for (const tab of allTabs) {
    if (tab.id == null || !tab.url || isIgnoredUrl(tab.url)) continue;
    const activationCount = getActivationCountLast24h(tab.id);
    const lastActiveAt = tab.active ? Date.now() : (tabLastActiveMap.get(tab.id) ?? 0);
    scores[String(tab.id)] = calculateEnergyScore(
      { tabId: tab.id, url: tab.url, active: tab.active },
      activationCount,
      lastActiveAt
    );
  }

  await chrome.storage.local.set({ tabEnergyScores: scores });

  // Clean up activation counts for tabs that no longer exist
  const currentTabIds = new Set(allTabs.map((t) => t.id).filter((id): id is number => id != null));
  for (const tabId of tabActivationCounts.keys()) {
    if (!currentTabIds.has(tabId)) {
      tabActivationCounts.delete(tabId);
    }
  }
}

// Tab lifecycle event listeners
chrome.tabs.onCreated.addListener((tab) => {
  // Increment tab opened counter for Morning Briefing
  incrementTabCounter("opened").catch(() => {});
  // Analytics: track tab opened
  analyticsTrackOpened();

  if (tab.id != null) {
    const tabUrl = tab.url ?? tab.pendingUrl ?? "";
    const tabId = tab.id;

    // Cache tab info for recently closed tracking
    tabInfoCache.set(tabId, {
      url: tabUrl,
      title: tab.title ?? "",
      favIconUrl: tab.favIconUrl ?? "",
    });

    // Try routing rules first, then fall back to active workspace
    const assignWorkspace = async () => {
      let targetWsId: string | null = null;
      if (tabUrl) {
        targetWsId = await getWorkspaceForUrl(tabUrl);
      }
      if (!targetWsId) {
        const result = await chrome.storage.local.get("activeWorkspaceId");
        targetWsId =
          (result.activeWorkspaceId as string | undefined) ?? "default";
      }
      await assignTabToWorkspace(tabId, targetWsId);
      broadcastTabWorkspaceMap();
    };
    assignWorkspace().catch(() => {});
  }
  debouncedRefresh();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  // Increment tab closed counter for Morning Briefing
  incrementTabCounter("closed").catch(() => {});
  // Analytics: track tab closed
  analyticsTrackClosed();

  // Track recently closed tab before cleanup
  trackRecentlyClosed(tabId).catch(() => {});

  // Clean up tab-workspace mapping
  removeTabFromMap(tabId).then(() => {
    broadcastTabWorkspaceMap();
  });

  // Clean up tab info cache
  tabInfoCache.delete(tabId);

  debouncedRefresh();
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  // Send immediate activation message for snappy active-tab highlighting
  const message: ServiceWorkerMessage = {
    type: "TAB_ACTIVATED",
    tabId: activeInfo.tabId,
    windowId: activeInfo.windowId,
  };
  chrome.runtime.sendMessage(message).catch(() => {
    // Side panel may not be open
  });
  // Update lastActiveAt for auto-archive tracking
  updateLastActiveAt(activeInfo.tabId).catch(() => {});
  // Track activation for energy score
  trackTabActivation(activeInfo.tabId);

  // Analytics: track workspace time (time spent in previous workspace) and domain visit
  analyticsTrackWorkspaceTime();
  (async () => {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (tab.url && !isIgnoredUrl(tab.url)) {
        analyticsTrackDomain(tab.url);
      }
      // Update last activation tracking for next workspace time calculation
      const tabMap = await getTabWorkspaceMap();
      lastActivationTime = Date.now();
      lastActivationWorkspaceId = tabMap[String(activeInfo.tabId)] ?? "default";
    } catch {
      // Tab may not exist
      lastActivationTime = Date.now();
      lastActivationWorkspaceId = null;
    }
  })().catch(() => {});

  debouncedRefresh();
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  // Update tab info cache on URL or title changes
  if (tab.id != null && (changeInfo.url || changeInfo.title || changeInfo.favIconUrl)) {
    const existing = tabInfoCache.get(tab.id) ?? { url: "", title: "", favIconUrl: "" };
    tabInfoCache.set(tab.id, {
      url: changeInfo.url ?? existing.url,
      title: changeInfo.title ?? existing.title,
      favIconUrl: changeInfo.favIconUrl ?? existing.favIconUrl,
    });
  }

  // Auto-route tabs when navigation completes and URL has changed
  if (changeInfo.status === "complete" && tab.url && tab.id != null) {
    const tabId = tab.id;
    const tabUrl = tab.url;

    if (!isIgnoredUrl(tabUrl)) {
      (async () => {
        const settings = await getSettings();
        const matchedWsId = matchRoute(tabUrl, settings.routingRules);
        if (matchedWsId) {
          // Check if tab is already in the target workspace
          const tabMap = await getTabWorkspaceMap();
          const currentWsId = tabMap[String(tabId)];
          if (currentWsId !== matchedWsId) {
            await assignTabToWorkspace(tabId, matchedWsId);
            broadcastTabWorkspaceMap();
            // Notify sidepanel about auto-routing
            const message: ServiceWorkerMessage = {
              type: "tab-auto-routed",
              tabId,
              workspaceId: matchedWsId,
            };
            chrome.runtime.sendMessage(message).catch(() => {
              // Side panel may not be open
            });
          }
        }

        // Duplicate tab detection
        const normalizedNewUrl = normalizeUrl(tabUrl);
        const allTabs = await chrome.tabs.query({ currentWindow: true });
        for (const otherTab of allTabs) {
          if (otherTab.id == null || otherTab.id === tabId) continue;
          if (!otherTab.url || isIgnoredUrl(otherTab.url)) continue;
          if (normalizeUrl(otherTab.url) === normalizedNewUrl) {
            const dupTabMap = await getTabWorkspaceMap();
            const existingWsId = dupTabMap[String(otherTab.id)] ?? "default";
            const workspaces = await getWorkspaces();
            const existingWs = workspaces.find((w) => w.id === existingWsId);
            const dupMessage: ServiceWorkerMessage = {
              type: "duplicate-tab-detected",
              newTabId: tabId,
              existingTabId: otherTab.id,
              existingWorkspaceId: existingWsId,
              existingWorkspaceName: existingWs
                ? `${existingWs.emoji} ${existingWs.name}`
                : "Default",
            };
            chrome.runtime.sendMessage(dupMessage).catch(() => {
              // Side panel may not be open
            });
            break; // Only report first duplicate
          }
        }

        // Check for workspace suggestion (has built-in cooldown)
        await checkForWorkspaceSuggestion();
      })().catch(() => {});
    }
  }
  debouncedRefresh();
});

chrome.tabs.onMoved.addListener(() => {
  debouncedRefresh();
});

// --- Workspace keyboard shortcuts (Ctrl+Shift+1 through Ctrl+Shift+4) ---

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "open-command-palette") {
    chrome.runtime
      .sendMessage({ type: "OPEN_COMMAND_PALETTE" })
      .catch(() => {});
    return;
  }

  const match = command.match(/^switch-workspace-(\d+)$/);
  if (!match) return;

  const index = parseInt(match[1], 10) - 1; // 1-based to 0-based
  const workspaces = await getWorkspaces();
  if (index < 0 || index >= workspaces.length) return;

  const targetWorkspace = workspaces[index];
  await setActiveWorkspace(targetWorkspace.id);
});

// --- Auto-archive engine ---

const ARCHIVE_ALARM_NAME = "arcflow-auto-archive";

// Update lastActiveAt timestamp on folder items matching the activated tab
async function updateLastActiveAt(tabId: number): Promise<void> {
  const result = await chrome.storage.local.get("folders");
  const folders = (result.folders as import("../shared/types").Folder[]) ?? [];
  let changed = false;
  for (const folder of folders) {
    for (const item of folder.items) {
      if (item.type === "tab" && item.tabId === tabId) {
        item.lastActiveAt = Date.now();
        changed = true;
      }
    }
  }
  if (changed) {
    await chrome.storage.local.set({ folders });
  }
}

// Check for stale tabs and archive them
async function runAutoArchive(): Promise<void> {
  const settings = await getSettings();
  // "never" means autoArchiveMinutes <= 0 or a very large sentinel
  if (settings.autoArchiveMinutes <= 0) return;

  const thresholdMs = settings.autoArchiveMinutes * 60_000;
  const now = Date.now();

  // Get pinned app origins to exempt them
  const pinnedApps = await getPinnedApps();
  const pinnedOrigins = new Set(
    pinnedApps.map((app) => getOrigin(app.url)).filter(Boolean)
  );

  // Get all folders and check items
  const result = await chrome.storage.local.get("folders");
  const folders = (result.folders as import("../shared/types").Folder[]) ?? [];
  let changed = false;

  // Get active workspace ID for archive entries
  const wsResult = await chrome.storage.local.get("activeWorkspaceId");
  const activeWorkspaceId =
    (wsResult.activeWorkspaceId as string | undefined) ?? "default";

  for (const folder of folders) {
    for (const item of folder.items) {
      if (item.type !== "tab" || item.isArchived || item.tabId == null)
        continue;

      // Skip if lastActiveAt is 0 (never tracked yet — treat as recently active)
      if (!item.lastActiveAt) continue;

      // Skip pinned app origins
      if (pinnedOrigins.has(getOrigin(item.url))) continue;

      // Check if stale
      if (now - item.lastActiveAt > thresholdMs) {
        // Discard the tab
        try {
          await chrome.tabs.discard(item.tabId);
        } catch {
          // Tab may not exist or cannot be discarded
        }

        // Mark as archived
        item.isArchived = true;
        changed = true;

        // Add to archive entries
        await addArchiveEntry({
          id: crypto.randomUUID(),
          url: item.url,
          title: item.title,
          favicon: item.favicon,
          archivedAt: now,
          workspaceId: activeWorkspaceId,
        });
      }
    }
  }

  if (changed) {
    await chrome.storage.local.set({ folders });
  }
}

// Auto-suspend tabs inactive beyond suspendAfterMinutes
async function runAutoSuspend(): Promise<void> {
  const settings = await getSettings();
  if (settings.suspendAfterMinutes <= 0) return;

  const thresholdMs = settings.suspendAfterMinutes * 60_000;
  const now = Date.now();

  // Get pinned app origins to exempt them
  const pinnedApps = await getPinnedApps();
  const pinnedOrigins = new Set(
    pinnedApps.map((app) => getOrigin(app.url)).filter(Boolean)
  );

  // Get all tabs in the current window
  const allTabs = await chrome.tabs.query({ currentWindow: true });

  // Get folder items to check lastActiveAt for tabs in folders
  const result = await chrome.storage.local.get("folders");
  const folders = (result.folders as import("../shared/types").Folder[]) ?? [];

  // Build a map of tabId -> lastActiveAt from folder items
  const tabLastActive = new Map<number, number>();
  for (const folder of folders) {
    for (const item of folder.items) {
      if (item.type === "tab" && item.tabId != null && item.lastActiveAt) {
        tabLastActive.set(item.tabId, item.lastActiveAt);
      }
    }
  }

  for (const tab of allTabs) {
    if (tab.id == null || tab.active || tab.discarded) continue;

    // Skip pinned app origins
    if (pinnedOrigins.has(getOrigin(tab.url ?? ""))) continue;

    // Check lastActiveAt from folder items; skip if no tracking data
    const lastActive = tabLastActive.get(tab.id);
    if (!lastActive) continue;

    if (now - lastActive > thresholdMs) {
      try {
        await chrome.tabs.discard(tab.id);
      } catch {
        // Tab cannot be discarded
      }
    }
  }
}

// --- Daily snapshot capture ---

const DAILY_SNAPSHOTS_KEY = "dailySnapshots";
const MAX_DAILY_SNAPSHOTS = 7;

interface DailySnapshot {
  workspaces: { id: string; name: string; emoji: string }[];
  tabs: Record<string, { url: string; title: string; favicon: string }[]>;
  createdAt: number;
}

async function captureDailySnapshot(): Promise<void> {
  const workspaces = await getWorkspaces();
  const allTabs = await chrome.tabs.query({ currentWindow: true });
  const tabMap = await getTabWorkspaceMap();

  // Build workspace summary
  const wsInfo = workspaces.map((ws) => ({
    id: ws.id,
    name: ws.name,
    emoji: ws.emoji,
  }));

  // Group tabs by workspace
  const tabsByWs: Record<string, { url: string; title: string; favicon: string }[]> = {};
  for (const tab of allTabs) {
    if (!tab.url || tab.id == null || isIgnoredUrl(tab.url)) continue;
    const wsId = tabMap[String(tab.id)] ?? "default";
    if (!tabsByWs[wsId]) tabsByWs[wsId] = [];
    tabsByWs[wsId].push({
      url: tab.url,
      title: tab.title ?? "",
      favicon: tab.favIconUrl ?? "",
    });
  }

  const todayKey = getAnalyticsTodayKey();
  const snapshot: DailySnapshot = {
    workspaces: wsInfo,
    tabs: tabsByWs,
    createdAt: Date.now(),
  };

  const result = await chrome.storage.local.get(DAILY_SNAPSHOTS_KEY);
  const snapshots: Record<string, DailySnapshot> =
    (result[DAILY_SNAPSHOTS_KEY] as Record<string, DailySnapshot>) ?? {};

  snapshots[todayKey] = snapshot;

  // Keep only last 7 entries
  const keys = Object.keys(snapshots).sort();
  while (keys.length > MAX_DAILY_SNAPSHOTS) {
    const oldest = keys.shift()!;
    delete snapshots[oldest];
  }

  await chrome.storage.local.set({ [DAILY_SNAPSHOTS_KEY]: snapshots });
}

// Listen for alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ARCHIVE_ALARM_NAME) {
    runAutoArchive().catch(() => {
      // Silently fail — will retry on next alarm
    });
    runAutoSuspend().catch(() => {
      // Silently fail — will retry on next alarm
    });
  }
  if (alarm.name === "arcflow-workspace-suggestion") {
    checkForWorkspaceSuggestion().catch(() => {
      // Silently fail — will retry on next alarm
    });
  }
  if (alarm.name === "arcflow-daily-snapshot") {
    captureDailySnapshot().catch(() => {
      // Silently fail — will retry on next alarm
    });
  }
  if (alarm.name === "arcflow-energy-recalc") {
    recalculateEnergyScores().catch(() => {
      // Silently fail — will retry on next alarm
    });
  }
});

// --- AI Auto-workspace suggestion engine ---

const SUGGESTION_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
let lastSuggestionTimestamp = 0;

/**
 * Get tabs that are "unorganized" — not matching any routing rule and not in any folder.
 */
async function getUnorganizedTabs(): Promise<chrome.tabs.Tab[]> {
  const allTabs = await chrome.tabs.query({ currentWindow: true });
  const settings = await getSettings();
  const workspaces = await getWorkspaces();

  // Collect all tab IDs that are in folders
  const tabIdsInFolders = new Set<number>();
  for (const ws of workspaces) {
    for (const folder of ws.folders) {
      for (const item of folder.items) {
        if (item.type === "tab" && item.tabId != null) {
          tabIdsInFolders.add(item.tabId);
        }
      }
    }
  }

  const unorganized: chrome.tabs.Tab[] = [];
  for (const tab of allTabs) {
    if (!tab.url || tab.id == null) continue;
    if (isIgnoredUrl(tab.url)) continue;
    // Skip tabs in folders
    if (tabIdsInFolders.has(tab.id)) continue;
    // Skip tabs matching a routing rule
    if (matchRoute(tab.url, settings.routingRules)) continue;
    unorganized.push(tab);
  }

  return unorganized;
}

/**
 * Domain clustering fallback: if 3+ tabs share the same domain, suggest a workspace.
 */
function domainClusterFallback(
  tabs: chrome.tabs.Tab[]
): WorkspaceSuggestion | null {
  const domainMap = new Map<string, chrome.tabs.Tab[]>();
  for (const tab of tabs) {
    try {
      const hostname = new URL(tab.url!).hostname.replace(/^www\./, "");
      const existing = domainMap.get(hostname) ?? [];
      existing.push(tab);
      domainMap.set(hostname, existing);
    } catch {
      // Skip malformed URLs
    }
  }

  // Find first domain with 3+ tabs
  for (const [domain, domainTabs] of domainMap) {
    if (domainTabs.length >= 3) {
      const shortName =
        domain.split(".")[0].charAt(0).toUpperCase() +
        domain.split(".")[0].slice(1);
      return {
        suggest: true,
        name: shortName,
        emoji: "🌐",
        reason: `${domainTabs.length} tabs open from ${domain}`,
        tabIds: domainTabs.map((t) => t.id!),
        createdAt: Date.now(),
      };
    }
  }

  return null;
}

/**
 * Call OpenRouter API to get a workspace suggestion for unorganized tabs.
 */
async function getAISuggestion(
  apiKey: string,
  tabs: chrome.tabs.Tab[]
): Promise<WorkspaceSuggestion | null> {
  const tabSummary = tabs.map((t) => ({
    title: t.title ?? "",
    url: t.url ?? "",
  }));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "chrome-extension://arcflow",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-001",
          max_tokens: 256,
          messages: [
            {
              role: "user",
              content: `These are unorganized browser tabs. Should they be grouped into a new workspace? If yes, suggest a short workspace name, a single emoji, and a brief reason. Return ONLY a JSON object: {"suggest": boolean, "name": string, "emoji": string, "reason": string}\n\nTabs:\n${JSON.stringify(tabSummary)}`,
            },
          ],
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const text: string = data.choices?.[0]?.message?.content ?? "";

    // Parse JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      suggest?: boolean;
      name?: string;
      emoji?: string;
      reason?: string;
    };

    if (!parsed.suggest || !parsed.name) return null;

    return {
      suggest: true,
      name: parsed.name,
      emoji: parsed.emoji ?? "📁",
      reason: parsed.reason ?? "Multiple related tabs detected",
      tabIds: tabs.map((t) => t.id!),
      createdAt: Date.now(),
    };
  } catch (e) {
    clearTimeout(timeoutId);
    console.error("AI workspace suggestion failed:", e);
    return null;
  }
}

/**
 * Check for unorganized tabs and potentially suggest a new workspace.
 */
async function checkForWorkspaceSuggestion(): Promise<void> {
  // Enforce cooldown
  const now = Date.now();
  if (now - lastSuggestionTimestamp < SUGGESTION_COOLDOWN_MS) return;

  const unorganized = await getUnorganizedTabs();
  if (unorganized.length < 3) return;

  lastSuggestionTimestamp = now;

  const settings = await getSettings();
  let suggestion: WorkspaceSuggestion | null = null;

  if (settings.openRouterApiKey) {
    suggestion = await getAISuggestion(
      settings.openRouterApiKey,
      unorganized
    );
  }

  // Fallback to domain clustering if AI unavailable or returned no suggestion
  if (!suggestion) {
    suggestion = domainClusterFallback(unorganized);
  }

  if (!suggestion) return;

  // Store suggestion
  await chrome.storage.local.set({ pendingWorkspaceSuggestion: suggestion });

  // Notify sidepanel
  const message: ServiceWorkerMessage = {
    type: "workspace-suggestion-ready",
  };
  chrome.runtime.sendMessage(message).catch(() => {
    // Side panel may not be open
  });
}

// --- Split view: side-by-side windows ---

async function openSplitView(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.windowId) return;

  // Get screen/display dimensions from the current window
  const currentWindow = await chrome.windows.get(tab.windowId);
  // Use current window position as reference for screen bounds
  const screenLeft = currentWindow.left ?? 0;
  const screenTop = currentWindow.top ?? 0;

  // Get available screen size via the current window's display
  // Use a generous default if we can't determine the screen size
  const displays = await chrome.system.display.getInfo();
  const primaryDisplay = displays[0];
  const screenWidth = primaryDisplay?.bounds?.width ?? 1920;
  const screenHeight = primaryDisplay?.bounds?.height ?? 1080;
  const workAreaLeft = primaryDisplay?.workArea?.left ?? screenLeft;
  const workAreaTop = primaryDisplay?.workArea?.top ?? screenTop;
  const workAreaWidth = primaryDisplay?.workArea?.width ?? screenWidth;
  const workAreaHeight = primaryDisplay?.workArea?.height ?? screenHeight;

  const halfWidth = Math.floor(workAreaWidth / 2);

  // Move the current window to the left half
  await chrome.windows.update(tab.windowId, {
    left: workAreaLeft,
    top: workAreaTop,
    width: halfWidth,
    height: workAreaHeight,
    state: "normal",
  });

  // Create a new window on the right half with the tab moved into it
  await chrome.windows.create({
    tabId: tab.id!,
    left: workAreaLeft + halfWidth,
    top: workAreaTop,
    width: halfWidth,
    height: workAreaHeight,
    state: "normal",
  });
}

// --- Focus mode: URL redirect via declarativeNetRequest ---

async function applyFocusModeRules(): Promise<void> {
  const settings = await getSettings();
  // Remove all existing dynamic rules first
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const existingIds = existingRules.map((r) => r.id);
  if (existingIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingIds,
    });
  }

  // If focus mode is disabled or no rules, nothing to add
  if (
    !settings.focusMode.enabled ||
    settings.focusMode.redirectRules.length === 0
  ) {
    return;
  }

  // Create redirect rules from the focus mode settings
  const addRules: chrome.declarativeNetRequest.Rule[] =
    settings.focusMode.redirectRules
      .filter((r) => r.blockedPattern && r.redirectUrl)
      .map((rule, index) => {
        // Convert glob pattern to regex filter for declarativeNetRequest
        const escaped = rule.blockedPattern.replace(
          /[.+?^${}()|[\]\\]/g,
          "\\$&"
        );
        const regexFilter = escaped.replace(/\*/g, ".*");

        return {
          id: index + 1,
          priority: 1,
          action: {
            type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
            redirect: { url: rule.redirectUrl },
          },
          condition: {
            regexFilter,
            resourceTypes: [
              chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
            ],
          },
        };
      });

  if (addRules.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({ addRules });
  }
}

// Apply focus mode rules on startup
applyFocusModeRules().catch(() => {});

// Re-apply focus mode rules when settings change
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) {
    applyFocusModeRules().catch(() => {});
  }
});

// --- Chrome Omnibox integration ---

chrome.omnibox.setDefaultSuggestion({
  description: "Search ArcFlow tabs for: %s",
});

chrome.omnibox.onInputChanged.addListener(
  (text: string, suggest: (suggestions: chrome.omnibox.SuggestResult[]) => void) => {
    (async () => {
      const settings = await getSettings();
      if (!settings.omniboxEnabled) {
        suggest([]);
        return;
      }

      const query = text.toLowerCase().trim();
      if (!query) {
        suggest([]);
        return;
      }

      const allTabs = await chrome.tabs.query({});
      const tabMap = await getTabWorkspaceMap();
      const result = await chrome.storage.local.get("activeWorkspaceId");
      const activeWsId = (result.activeWorkspaceId as string | undefined) ?? "default";

      const currentWsMatches: { tab: chrome.tabs.Tab; hostname: string }[] = [];
      const otherWsMatches: { tab: chrome.tabs.Tab; hostname: string }[] = [];

      for (const tab of allTabs) {
        if (!tab.url || tab.id == null) continue;
        try {
          const hostname = new URL(tab.url).hostname;
          if (hostname.includes(query)) {
            const wsId = tabMap[String(tab.id)] ?? "default";
            if (wsId === activeWsId) {
              currentWsMatches.push({ tab, hostname });
            } else {
              otherWsMatches.push({ tab, hostname });
            }
          }
        } catch {
          // Malformed URL, skip
        }
      }

      const ordered = [...currentWsMatches, ...otherWsMatches];
      const suggestions: chrome.omnibox.SuggestResult[] = ordered
        .slice(0, 5)
        .map(({ tab, hostname }) => {
          // Escape XML special characters for omnibox description
          const title = (tab.title ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          const domain = hostname.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          return {
            content: String(tab.id),
            description: `${title} &ndash; <url>${domain}</url> (Switch to Tab)`,
          };
        });

      suggest(suggestions);
    })().catch(() => {
      suggest([]);
    });
  }
);

chrome.omnibox.onInputEntered.addListener(
  (text: string) => {
    (async () => {
      const tabId = parseInt(text, 10);
      if (!isNaN(tabId)) {
        // User selected a tab suggestion — activate it
        const tabMap = await getTabWorkspaceMap();
        const result = await chrome.storage.local.get("activeWorkspaceId");
        const activeWsId = (result.activeWorkspaceId as string | undefined) ?? "default";
        const tabWsId = tabMap[String(tabId)] ?? "default";

        if (tabWsId !== activeWsId) {
          // Cross-workspace: switch workspace first
          await setActiveWorkspace(tabWsId);
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        await chrome.tabs.update(tabId, { active: true });
        // Focus the tab's window
        const tab = await chrome.tabs.get(tabId);
        if (tab.windowId) {
          await chrome.windows.update(tab.windowId, { focused: true });
        }
      } else {
        // No matching tab — open as URL or Google search
        let url: string;
        if (text.includes(".")) {
          url = text.startsWith("http://") || text.startsWith("https://")
            ? text
            : `https://${text}`;
        } else {
          url = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
        }
        await chrome.tabs.create({ url });
      }
    })().catch(() => {});
  }
);

// Handle messages from side panel
chrome.runtime.onMessage.addListener(
  (message: SidePanelMessage, _sender, sendResponse) => {
    if (message.type === "GET_TABS") {
      queryCurrentWindowTabs().then((tabs) => {
        sendResponse(tabs);
      });
      return true; // async response
    }
    if (message.type === "SWITCH_TAB") {
      chrome.tabs.update(message.tabId, { active: true }).catch(() => {
        // Tab may no longer exist
      });
    }
    if (message.type === "CLOSE_TAB") {
      chrome.tabs.remove(message.tabId).catch(() => {
        // Tab may already be closed
      });
    }
    if (message.type === "CLOSE_TABS") {
      chrome.tabs.remove(message.tabIds).catch(() => {
        // Tabs may already be closed
      });
    }
    if (message.type === "OPEN_PINNED_APP_NEW_TAB") {
      chrome.tabs.create({ url: message.url }).catch(() => {});
    }
    if (message.type === "OPEN_URL") {
      chrome.tabs.create({ url: message.url }).catch(() => {});
    }
    if (message.type === "GET_TAB_WORKSPACE_MAP") {
      // Reconcile before responding to catch tabs created between service worker restarts
      reconcileTabWorkspaceMap().then((map) => {
        sendResponse(map);
      });
      return true; // async response
    }
    if (message.type === "MOVE_TAB_TO_WORKSPACE") {
      assignTabToWorkspace(message.tabId, message.workspaceId).then(() => {
        broadcastTabWorkspaceMap();
      });
    }
    if (message.type === "SUSPEND_TAB") {
      chrome.tabs.discard(message.tabId).catch(() => {
        // Tab may not exist or cannot be discarded
      });
    }
    if (message.type === "SPLIT_VIEW") {
      openSplitView(message.tabId).catch(() => {
        // Split view setup failed
      });
    }
    if (message.type === "UPDATE_FOCUS_MODE") {
      applyFocusModeRules().catch(() => {});
    }
    if (message.type === "GET_TAB_INFO") {
      (async () => {
        try {
          const tab = await chrome.tabs.get(message.tabId);
          const tabMap = await getTabWorkspaceMap();
          const wsId = tabMap[String(message.tabId)] ?? "default";
          const workspaces = await getWorkspaces();
          const ws = workspaces.find((w) => w.id === wsId);

          // Look up lastActiveAt from folder items across all workspaces
          let lastActiveAt = 0;
          if (tab.active) {
            lastActiveAt = Date.now();
          } else {
            for (const w of workspaces) {
              for (const folder of w.folders) {
                for (const item of folder.items) {
                  if (item.type === "tab" && item.tabId === message.tabId && item.lastActiveAt) {
                    lastActiveAt = item.lastActiveAt;
                  }
                }
              }
            }
          }

          sendResponse({
            lastActiveAt,
            workspaceName: ws?.name ?? "Default",
            workspaceEmoji: ws?.emoji ?? "\u{1F4C1}",
          });
        } catch {
          sendResponse({
            lastActiveAt: 0,
            workspaceName: "Default",
            workspaceEmoji: "\u{1F4C1}",
          });
        }
      })();
      return true; // async response
    }
    if (message.type === "OPEN_PINNED_APP") {
      // Find existing tab with matching origin, or open a new one
      chrome.tabs.query({ currentWindow: true }).then((tabs) => {
        const match = tabs.find((t) => {
          try {
            return t.url && new URL(t.url).origin === message.origin;
          } catch {
            return false;
          }
        });
        if (match && match.id != null) {
          chrome.tabs.update(match.id, { active: true }).catch(() => {});
        } else {
          chrome.tabs.create({ url: message.url }).catch(() => {});
        }
      });
    }
  }
);
