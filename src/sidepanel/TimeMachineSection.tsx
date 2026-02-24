import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NavTreeNode } from "../shared/types";
import { getTreesForTimeRange } from "../shared/timeMachineStorage";
import { getSettings } from "../shared/settingsStorage";

type DateRange = "today" | "yesterday" | "week";

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function collectDomains(trees: NavTreeNode[]): string[] {
  const domains = new Set<string>();
  function walk(node: NavTreeNode) {
    domains.add(getDomain(node.event.url));
    node.children.forEach(walk);
  }
  trees.forEach(walk);
  return Array.from(domains).sort();
}

function nodeMatchesFilter(
  node: NavTreeNode,
  searchLower: string,
  domainFilter: string,
): boolean {
  const titleMatch =
    !searchLower ||
    (node.event.title || "").toLowerCase().includes(searchLower) ||
    node.event.url.toLowerCase().includes(searchLower);
  const domainMatch =
    !domainFilter || getDomain(node.event.url) === domainFilter;
  return titleMatch && domainMatch;
}

function treeHasMatch(
  node: NavTreeNode,
  searchLower: string,
  domainFilter: string,
): boolean {
  if (nodeMatchesFilter(node, searchLower, domainFilter)) return true;
  return node.children.some((child) =>
    treeHasMatch(child, searchLower, domainFilter),
  );
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

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

function formatTimeHHMM(timestamp: number): string {
  const date = new Date(timestamp);
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function treeToMarkdown(node: NavTreeNode, depth: number): string {
  const indent = "  ".repeat(depth);
  const title = node.event.title || node.event.url;
  const time = formatTimeHHMM(node.event.timestamp);
  let md = `${indent}- [${title}](${node.event.url}) (${time})\n`;
  for (const child of node.children) {
    md += treeToMarkdown(child, depth + 1);
  }
  return md;
}

function exportTreesAsMarkdown(trees: NavTreeNode[], dateRange: DateRange): string {
  const rangeLabel =
    dateRange === "today" ? "Today" : dateRange === "yesterday" ? "Yesterday" : "This Week";
  let md = `# Time Machine Export — ${rangeLabel}\n\n`;
  for (const tree of trees) {
    md += treeToMarkdown(tree, 0);
    md += "\n";
  }
  return md.trimEnd() + "\n";
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
  searchLower,
  domainFilter,
}: {
  node: NavTreeNode;
  depth: number;
  ancestorUrls: string[];
  searchLower: string;
  domainFilter: string;
}) {
  const isFiltering = searchLower !== "" || domainFilter !== "";
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const pathUrls = collectPathUrls(ancestorUrls, node);

  // Auto-expand when filtering and this subtree has matches
  const hasMatchInSubtree = useMemo(
    () => (isFiltering ? treeHasMatch(node, searchLower, domainFilter) : true),
    [node, searchLower, domainFilter, isFiltering],
  );

  // Hide this entire subtree if no matches
  if (isFiltering && !hasMatchInSubtree) return null;

  const selfMatches = isFiltering
    ? nodeMatchesFilter(node, searchLower, domainFilter)
    : false;
  const isExpanded = isFiltering ? true : expanded;

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
    <div className="relative">
      {/* Horizontal connector line from parent's vertical line to this node */}
      {depth > 0 && (
        <span
          className="absolute border-t border-gray-300 dark:border-gray-600"
          style={{
            left: `${(depth - 1) * 16 + 11}px`,
            top: "12px",
            width: "9px",
          }}
        />
      )}

      <div
        className={`flex items-center gap-1.5 px-1 py-0.5 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800 group ${
          hasChildren ? "font-medium" : ""
        } ${isFiltering && selfMatches ? "bg-yellow-100 dark:bg-yellow-900/30" : ""}`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className="w-3.5 h-3.5 shrink-0 flex items-center justify-center text-arc-accent dark:text-arc-accent"
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
            >
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        ) : (
          <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center">
            <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500" />
          </span>
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

      {/* Children with connector lines and animated expand/collapse */}
      {hasChildren && (
        <div
          className="grid transition-[grid-template-rows] duration-200 ease-in-out"
          style={{
            gridTemplateRows: isExpanded ? "1fr" : "0fr",
          }}
        >
          <div className="overflow-hidden">
            <div className="relative">
              {/* Vertical connector line from parent to last child */}
              <span
                className="absolute top-0 bottom-3 border-l border-gray-300 dark:border-gray-600"
                style={{ left: `${depth * 16 + 11}px` }}
              />
              {node.children.map((child) => (
                <TreeNode
                  key={child.event.id}
                  node={child}
                  depth={depth + 1}
                  ancestorUrls={pathUrls}
                  searchLower={searchLower}
                  domainFilter={domainFilter}
                />
              ))}
            </div>
          </div>
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
  const [searchQuery, setSearchQuery] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debouncedSearch = useDebounce(searchQuery, 300);
  const searchLower = debouncedSearch.toLowerCase();
  const domains = useMemo(() => collectDomains(trees), [trees]);

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

  const handleExport = useCallback(async () => {
    const md = exportTreesAsMarkdown(trees, dateRange);
    await navigator.clipboard.writeText(md);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  }, [trees, dateRange]);

  if (!enabled) return null;

  return (
    <section className="px-1 pb-2 relative" aria-label="Time Machine">
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
        <span className="flex-1">Time Machine ({trees.length})</span>
      </button>

      {/* Export button */}
      {!isCollapsed && trees.length > 0 && (
        <button
          onClick={handleExport}
          className="absolute right-2 top-1.5 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          title="Export as Markdown"
          aria-label="Export timeline as Markdown"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-3.5 h-3.5"
          >
            <path
              d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z"
            />
            <path
              d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z"
            />
          </svg>
        </button>
      )}

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

          {/* Search and domain filter */}
          <div className="flex gap-1 px-2 pb-1.5">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title or URL..."
              className="flex-1 text-[10px] px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 focus:outline-none focus:border-arc-accent placeholder-gray-400 dark:placeholder-gray-500"
            />
            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="text-[10px] px-1 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 focus:outline-none focus:border-arc-accent"
            >
              <option value="">All domains</option>
              {domains.map((domain) => (
                <option key={domain} value={domain}>
                  {domain}
                </option>
              ))}
            </select>
          </div>

          {/* Tree list */}
          {trees.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 px-2 py-2 text-center">
              No navigation history for this period.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {trees.map((tree) => (
                <TreeNode
                  key={tree.event.id}
                  node={tree}
                  depth={0}
                  ancestorUrls={[]}
                  searchLower={searchLower}
                  domainFilter={domainFilter}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Toast notification */}
      {toastVisible && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 text-[10px] px-3 py-1 rounded shadow-lg animate-pulse">
          Copied to clipboard!
        </div>
      )}
    </section>
  );
}
