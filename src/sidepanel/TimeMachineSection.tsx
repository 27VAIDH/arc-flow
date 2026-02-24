import { useCallback, useEffect, useState } from "react";
import type { NavTreeNode } from "../shared/types";
import { getTreesForTimeRange } from "../shared/timeMachineStorage";
import { getSettings } from "../shared/settingsStorage";

type DateRange = "today" | "yesterday" | "week";

function getTimeRange(range: DateRange): { start: number; end: number } {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = now.getTime();

  switch (range) {
    case "today":
      return { start: todayStart, end: todayEnd };
    case "yesterday": {
      const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
      return { start: yesterdayStart, end: todayStart };
    }
    case "week": {
      const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;
      return { start: weekStart, end: todayEnd };
    }
  }
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getFaviconUrl(url: string): string {
  try {
    const origin = new URL(url).origin;
    return `${origin}/favicon.ico`;
  } catch {
    return "";
  }
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}

function collectPathUrls(ancestorUrls: string[], node: NavTreeNode): string[] {
  return [...ancestorUrls, node.event.url];
}

async function restorePath(urls: string[]) {
  if (urls.length > 5) {
    const confirmed = window.confirm(
      `This will open ${urls.length} tabs in a new window. Continue?`,
    );
    if (!confirmed) return;
  }
  const newWindow = await chrome.windows.create({ url: urls[0] });
  if (newWindow?.id) {
    for (let i = 1; i < urls.length; i++) {
      await chrome.tabs.create({ windowId: newWindow.id, url: urls[i] });
    }
  }
}

function TreeNode({
  node,
  depth,
  ancestorUrls,
}: {
  node: NavTreeNode;
  depth: number;
  ancestorUrls: string[];
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const pathUrls = collectPathUrls(ancestorUrls, node);

  const handleClick = useCallback(() => {
    chrome.tabs.create({ url: node.event.url });
  }, [node.event.url]);

  const handleRestore = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      restorePath(pathUrls);
    },
    [pathUrls],
  );

  return (
    <div>
      <div
        className="flex items-center gap-1.5 px-1 py-0.5 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800 group"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className="w-3.5 h-3.5 shrink-0 flex items-center justify-center text-gray-400"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`}
            >
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        ) : (
          <span className="w-3.5 h-3.5 shrink-0" />
        )}

        <button
          onClick={handleClick}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
          title={node.event.title || node.event.url}
        >
          {getFaviconUrl(node.event.url) ? (
            <img
              src={getFaviconUrl(node.event.url)}
              alt=""
              className="w-3.5 h-3.5 shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <span className="w-3.5 h-3.5 shrink-0 rounded bg-gray-300 dark:bg-gray-600" />
          )}
          <span className="truncate flex-1 text-xs text-gray-700 dark:text-gray-300">
            {truncate(node.event.title || node.event.url, 40)}
          </span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
            {formatTime(node.event.timestamp)}
          </span>
        </button>

        {/* Restore button (visible on hover) */}
        <button
          onClick={handleRestore}
          className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 rounded hover:bg-gray-300 dark:hover:bg-gray-700 transition-opacity"
          title="Restore browsing path in new window"
          aria-label="Restore browsing path"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-3 h-3 text-gray-500 dark:text-gray-400"
          >
            <path
              fillRule="evenodd"
              d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H4.598a.75.75 0 0 0-.75.75v3.634a.75.75 0 0 0 1.5 0v-2.033l.312.311a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm-7.267-4.053.312.311a7 7 0 0 1 11.712 3.138.75.75 0 0 1-1.449.39 5.5 5.5 0 0 0-9.201-2.466l-.312.311h2.433a.75.75 0 0 1 0 1.5H7.906a.75.75 0 0 1-.75-.75V5.171a.75.75 0 0 1 1.5 0v2.033l.312-.311a.747.747 0 0 1 .077-.078Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.event.id}
              node={child}
              depth={depth + 1}
              ancestorUrls={pathUrls}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TimeMachineSection() {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [trees, setTrees] = useState<NavTreeNode[]>([]);
  const [enabled, setEnabled] = useState(true);

  const loadTrees = useCallback(async () => {
    const settings = await getSettings();
    setEnabled(settings.timeMachineEnabled);
    if (!settings.timeMachineEnabled) return;

    const { start, end } = getTimeRange(dateRange);
    const result = await getTreesForTimeRange(start, end);
    setTrees(result);
  }, [dateRange]);

  useEffect(() => {
    loadTrees();
  }, [loadTrees]);

  // Listen for storage changes (live updates)
  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area === "local" && changes.settings) {
        loadTrees();
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [loadTrees]);

  if (!enabled) return null;

  return (
    <section className="px-1 pb-2" aria-label="Time Machine">
      {/* Collapsible header */}
      <button
        onClick={() => setIsCollapsed((prev) => !prev)}
        aria-expanded={!isCollapsed}
        aria-controls="time-machine-list"
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
        <span>Time Machine ({trees.length})</span>
      </button>

      {/* Content */}
      {!isCollapsed && (
        <div id="time-machine-list">
          {/* Date range selector */}
          <div className="flex gap-1 px-2 pb-1.5">
            {(["today", "yesterday", "week"] as DateRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                  dateRange === range
                    ? "bg-arc-accent text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600"
                }`}
              >
                {range === "today"
                  ? "Today"
                  : range === "yesterday"
                    ? "Yesterday"
                    : "This Week"}
              </button>
            ))}
          </div>

          {/* Tree list */}
          {trees.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 px-2 py-2 text-center">
              No navigation history for this period.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {trees.map((tree) => (
                <TreeNode key={tree.event.id} node={tree} depth={0} ancestorUrls={[]} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
