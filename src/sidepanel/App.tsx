import { useCallback, useEffect, useState } from "react";
import type { TabInfo, PinnedApp, ServiceWorkerMessage } from "../shared/types";
import { useTheme, type ThemePreference } from "./useTheme";
import {
  getPinnedApps,
  addPinnedApp,
  removePinnedApp,
} from "../shared/storage";
import PinnedAppsRow from "./PinnedAppsRow";
import FolderTree from "./FolderTree";
import ContextMenu, { type ContextMenuItem } from "./ContextMenu";

function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function TabItem({
  tab,
  onContextMenu,
}: {
  tab: TabInfo;
  onContextMenu: (e: React.MouseEvent, tab: TabInfo) => void;
}) {
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
      onContextMenu={(e) => onContextMenu(e, tab)}
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

const THEME_LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

function ThemeToggle({
  theme,
  onCycle,
}: {
  theme: ThemePreference;
  onCycle: () => void;
}) {
  return (
    <button
      onClick={onCycle}
      className="flex items-center gap-1.5 px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
      aria-label={`Theme: ${THEME_LABELS[theme]}. Click to cycle.`}
      title={`Theme: ${THEME_LABELS[theme]}`}
    >
      {theme === "dark" ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4"
        >
          <path
            fillRule="evenodd"
            d="M7.455 2.004a.75.75 0 0 1 .26.77 7 7 0 0 0 9.958 7.967.75.75 0 0 1 1.067.853A8.5 8.5 0 1 1 6.647 1.921a.75.75 0 0 1 .808.083Z"
            clipRule="evenodd"
          />
        </svg>
      ) : theme === "light" ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4"
        >
          <path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2ZM10 15a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 15ZM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM15.657 5.404a.75.75 0 1 0-1.06-1.06l-1.061 1.06a.75.75 0 0 0 1.06 1.061l1.061-1.06ZM6.464 14.596a.75.75 0 1 0-1.06-1.06l-1.061 1.06a.75.75 0 0 0 1.06 1.061l1.061-1.06ZM18 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 18 10ZM5 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 5 10ZM14.596 15.657a.75.75 0 0 0 1.06-1.06l-1.06-1.061a.75.75 0 1 0-1.061 1.06l1.06 1.061ZM5.404 6.464a.75.75 0 0 0 1.06-1.06l-1.06-1.061a.75.75 0 1 0-1.061 1.06l1.06 1.061Z" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4"
        >
          <path
            fillRule="evenodd"
            d="M2 4.25A2.25 2.25 0 0 1 4.25 2h11.5A2.25 2.25 0 0 1 18 4.25v8.5A2.25 2.25 0 0 1 15.75 15h-3.105a3.501 3.501 0 0 0 1.1 1.677A.75.75 0 0 1 13.26 18H6.74a.75.75 0 0 1-.484-1.323A3.501 3.501 0 0 0 7.355 15H4.25A2.25 2.25 0 0 1 2 12.75v-8.5Zm1.5 0a.75.75 0 0 1 .75-.75h11.5a.75.75 0 0 1 .75.75v7.5a.75.75 0 0 1-.75.75H4.25a.75.75 0 0 1-.75-.75v-7.5Z"
            clipRule="evenodd"
          />
        </svg>
      )}
      {THEME_LABELS[theme]}
    </button>
  );
}

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

export default function App() {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [pinnedApps, setPinnedApps] = useState<PinnedApp[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Load pinned apps and listen for changes
  useEffect(() => {
    getPinnedApps().then(setPinnedApps);

    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === "local" && changes.pinnedApps) {
        const apps = (changes.pinnedApps.newValue as PinnedApp[]) ?? [];
        setPinnedApps(apps.sort((a, b) => a.sortOrder - b.sortOrder));
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

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

  const { theme, cycleTheme } = useTheme();

  const handleTabContextMenu = useCallback(
    (e: React.MouseEvent, tab: TabInfo) => {
      e.preventDefault();
      const origin = getOrigin(tab.url);
      const isPinned = pinnedApps.some((app) => getOrigin(app.url) === origin);

      const items: ContextMenuItem[] = [];

      if (isPinned) {
        items.push({
          label: "Unpin from ArcFlow",
          onClick: () => {
            const app = pinnedApps.find((a) => getOrigin(a.url) === origin);
            if (app) {
              removePinnedApp(app.id);
            }
          },
        });
      } else {
        items.push({
          label: "Pin to ArcFlow",
          onClick: () => {
            addPinnedApp({
              id: crypto.randomUUID(),
              url: tab.url,
              title: tab.title || tab.url,
              favicon: tab.favIconUrl || "",
            }).catch(() => {
              // Max pinned apps reached — silently ignore
            });
          },
        });
      }

      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [pinnedApps]
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <header className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-lg font-semibold">ArcFlow</h1>
      </header>

      {/* Placeholder search bar area */}
      <div className="px-2 py-2">
        <div className="flex items-center h-8 px-2 rounded bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-500 text-sm">
          Search tabs...
        </div>
      </div>

      {/* Pinned Apps Row (Zone 2) */}
      <PinnedAppsRow tabs={tabs} onContextMenu={setContextMenu} />

      {/* Folder Tree (Zone 3) */}
      <FolderTree onContextMenu={setContextMenu} />

      {/* Tab list */}
      <div className="flex-1 px-1">
        <p className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">
          {tabs.length} tab{tabs.length !== 1 ? "s" : ""} open
        </p>
        <ul className="flex flex-col gap-1">
          {tabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              onContextMenu={handleTabContextMenu}
            />
          ))}
        </ul>
      </div>

      {/* Footer */}
      <footer className="flex items-center justify-end px-3 py-2 border-t border-gray-200 dark:border-gray-700">
        <ThemeToggle theme={theme} onCycle={cycleTheme} />
      </footer>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}
