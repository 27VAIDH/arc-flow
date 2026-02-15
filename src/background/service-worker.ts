// ArcFlow service worker - background script
import type {
  TabInfo,
  ServiceWorkerMessage,
  SidePanelMessage,
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
} from "../shared/workspaceStorage";
import { getSettings } from "../shared/settingsStorage";
import { addArchiveEntry } from "../shared/archiveStorage";

const CONTEXT_MENU_ID = "arcflow-pin-toggle";

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

  // Register auto-archive alarm (every 5 minutes)
  chrome.alarms.create("arcflow-auto-archive", { periodInMinutes: 5 });
});

// Open side panel when the toolbar icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// --- Tab tracking ---

const STORAGE_KEY = "tabList";
const DEBOUNCE_MS = 50;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

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

// On startup, query existing tabs and persist + broadcast
async function initialize(): Promise<void> {
  const tabs = await queryCurrentWindowTabs();
  await persistTabs(tabs);
  broadcastTabs(tabs);
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

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) return;

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

// Tab lifecycle event listeners
chrome.tabs.onCreated.addListener((tab) => {
  // Auto-assign new tabs to the active workspace
  if (tab.id != null) {
    chrome.storage.local.get("activeWorkspaceId", (result) => {
      const activeWsId =
        (result.activeWorkspaceId as string | undefined) ?? "default";
      assignTabToWorkspace(tab.id!, activeWsId).then(() => {
        broadcastTabWorkspaceMap();
        // If full isolation is enabled, add the tab to its workspace tab group
        applyWorkspaceIsolation(activeWsId).catch(() => {});
      });
    });
  }
  debouncedRefresh();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  // Clean up tab-workspace mapping
  removeTabFromMap(tabId).then(() => {
    broadcastTabWorkspaceMap();
  });
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
  debouncedRefresh();
});

chrome.tabs.onUpdated.addListener(() => {
  debouncedRefresh();
});

chrome.tabs.onMoved.addListener(() => {
  debouncedRefresh();
});

// --- Workspace isolation via Chrome tab groups ---

async function applyWorkspaceIsolation(
  activeWorkspaceId: string
): Promise<void> {
  const settings = await getSettings();
  if (settings.workspaceIsolation !== "full-isolation") return;

  const workspaces = await getWorkspaces();
  const tabWorkspaceMap = await getTabWorkspaceMap();
  const allTabs = await chrome.tabs.query({ currentWindow: true });

  // Group tabs by workspace ID
  const tabsByWorkspace = new Map<string, number[]>();
  for (const tab of allTabs) {
    if (tab.id == null) continue;
    const wsId = tabWorkspaceMap[String(tab.id)] ?? "default";
    const existing = tabsByWorkspace.get(wsId) ?? [];
    existing.push(tab.id);
    tabsByWorkspace.set(wsId, existing);
  }

  // Get existing tab groups in the current window
  const currentWindow = await chrome.windows.getCurrent();
  const existingGroups = await chrome.tabGroups.query({
    windowId: currentWindow.id,
  });

  for (const [wsId, tabIds] of tabsByWorkspace) {
    if (tabIds.length === 0) continue;

    const workspace = workspaces.find((w) => w.id === wsId);
    const groupTitle = workspace?.name ?? "Default";
    const isActive = wsId === activeWorkspaceId;

    // Check if a tab group with this title already exists
    const existingGroup = existingGroups.find((g) => g.title === groupTitle);

    // Chrome types require a non-empty tuple for tabIds
    const tabIdsTuple = tabIds as [number, ...number[]];

    if (existingGroup) {
      // Move tabs into the existing group
      await chrome.tabs.group({
        tabIds: tabIdsTuple,
        groupId: existingGroup.id,
      });
      // Collapse non-active workspace groups
      await chrome.tabGroups.update(existingGroup.id, {
        collapsed: !isActive,
      });
    } else {
      // Create a new tab group
      const groupId = await chrome.tabs.group({ tabIds: tabIdsTuple });
      await chrome.tabGroups.update(groupId, {
        title: groupTitle,
        collapsed: !isActive,
      });
    }
  }
}

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

  // Apply workspace isolation if enabled
  await applyWorkspaceIsolation(targetWorkspace.id).catch(() => {});
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

// Listen for the auto-archive alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ARCHIVE_ALARM_NAME) {
    runAutoArchive().catch(() => {
      // Silently fail — will retry on next alarm
    });
    runAutoSuspend().catch(() => {
      // Silently fail — will retry on next alarm
    });
  }
});

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
      getTabWorkspaceMap().then((map) => {
        sendResponse(map);
      });
      return true; // async response
    }
    if (message.type === "MOVE_TAB_TO_WORKSPACE") {
      assignTabToWorkspace(message.tabId, message.workspaceId).then(() => {
        broadcastTabWorkspaceMap();
      });
    }
    if (message.type === "APPLY_WORKSPACE_ISOLATION") {
      applyWorkspaceIsolation(message.activeWorkspaceId).catch(() => {
        // Tab groups API may not be available
      });
    }
    if (message.type === "SUSPEND_TAB") {
      chrome.tabs.discard(message.tabId).catch(() => {
        // Tab may not exist or cannot be discarded
      });
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
