import { useEffect, useState } from "react";
import type { TabInfo, ServiceWorkerMessage } from "../shared/types";

export default function App() {
  const [tabs, setTabs] = useState<TabInfo[]>([]);

  useEffect(() => {
    // Request initial tab list from service worker
    chrome.runtime.sendMessage({ type: "GET_TABS" }, (response: TabInfo[]) => {
      if (response) {
        setTabs(response);
      }
    });

    // Also try loading from storage in case service worker responds slowly
    chrome.storage.local.get("tabList", (result) => {
      if (result.tabList && Array.isArray(result.tabList)) {
        const stored = result.tabList as TabInfo[];
        setTabs((prev) => (prev.length === 0 ? stored : prev));
      }
    });

    // Listen for tab state updates from service worker
    const handleMessage = (message: ServiceWorkerMessage) => {
      if (message.type === "TABS_UPDATED") {
        setTabs(message.tabs);
      } else if (message.type === "TAB_ACTIVATED") {
        setTabs((prev) =>
          prev.map((tab) => ({
            ...tab,
            active:
              tab.id === message.tabId && tab.windowId === message.windowId,
          }))
        );
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <header className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-lg font-semibold">ArcFlow</h1>
      </header>
      <div className="p-2">
        <p className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">
          {tabs.length} tab{tabs.length !== 1 ? "s" : ""} open
        </p>
        <ul>
          {tabs.map((tab) => (
            <li
              key={tab.id}
              className="flex items-center gap-2 px-2 py-1 text-sm truncate"
            >
              {tab.favIconUrl && (
                <img src={tab.favIconUrl} alt="" className="w-4 h-4 shrink-0" />
              )}
              <span className="truncate">{tab.title || tab.url}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
