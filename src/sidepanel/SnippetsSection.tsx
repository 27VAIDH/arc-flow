import { useCallback, useEffect, useState } from "react";
import type { Snippet } from "../shared/types";

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

function getFirstLine(text: string): string {
  const line = text.split("\n")[0] ?? "";
  return line.trim();
}

function getDomainFavicon(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=16`;
  } catch {
    return "";
  }
}

export default function SnippetsSection({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [lastWsId, setLastWsId] = useState(workspaceId);

  const storageKey = `snippets_${workspaceId}`;

  // Reset UI state when workspace changes (derived state pattern)
  if (workspaceId !== lastWsId) {
    setLastWsId(workspaceId);
    setExpandedId(null);
    setConfirmClear(false);
  }

  useEffect(() => {
    chrome.storage.local.get(storageKey, (result) => {
      const stored = (result[storageKey] as Snippet[] | undefined) ?? [];
      setSnippets(stored);
    });
  }, [storageKey]);

  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === "local" && changes[storageKey]) {
        const updated =
          (changes[storageKey].newValue as Snippet[] | undefined) ?? [];
        setSnippets(updated);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [storageKey]);

  const handleDelete = useCallback(
    async (snippetId: string) => {
      const updated = snippets.filter((s) => s.id !== snippetId);
      setSnippets(updated);
      await chrome.storage.local.set({ [storageKey]: updated });
      if (expandedId === snippetId) setExpandedId(null);
    },
    [snippets, storageKey, expandedId]
  );

  const handleClearAll = useCallback(async () => {
    setSnippets([]);
    setExpandedId(null);
    setConfirmClear(false);
    await chrome.storage.local.set({ [storageKey]: [] });
  }, [storageKey]);

  if (snippets.length === 0) return null;

  return (
    <section className="px-1 pb-2" aria-label="Snippets">
      {/* Collapsible header */}
      <button
        onClick={() => setIsCollapsed((prev) => !prev)}
        aria-expanded={!isCollapsed}
        aria-controls="snippets-list"
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
        {/* Scissors/snippet icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-3.5 h-3.5 shrink-0"
        >
          <path
            fillRule="evenodd"
            d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Z"
            clipRule="evenodd"
          />
        </svg>
        <span>Snippets ({snippets.length})</span>
        <span className="flex-1" />
      </button>

      {/* Snippets list */}
      {!isCollapsed && (
        <div id="snippets-list" className="flex flex-col gap-0.5">
          {snippets.map((snippet) => (
            <SnippetItem
              key={snippet.id}
              snippet={snippet}
              isExpanded={expandedId === snippet.id}
              onToggleExpand={() =>
                setExpandedId(expandedId === snippet.id ? null : snippet.id)
              }
              onDelete={() => handleDelete(snippet.id)}
            />
          ))}

          {/* Clear all */}
          <div className="px-2 pt-1">
            {confirmClear ? (
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-red-500 dark:text-red-400">
                  Clear all snippets?
                </span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 font-medium cursor-pointer"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="text-[10px] text-gray-400 hover:text-red-500 dark:hover:text-red-400 cursor-pointer"
                aria-label="Clear all snippets"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function SnippetItem({
  snippet,
  isExpanded,
  onToggleExpand,
  onDelete,
}: {
  snippet: Snippet;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
}) {
  const favicon = getDomainFavicon(snippet.sourceUrl);
  const firstLine = getFirstLine(snippet.text);

  return (
    <div className="group px-2 rounded hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
      {/* Collapsed row */}
      <div
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleExpand();
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={isExpanded}
        className="flex items-center gap-2 h-7 text-xs cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset rounded"
      >
        {favicon ? (
          <img
            src={favicon}
            alt=""
            className="w-4 h-4 shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span className="w-4 h-4 shrink-0 rounded bg-gray-300 dark:bg-gray-600" />
        )}
        <span className="truncate flex-1 text-gray-700 dark:text-gray-300">
          {truncate(firstLine || snippet.text, 80)}
        </span>
        <span className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0 whitespace-nowrap">
          {formatTimeSince(snippet.savedAt)}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 dark:hover:text-red-400 shrink-0 cursor-pointer transition-opacity"
          aria-label={`Delete snippet: ${truncate(firstLine, 30)}`}
          title="Delete snippet"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-3.5 h-3.5"
          >
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      {/* Expanded view */}
      {isExpanded && (
        <div className="pb-2 pl-6 text-xs space-y-1.5">
          {/* Full text */}
          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
            {snippet.text}
          </p>

          {/* Annotation */}
          {snippet.annotation && (
            <p className="text-gray-500 dark:text-gray-400 italic">
              {"✏️ "}
              {snippet.annotation}
            </p>
          )}

          {/* Source link */}
          {snippet.sourceUrl && (
            <a
              href={snippet.sourceUrl}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                chrome.tabs.create({ url: snippet.sourceUrl });
              }}
              className="text-blue-500 dark:text-blue-400 hover:underline truncate block"
              title={snippet.sourceUrl}
            >
              {snippet.sourceTitle || snippet.sourceUrl}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
