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

// --- Air Traffic Control: URL routing rules ---

function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const regexStr = escaped.replace(/\*/g, ".*");
  return new RegExp(`^${regexStr}$`, "i");
}

async function getWorkspaceForUrl(url: string): Promise<string | null> {
  const settings = await getSettings();
  for (const rule of settings.routingRules) {
    if (globToRegex(rule.pattern).test(url)) {
      return rule.workspaceId;
    }
  }
  return null;
}

// Tab lifecycle event listeners
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id != null) {
    const tabUrl = tab.url ?? tab.pendingUrl ?? "";
    const tabId = tab.id;

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

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  // Re-evaluate routing rules when a tab's URL changes (e.g., new tab navigates to a URL)
  if (changeInfo.url && tab.id != null) {
    const tabId = tab.id;
    getWorkspaceForUrl(changeInfo.url)
      .then(async (matchedWsId) => {
        if (matchedWsId) {
          await assignTabToWorkspace(tabId, matchedWsId);
          broadcastTabWorkspaceMap();
        }
      })
      .catch(() => {});
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
