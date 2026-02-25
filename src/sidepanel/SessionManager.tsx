import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "../shared/types";
import {
  getSessions,
  deleteSession,
  exportSessionToJSON,
  validateSessionImport,
  importSession,
} from "../shared/sessionStorage";

interface DailySnapshot {
  workspaces: { id: string; name: string; emoji: string }[];
  tabs: Record<string, { url: string; title: string; favicon: string }[]>;
  createdAt: number;
}

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
  const [importError, setImportError] = useState<string | null>(null);
  const [dailySnapshots, setDailySnapshots] = useState<
    Record<string, DailySnapshot>
  >({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSessions().then(setSessions);
    chrome.storage.local.get("dailySnapshots", (result) => {
      setDailySnapshots(
        (result.dailySnapshots as Record<string, DailySnapshot>) ?? {}
      );
    });

    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === "local" && changes.sessions) {
        const updated = (changes.sessions.newValue as Session[]) ?? [];
        setSessions(updated.sort((a, b) => b.savedAt - a.savedAt));
      }
      if (area === "local" && changes.dailySnapshots) {
        setDailySnapshots(
          (changes.dailySnapshots.newValue as Record<string, DailySnapshot>) ??
            {}
        );
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

  const handleExport = useCallback((session: Session) => {
    const json = exportSessionToJSON(session);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `arcflow-session-${session.name.replace(/[^a-zA-Z0-9-_]/g, "_")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleRestoreSnapshot = useCallback(
    (dateKey: string) => {
      const snapshot = dailySnapshots[dateKey];
      if (!snapshot) return;

      // Collect all tab URLs from all workspaces in the snapshot
      const allTabs: { url: string; title: string; favicon: string }[] = [];
      for (const tabs of Object.values(snapshot.tabs)) {
        allTabs.push(...tabs);
      }

      if (allTabs.length === 0) return;

      // Create a synthetic Session for the existing restore flow
      const syntheticSession: Session = {
        id: `snapshot-${dateKey}`,
        name: `Daily Snapshot — ${dateKey}`,
        savedAt: snapshot.createdAt,
        workspaceSnapshot: { pinnedApps: [], folders: [] },
        tabUrls: allTabs,
      };

      const mode = window.confirm(
        `Restore ${allTabs.length} tabs from ${dateKey}?\n\nOK = Replace current tabs\nCancel = Add alongside existing tabs`
      );
      onRestore(syntheticSession, mode ? "replace" : "add");
    },
    [dailySnapshots, onRestore]
  );

  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      setImportError(null);
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text) as unknown;
        const result = validateSessionImport(data);

        if (!result.valid || !result.session) {
          setImportError(result.error ?? "Invalid session file.");
          return;
        }

        await importSession(result.session);
      } catch {
        setImportError(
          "Failed to read file. Please ensure it is a valid JSON file."
        );
      }

      // Reset file input so the same file can be imported again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    []
  );

  return (
    <div
      className="absolute inset-0 z-50 bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Saved Sessions"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-semibold">Saved Sessions</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Import session from JSON file"
          >
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
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
      </div>

      {/* Import error */}
      {importError && (
        <div className="mx-4 mt-3 p-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-800">
          {importError}
          <button
            onClick={() => setImportError(null)}
            className="ml-2 underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Daily Snapshots section */}
      {Object.keys(dailySnapshots).length > 0 && (
        <div className="px-3 pt-3">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Daily Snapshots
          </h3>
          {/* Yesterday's Tabs shortcut */}
          {(() => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
            if (dailySnapshots[yKey]) {
              const yTotalTabs = Object.values(
                dailySnapshots[yKey].tabs
              ).reduce((sum, t) => sum + t.length, 0);
              return (
                <button
                  onClick={() => handleRestoreSnapshot(yKey)}
                  className="w-full mb-2 px-3 py-2 text-xs text-left rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                >
                  Restore yesterday&rsquo;s tabs ({yTotalTabs} tab
                  {yTotalTabs !== 1 ? "s" : ""})
                </button>
              );
            }
            return null;
          })()}
          <div className="space-y-1.5 mb-3">
            {Object.keys(dailySnapshots)
              .sort()
              .reverse()
              .map((dateKey) => {
                const snap = dailySnapshots[dateKey];
                const totalTabs = Object.values(snap.tabs).reduce(
                  (sum, t) => sum + t.length,
                  0
                );
                const wsNames = snap.workspaces
                  .map((w) => `${w.emoji} ${w.name}`)
                  .join(", ");
                return (
                  <div
                    key={dateKey}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{dateKey}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {totalTabs} tab{totalTabs !== 1 ? "s" : ""} &middot;{" "}
                        {wsNames || "No workspaces"}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRestoreSnapshot(dateKey)}
                      className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors shrink-0"
                    >
                      Restore
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Session list */}
      <div className="flex-1 overflow-y-auto p-3">
        {sessions.length === 0 && Object.keys(dailySnapshots).length === 0 ? (
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
                      onClick={() => handleExport(session)}
                      className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      aria-label={`Export session "${session.name}"`}
                    >
                      Export
                    </button>
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
