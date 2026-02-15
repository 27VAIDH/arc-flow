import { useCallback, useEffect, useState } from "react";
import type { Session } from "../shared/types";
import { getSessions, deleteSession } from "../shared/sessionStorage";

interface SessionManagerProps {
  onClose: () => void;
  onRestore: (session: Session, mode: "replace" | "add") => void;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

export default function SessionManager({
  onClose,
  onRestore,
}: SessionManagerProps) {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    getSessions().then(setSessions);

    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === "local" && changes.sessions) {
        const updated = (changes.sessions.newValue as Session[]) ?? [];
        setSessions(updated.sort((a, b) => b.savedAt - a.savedAt));
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleDelete = useCallback(async (id: string) => {
    const confirmed = window.confirm("Delete this session?");
    if (confirmed) {
      await deleteSession(id);
    }
  }, []);

  const handleRestore = useCallback(
    (session: Session) => {
      const mode = window.confirm(
        `Restore session "${session.name}"?\n\nOK = Replace current tabs\nCancel = Add alongside existing tabs`
      );
      // confirm returns true for OK (replace), false for Cancel (add)
      // But we want both actions to proceed, so we use a different approach
      onRestore(session, mode ? "replace" : "add");
    },
    [onRestore]
  );

  return (
    <div className="absolute inset-0 z-50 bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-semibold">Saved Sessions</h2>
        <button
          onClick={onClose}
          className="flex items-center justify-center w-6 h-6 rounded hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
          aria-label="Close sessions panel"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto p-3">
        {sessions.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
            No saved sessions yet. Use &ldquo;Save Session&rdquo; from a
            workspace right-click menu or command palette.
          </p>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {session.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {session.tabUrls.length} tab
                      {session.tabUrls.length !== 1 ? "s" : ""} &middot;{" "}
                      {session.workspaceSnapshot.folders.length} folder
                      {session.workspaceSnapshot.folders.length !== 1
                        ? "s"
                        : ""}{" "}
                      &middot; {formatDate(session.savedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleRestore(session)}
                      className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => handleDelete(session.id)}
                      className="px-2 py-1 text-xs rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Preview of tabs */}
                {session.tabUrls.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {session.tabUrls.slice(0, 6).map((tab, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1 px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded max-w-[140px]"
                        title={tab.title || tab.url}
                      >
                        {tab.favicon ? (
                          <img
                            src={tab.favicon}
                            alt=""
                            className="w-3 h-3 shrink-0"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display =
                                "none";
                            }}
                          />
                        ) : (
                          <span className="w-3 h-3 shrink-0 rounded bg-gray-300 dark:bg-gray-500" />
                        )}
                        <span className="truncate">{tab.title || tab.url}</span>
                      </div>
                    ))}
                    {session.tabUrls.length > 6 && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 px-1.5 py-0.5">
                        +{session.tabUrls.length - 6} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
