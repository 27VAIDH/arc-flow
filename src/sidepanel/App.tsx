import { useEffect, useState } from "react";
import type { TabInfo, ServiceWorkerMessage } from "../shared/types";

function TabItem({ tab }: { tab: TabInfo }) {
  const [hovered, setHovered] = useState(false);

  const handleClick = () => {
    chrome.runtime.sendMessage({ type: "SWITCH_TAB", tabId: tab.id });
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: "CLOSE_TAB", tabId: tab.id });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: "CLOSE_TAB", tabId: tab.id });
    }
  };

  return (
    <li
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      className={`flex items-center gap-2 px-2 h-8 text-sm rounded cursor-default hover:bg-gray-200 dark:hover:bg-gray-800 ${
        tab.active
          ? "border-l-[3px] border-l-[#2E75B6] font-bold"
          : "border-l-[3px] border-l-transparent"
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {tab.favIconUrl ? (
        <img
          src={tab.favIconUrl}
          alt=""
          className="w-4 h-4 shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <span className="w-4 h-4 shrink-0 rounded bg-gray-300 dark:bg-gray-600" />
      )}
      <span className="truncate flex-1 select-none">
        {tab.title || tab.url}
      </span>
      {hovered && (
        <button
          onClick={handleClose}
          className="shrink-0 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          aria-label={`Close ${tab.title}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="w-3.5 h-3.5"
          >
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>
      )}
    </li>
  );
}

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

      {/* Placeholder search bar area */}
      <div className="px-2 py-2">
        <div className="flex items-center h-8 px-2 rounded bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-500 text-sm">
          Search tabs...
        </div>
      </div>

      {/* Tab list */}
      <div className="px-1">
        <p className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">
          {tabs.length} tab{tabs.length !== 1 ? "s" : ""} open
        </p>
        <ul className="flex flex-col gap-1">
          {tabs.map((tab) => (
            <TabItem key={tab.id} tab={tab} />
          ))}
        </ul>
      </div>
    </div>
  );
}
