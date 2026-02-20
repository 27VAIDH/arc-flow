import { useCallback, useEffect, useState } from "react";
import type { RecentlyClosedTab, Workspace } from "../shared/types";

function formatTimeSince(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\u2026";
}

export default function RecentlyClosedSection({
  workspaces,
}: {
  workspaces: Workspace[];
}) {
  const [entries, setEntries] = useState<RecentlyClosedTab[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(true);

  useEffect(() => {
    chrome.storage.local.get("recentlyClosed", (result) => {
      const stored = (result.recentlyClosed as RecentlyClosedTab[]) ?? [];
      setEntries(stored);
    });

    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === "local" && changes.recentlyClosed) {
        const updated =
          (changes.recentlyClosed.newValue as RecentlyClosedTab[]) ?? [];
        setEntries(updated);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const handleReopen = useCallback(
    async (entry: RecentlyClosedTab, index: number) => {
      // Open URL in new tab
      chrome.runtime.sendMessage({ type: "OPEN_URL", url: entry.url });

      // Assign to original workspace via tabWorkspaceMap
      // The service worker will handle workspace assignment for new tabs via routing rules,
      // but we also send a message to explicitly assign it
      if (entry.workspaceId) {
        // Wait briefly for the tab to be created, then assign workspace
        setTimeout(() => {
          chrome.tabs.query({ url: entry.url }, (matchedTabs) => {
            if (matchedTabs && matchedTabs.length > 0) {
              const newTab = matchedTabs[matchedTabs.length - 1];
              if (newTab.id) {
                chrome.runtime.sendMessage({
                  type: "MOVE_TAB_TO_WORKSPACE",
                  tabId: newTab.id,
                  workspaceId: entry.workspaceId,
                });
              }
            }
          });
        }, 500);
      }

      // Remove from list
      const updated = entries.filter((_, i) => i !== index);
      setEntries(updated);
      await chrome.storage.local.set({ recentlyClosed: updated });
    },
    [entries]
  );

  const handleClearAll = useCallback(async () => {
    setEntries([]);
    await chrome.storage.local.set({ recentlyClosed: [] });
  }, []);

  if (entries.length === 0) return null;

  const getWorkspaceEmoji = (workspaceId: string): string => {
    const ws = workspaces.find((w) => w.id === workspaceId);
    return ws?.emoji ?? "";
  };

  return (
    <section className="px-1 pb-2" aria-label="Recently closed tabs">
      {/* Collapsible header */}
      <button
        onClick={() => setIsCollapsed((prev) => !prev)}
        aria-expanded={!isCollapsed}
        aria-controls="recently-closed-list"
        className="flex items-center gap-1 w-full px-2 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-3.5 h-3.5 shrink-0 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
            clipRule="evenodd"
          />
        </svg>
        {/* Clock/history icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-3.5 h-3.5 shrink-0"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z"
            clipRule="evenodd"
          />
        </svg>
        <span>Recently closed ({entries.length})</span>
        <span className="flex-1" />
        {!isCollapsed && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClearAll();
            }}
            className="text-[10px] text-gray-400 hover:text-red-500 dark:hover:text-red-400 cursor-pointer"
            aria-label="Clear all recently closed tabs"
          >
            Clear all
          </button>
        )}
      </button>

      {/* Recently closed entries list */}
      {!isCollapsed && (
        <ul
          id="recently-closed-list"
          className="flex flex-col gap-0.5"
          aria-label="Recently closed tabs"
        >
          {entries.map((entry, index) => (
            <RecentlyClosedItem
              key={`${entry.url}-${entry.closedAt}`}
              entry={entry}
              workspaceEmoji={getWorkspaceEmoji(entry.workspaceId)}
              onReopen={() => handleReopen(entry, index)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentlyClosedItem({
  entry,
  workspaceEmoji,
  onReopen,
}: {
  entry: RecentlyClosedTab;
  workspaceEmoji: string;
  onReopen: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <li
      onClick={onReopen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onReopen();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Reopen ${entry.title}, closed ${formatTimeSince(entry.closedAt)}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center gap-2 px-2 h-7 text-sm rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800 opacity-60 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
    >
      {entry.favicon ? (
        <img
          src={entry.favicon}
          alt=""
          className="w-4 h-4 shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <span className="w-4 h-4 shrink-0 rounded bg-gray-300 dark:bg-gray-600" />
      )}
      <span className="truncate flex-1 select-none text-xs">
        {truncate(entry.title || entry.url, 40)}
      </span>
      {workspaceEmoji && (
        <span className="text-xs shrink-0" title="Original workspace">
          {workspaceEmoji}
        </span>
      )}
      {hovered ? (
        <span className="text-[10px] text-blue-500 dark:text-blue-400 shrink-0 whitespace-nowrap">
          Reopen
        </span>
      ) : (
        <span className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0 whitespace-nowrap">
          {formatTimeSince(entry.closedAt)}
        </span>
      )}
    </li>
  );
}
