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
  assignTabToWorkspace,
  removeTabFromMap,
} from "../shared/workspaceStorage";

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
  debouncedRefresh();
});

chrome.tabs.onUpdated.addListener(() => {
  debouncedRefresh();
});

chrome.tabs.onMoved.addListener(() => {
  debouncedRefresh();
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
