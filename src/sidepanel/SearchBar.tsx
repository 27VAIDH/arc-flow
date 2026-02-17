import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type KeyboardEvent,
} from "react";
import Fuse from "fuse.js";
import type { TabInfo, Folder, Workspace } from "../shared/types";

interface SearchResult {
  type: "tab" | "folder" | "link";
  id: string;
  title: string;
  url: string;
  favicon: string;
  tabId?: number;
  folderId?: string;
  folderName?: string;
  score: number;
  matchType?: "switch-to-tab";
}

interface SearchBarProps {
  tabs: TabInfo[];
  folders: Folder[];
  allTabs: TabInfo[];
  tabWorkspaceMap: Record<string, string>;
  activeWorkspaceId: string;
  workspaces: Workspace[];
  onSwitchTab: (tabId: number) => void;
  onOpenUrl: (url: string) => void;
}

function buildSearchItems(tabs: TabInfo[], folders: Folder[]): SearchResult[] {
  const items: SearchResult[] = [];

  for (const tab of tabs) {
    items.push({
      type: "tab",
      id: `tab-${tab.id}`,
      title: tab.title || tab.url,
      url: tab.url,
      favicon: tab.favIconUrl,
      tabId: tab.id,
      score: 0,
    });
  }

  for (const folder of folders) {
    items.push({
      type: "folder",
      id: `folder-${folder.id}`,
      title: folder.name,
      url: "",
      favicon: "",
      folderId: folder.id,
      score: 0,
    });

    for (const item of folder.items) {
      if (item.type === "link" || item.type === "tab") {
        items.push({
          type: item.type === "tab" ? "tab" : "link",
          id: `${item.type}-${item.id}`,
          title: item.title || item.url,
          url: item.url,
          favicon: item.favicon,
          tabId: item.type === "tab" && item.tabId != null ? item.tabId : undefined,
          folderId: folder.id,
          folderName: folder.name,
          score: 0,
        });
      }
    }
  }

  return items;
}

