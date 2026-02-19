import { createPortal } from "react-dom";
import { formatRelativeTime } from "./QuickNotes";

interface TabPreviewInfo {
  id: number;
  title: string;
  url: string;
  favIconUrl: string;
  active: boolean;
  audible: boolean;
  discarded: boolean;
  lastActiveAt: number;
  workspaceName: string;
  workspaceEmoji: string;
}

interface TabPreviewCardProps {
  tab: TabPreviewInfo;
  position: { top: number; left: number };
  onClose: () => void;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatUrl(url: string): string {
  try {
    const u = new URL(url);
    const display = u.hostname + u.pathname + u.search;
    if (display.length > 60) {
      return display.slice(0, 28) + "..." + display.slice(-28);
    }
    return display;
  } catch {
    return url;
  }
}

function getStatusText(tab: TabPreviewInfo): string | null {
  if (tab.discarded) return "Suspended";
  if (tab.audible) return "Playing audio";
  return null;
}

function getActiveText(tab: TabPreviewInfo): string {
  if (tab.active) return "Active now";
  if (!tab.lastActiveAt) return "";
  return `Active ${formatRelativeTime(tab.lastActiveAt)}`;
}

export default function TabPreviewCard({
  tab,
  position,
  onClose,
}: TabPreviewCardProps) {
  const handleCopyUrl = () => {
    navigator.clipboard.writeText(tab.url).catch(() => {});
  };

  const status = getStatusText(tab);
  const activeText = getActiveText(tab);

  const card = (
    <div
      className="pointer-events-auto fixed z-[100] w-[280px] animate-fade-in rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-600 dark:bg-gray-800"
      style={{ top: position.top, left: position.left }}
      onMouseLeave={onClose}
      role="tooltip"
    >
      {/* Domain header */}
      <div className="mb-2 flex items-center gap-2">
        {tab.favIconUrl ? (
          <img
            src={tab.favIconUrl}
            alt=""
            className="h-5 w-5 rounded"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span className="flex h-5 w-5 items-center justify-center rounded bg-gray-200 text-[10px] dark:bg-gray-700">
            🌐
          </span>
        )}
        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
          {getDomain(tab.url)}
        </span>
      </div>

      {/* Title */}
      <div className="mb-1.5 line-clamp-2 text-sm font-medium leading-snug text-gray-900 dark:text-gray-100">
        {tab.title || "Untitled"}
      </div>

      {/* URL with copy */}
      <div className="mb-2 flex items-start gap-1">
        <span className="flex-1 break-all text-[11px] leading-tight text-gray-500 dark:text-gray-400">
          {formatUrl(tab.url)}
        </span>
        <button
          className="mt-0.5 shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          onClick={handleCopyUrl}
          aria-label="Copy URL"
          title="Copy URL"
        >
          <svg
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" strokeWidth="2" />
            <path
              d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"
              strokeWidth="2"
            />
          </svg>
        </button>
      </div>

      {/* Status badge */}
      {status && (
        <div className="mb-1.5">
          <span
            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
              tab.discarded
                ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
            }`}
          >
            {status}
          </span>
        </div>
      )}

      {/* Footer: last active + workspace */}
      <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          {tab.active && (
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
          )}
          {activeText}
        </span>
        <span className="flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-700">
          <span>{tab.workspaceEmoji}</span>
          <span>{tab.workspaceName}</span>
        </span>
      </div>
    </div>
  );

  return createPortal(card, document.body);
}

export type { TabPreviewInfo };
