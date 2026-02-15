// ArcFlow service worker - background script
import type {
  TabInfo,
  ServiceWorkerMessage,
  SidePanelMessage,
} from "../shared/types";

// Register side panel on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({
    path: "src/sidepanel/index.html",
    enabled: true,
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

// Tab lifecycle event listeners
chrome.tabs.onCreated.addListener(() => {
  debouncedRefresh();
});

chrome.tabs.onRemoved.addListener(() => {
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
  }
);