export default function SearchBar({
  tabs,
  folders,
  allTabs,
  tabWorkspaceMap,
  activeWorkspaceId,
  workspaces,
  onSwitchTab,
  onOpenUrl,
}: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Debounce query at 150ms and reset selection
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setSelectedIndex(0);
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  const searchItems = useMemo(
    () => buildSearchItems(tabs, folders),
    [tabs, folders]
  );

  const fuse = useMemo(
    () =>
      new Fuse(searchItems, {
        keys: [
          { name: "title", weight: 0.6 },
          { name: "url", weight: 0.3 },
          { name: "folderName", weight: 0.1 },
        ],
        threshold: 0.4,
        includeScore: true,
        shouldSort: true,
      }),
    [searchItems]
  );

  const results = useMemo(() => {
    if (!debouncedQuery.trim()) return [];

    const q = debouncedQuery.toLowerCase();

    // Domain-match pass: find allTabs whose hostname includes the query
    const currentWsMatches: SearchResult[] = [];
    const otherWsMatches: SearchResult[] = [];
    const domainMatchTabIds = new Set<number>();

    for (const tab of allTabs) {
      try {
        const hostname = new URL(tab.url).hostname.toLowerCase();
        if (hostname.includes(q)) {
          const tabWsId = tabWorkspaceMap[String(tab.id)] || "default";
          const result: SearchResult = {
            type: "tab",
            id: `tab-${tab.id}`,
            title: tab.title || tab.url,
            url: tab.url,
            favicon: tab.favIconUrl,
            tabId: tab.id,
            score: 0,
            matchType: "switch-to-tab",
          };
          if (tabWsId === activeWorkspaceId) {
            currentWsMatches.push(result);
          } else {
            otherWsMatches.push(result);
          }
          domainMatchTabIds.add(tab.id);
        }
      } catch {
        // Skip tabs with malformed URLs
      }
    }

    const domainResults = [...currentWsMatches, ...otherWsMatches];

    // Fuse.js fuzzy search pass
    const fuseResults = fuse.search(debouncedQuery);

    // Custom ranking: exact > starts-with > fuzzy > URL match
    const rankedFuseResults = fuseResults
      .map((r) => {
        const item = r.item;
        const titleLower = item.title.toLowerCase();
        const urlLower = item.url.toLowerCase();

        let rankScore = r.score ?? 1;

        if (titleLower === q) {
          rankScore = 0;
        } else if (titleLower.startsWith(q)) {
          rankScore = Math.min(rankScore, 0.1);
        } else if (urlLower.includes(q)) {
          rankScore = Math.min(rankScore, 0.3);
        }

        return { ...item, score: rankScore };
      })
      .sort((a, b) => a.score - b.score);

    // Deduplicate: domain-match wins over Fuse.js results
    const seenIds = new Set(domainResults.map((r) => r.id));
    const dedupedFuse = rankedFuseResults.filter((r) => {
      // Also deduplicate by tabId for tabs that appear in domain matches
      if (r.tabId != null && domainMatchTabIds.has(r.tabId)) return false;
      if (seenIds.has(r.id)) return false;
      seenIds.add(r.id);
      return true;
    });

    return [...domainResults, ...dedupedFuse].slice(0, 20);
  }, [fuse, debouncedQuery, allTabs, tabWorkspaceMap, activeWorkspaceId]);

  const activateResult = useCallback(
    (result: SearchResult) => {
      if (result.type === "tab" && result.tabId != null) {
        onSwitchTab(result.tabId);
      } else if (result.type === "link" && result.url) {
        onOpenUrl(result.url);
      }
      // For folders, no action (just highlighting in tree could be future feature)
      setQuery("");
      setDebouncedQuery("");
      inputRef.current?.blur();
    },
    [onSwitchTab, onOpenUrl]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        setQuery("");
        setDebouncedQuery("");
        inputRef.current?.blur();
        return;
      }

      if (results.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        activateResult(results[selectedIndex]);
      }
    },
    [results, selectedIndex, activateResult]
  );

  // Scroll selected result into view
  useEffect(() => {
    if (resultsRef.current) {
      const selected = resultsRef.current.querySelector(
        `[data-index="${selectedIndex}"]`
      );
      selected?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Build workspace lookup map for cross-workspace badges
  const workspaceMap = useMemo(() => {
    const map: Record<string, { name: string; emoji: string }> = {};
    for (const ws of workspaces) {
      map[ws.id] = { name: ws.name, emoji: ws.emoji };
    }
    return map;
  }, [workspaces]);

  // Find the index where other-workspace Switch-to-Tab results start
  const otherWsDividerIndex = useMemo(() => {
    if (results.length === 0) return -1;
    let hasCurrentWs = false;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.matchType !== "switch-to-tab") break;
      const wsId = r.tabId != null ? (tabWorkspaceMap[String(r.tabId)] || "default") : null;
      if (wsId === activeWorkspaceId) {
        hasCurrentWs = true;
      } else if (wsId !== null && wsId !== activeWorkspaceId) {
        // First other-workspace result — only show divider if we had current-workspace matches
        if (hasCurrentWs) return i;
        return -1; // Only other-workspace results, no divider needed
      }
    }
    return -1;
  }, [results, tabWorkspaceMap, activeWorkspaceId]);

  const showResults = isFocused && debouncedQuery.trim() && results.length > 0;

  return (
    <div className="px-2 py-2 relative">
      <div className="relative">
        {/* Search icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-arc-text-secondary pointer-events-none"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
            clipRule="evenodd"
          />
        </svg>

        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            // Delay blur to allow click on results
            setTimeout(() => setIsFocused(false), 150);
          }}
          placeholder="Search tabs..."
          className="w-full h-8 pl-8 pr-8 rounded-lg bg-gray-100 dark:bg-arc-surface text-gray-900 dark:text-arc-text-primary text-sm placeholder-gray-400 dark:placeholder-arc-text-secondary outline-none border border-transparent focus:border-arc-accent/50 focus:ring-1 focus:ring-arc-accent/30 shadow-inner dark:shadow-none transition-all duration-150"
          role="combobox"
          aria-expanded={showResults || undefined}
          aria-controls="search-results"
          aria-activedescendant={
            results[selectedIndex]
              ? `search-result-${results[selectedIndex].id}`
              : undefined
          }
          aria-autocomplete="list"
          aria-label="Search tabs, folders, and saved links"
        />

        {query && (
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              setQuery("");
              setDebouncedQuery("");
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Clear search"
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
      </div>

      {/* Search Results Dropdown */}
      {showResults && (
        <div
          ref={resultsRef}
          id="search-results"
          role="listbox"
          aria-label="Search results"
          className="absolute left-2 right-2 top-full mt-1 max-h-[320px] overflow-y-auto bg-white dark:bg-arc-surface border border-gray-200 dark:border-arc-border rounded-xl shadow-xl z-50"
        >
          {results.map((result, index) => {
            const isOtherWs =
              result.matchType === "switch-to-tab" &&
              result.tabId != null &&
              (tabWorkspaceMap[String(result.tabId)] || "default") !== activeWorkspaceId;
            const wsInfo = isOtherWs && result.tabId != null
              ? workspaceMap[tabWorkspaceMap[String(result.tabId)] || "default"]
              : null;

            return (
              <div key={result.id}>
                {/* Divider before first other-workspace result */}
                {index === otherWsDividerIndex && (
                  <div className="flex items-center gap-2 px-3 py-1.5">
                    <div className="flex-1 h-px bg-gray-200 dark:bg-arc-border" />
                    <span className="text-[10px] text-gray-400 dark:text-arc-text-secondary whitespace-nowrap">
                      In other workspaces
                    </span>
                    <div className="flex-1 h-px bg-gray-200 dark:bg-arc-border" />
                  </div>
                )}
                <button
                  id={`search-result-${result.id}`}
                  role="option"
                  aria-selected={index === selectedIndex}
                  data-index={index}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    activateResult(result);
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors duration-100 ${
                    index === selectedIndex
                      ? "bg-indigo-50 dark:bg-arc-accent/10"
                      : "hover:bg-gray-50 dark:hover:bg-arc-surface-hover"
                  }`}
                >
                  {/* Icon based on type */}
                  {result.type === "folder" ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-4 h-4 shrink-0 text-gray-500 dark:text-gray-400"
                    >
                      <path d="M3.75 3A1.75 1.75 0 0 0 2 4.75v3.26a3.235 3.235 0 0 1 1.75-.51h12.5c.644 0 1.245.188 1.75.51V6.75A1.75 1.75 0 0 0 16.25 5h-4.836a.25.25 0 0 1-.177-.073L9.823 3.513A1.75 1.75 0 0 0 8.586 3H3.75ZM3.75 9A1.75 1.75 0 0 0 2 10.75v4.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0 0 18 15.25v-4.5A1.75 1.75 0 0 0 16.25 9H3.75Z" />
                    </svg>
                  ) : result.favicon ? (
                    <img
                      src={result.favicon}
                      alt=""
                      className="w-4 h-4 shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <span className="w-4 h-4 shrink-0 rounded bg-gray-300 dark:bg-gray-600" />
                  )}

                  <div className="flex-1 min-w-0">
                    <span className="block truncate">{result.title}</span>
                    {result.url && (
                      <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                        {result.url}
                      </span>
                    )}
                    {/* Cross-workspace badge */}
                    {wsInfo && (
                      <span className="block text-[10px] text-gray-400 dark:text-arc-text-secondary mt-0.5">
                        {wsInfo.emoji} {wsInfo.name}
                      </span>
                    )}
                  </div>

                  {/* Type badge */}
                  {result.matchType === "switch-to-tab" ? (
                    <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-arc-accent text-white font-medium">
                      Switch to Tab →
                    </span>
                  ) : (
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-arc-surface-hover text-gray-500 dark:text-arc-text-secondary">
                      {result.type === "tab"
                        ? "Tab"
                        : result.type === "link"
                          ? "Link"
                          : "Folder"}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* No results */}
      {isFocused && debouncedQuery.trim() && results.length === 0 && (
        <div className="absolute left-2 right-2 top-full mt-1 bg-white dark:bg-arc-surface border border-gray-200 dark:border-arc-border rounded-xl shadow-xl z-50 px-3 py-3 text-sm text-gray-500 dark:text-arc-text-secondary text-center">
          No results found
        </div>
      )}
    </div>
  );
}
