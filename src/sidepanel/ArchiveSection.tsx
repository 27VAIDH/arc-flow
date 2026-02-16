import { useCallback, useEffect, useState } from "react";
import type { ArchiveEntry } from "../shared/types";
import {
  getArchiveEntries,
  removeArchiveEntry,
  clearArchiveEntries,
} from "../shared/archiveStorage";

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

export default function ArchiveSection() {
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(true);

  useEffect(() => {
    getArchiveEntries().then(setEntries);

    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === "local" && changes.archiveEntries) {
        const updated =
          (changes.archiveEntries.newValue as ArchiveEntry[]) ?? [];
        setEntries(updated.sort((a, b) => b.archivedAt - a.archivedAt));
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const handleRestore = useCallback(async (entry: ArchiveEntry) => {
    // Open the URL as a new tab
    chrome.runtime.sendMessage({ type: "OPEN_URL", url: entry.url });
    // Remove from archive
    await removeArchiveEntry(entry.id);
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
  }, []);

  const handleClearAll = useCallback(async () => {
    const confirmed = window.confirm(
      "Clear all archived tabs? This cannot be undone."
    );
    if (!confirmed) return;
    await clearArchiveEntries();
    setEntries([]);
  }, []);

  if (entries.length === 0) return null;

  const visibleEntries = entries.slice(0, 10);

  return (
    <section className="px-1 pb-2" aria-label="Archived tabs">
      {/* Collapsible header */}
      <button
        onClick={() => setIsCollapsed((prev) => !prev)}
        aria-expanded={!isCollapsed}
        aria-controls="archive-list"
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
          <path d="M2 3a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H2Z" />
          <path
            fillRule="evenodd"
            d="M2 7.5h16l-.811 7.71a2 2 0 0 1-1.99 1.79H4.802a2 2 0 0 1-1.99-1.79L2 7.5ZM7 11a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1Z"
            clipRule="evenodd"
          />
        </svg>
        <span>Archive ({entries.length})</span>
        <span className="flex-1" />
        {!isCollapsed && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClearAll();
            }}
            className="text-[10px] text-gray-400 hover:text-red-500 dark:hover:text-red-400 cursor-pointer"
            aria-label="Clear all archived tabs"
          >
            Clear All
          </button>
        )}
      </button>

      {/* Archive entries list */}
      {!isCollapsed && (
        <ul
          id="archive-list"
          className="flex flex-col gap-0.5"
          aria-label="Archived tabs"
        >
          {visibleEntries.map((entry) => (
            <ArchiveItem
              key={entry.id}
              entry={entry}
              onRestore={handleRestore}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ArchiveItem({
  entry,
  onRestore,
}: {
  entry: ArchiveEntry;
  onRestore: (entry: ArchiveEntry) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <li
      onClick={() => onRestore(entry)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onRestore(entry);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Restore ${entry.title}, archived ${formatTimeSince(entry.archivedAt)}`}
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
        {entry.title || entry.url}
      </span>
      {hovered ? (
        <span className="text-[10px] text-blue-500 dark:text-blue-400 shrink-0 whitespace-nowrap">
          Restore
        </span>
      ) : (
        <span className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0 whitespace-nowrap">
          {formatTimeSince(entry.archivedAt)}
        </span>
      )}
    </li>
  );
}
