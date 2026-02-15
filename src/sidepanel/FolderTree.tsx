import { useCallback, useEffect, useState, useRef } from "react";
import type { Folder } from "../shared/types";
import {
  getFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  updateFolder,
} from "../shared/folderStorage";
import type { ContextMenuItem } from "./ContextMenu";

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

interface FolderTreeProps {
  onContextMenu: (state: ContextMenuState) => void;
}

function FolderHeader({
  folder,
  onToggleCollapse,
  onRename,
  onContextMenu,
}: {
  folder: Folder;
  onToggleCollapse: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onContextMenu: (e: React.MouseEvent, folder: Folder) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(folder.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== folder.name) {
      onRename(folder.id, trimmed);
    }
    setEditing(false);
    setEditName(folder.name);
  };

  const tabCount = folder.items.filter((i) => i.type === "tab").length;
  const linkCount = folder.items.filter((i) => i.type === "link").length;

  const badgeParts: string[] = [];
  if (tabCount > 0)
    badgeParts.push(`${tabCount} tab${tabCount !== 1 ? "s" : ""}`);
  if (linkCount > 0)
    badgeParts.push(`${linkCount} link${linkCount !== 1 ? "s" : ""}`);

  return (
    <div
      className="flex items-center gap-1 px-2 h-7 text-sm rounded cursor-default hover:bg-gray-200 dark:hover:bg-gray-800 group"
      onContextMenu={(e) => onContextMenu(e, folder)}
    >
      {/* Chevron toggle */}
      <button
        onClick={() => onToggleCollapse(folder.id)}
        className="shrink-0 w-4 h-4 flex items-center justify-center text-gray-400 dark:text-gray-500"
        aria-label={folder.isCollapsed ? "Expand folder" : "Collapse folder"}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`w-3 h-3 transition-transform ${folder.isCollapsed ? "" : "rotate-90"}`}
        >
          <path
            fillRule="evenodd"
            d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Folder icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-4 h-4 shrink-0 text-gray-500 dark:text-gray-400"
      >
        <path d="M3.75 3A1.75 1.75 0 0 0 2 4.75v3.26a3.235 3.235 0 0 1 1.75-.51h12.5c.644 0 1.245.188 1.75.51V6.75A1.75 1.75 0 0 0 16.25 5h-4.836a.25.25 0 0 1-.177-.073L9.823 3.513A1.75 1.75 0 0 0 8.586 3H3.75ZM3.75 9A1.75 1.75 0 0 0 2 10.75v4.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0 0 18 15.25v-4.5A1.75 1.75 0 0 0 16.25 9H3.75Z" />
      </svg>

      {/* Folder name (inline editable) */}
      {editing ? (
        <input
          ref={inputRef}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") {
              setEditing(false);
              setEditName(folder.name);
            }
          }}
          className="flex-1 text-sm bg-white dark:bg-gray-700 border border-blue-400 rounded px-1 py-0 outline-none"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="truncate flex-1 select-none"
          onDoubleClick={() => {
            setEditName(folder.name);
            setEditing(true);
          }}
        >
          {folder.name}
        </span>
      )}

      {/* Count badge */}
      {badgeParts.length > 0 && (
        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
          ({badgeParts.join(", ")})
        </span>
      )}
    </div>
  );
}

export default function FolderTree({ onContextMenu }: FolderTreeProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Load folders and listen for storage changes
  useEffect(() => {
    getFolders().then(setFolders);

    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === "local" && changes.folders) {
        const updated = (changes.folders.newValue as Folder[]) ?? [];
        setFolders(updated.sort((a, b) => a.sortOrder - b.sortOrder));
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const handleToggleCollapse = useCallback(
    async (id: string) => {
      setFolders((prev) =>
        prev.map((f) =>
          f.id === id ? { ...f, isCollapsed: !f.isCollapsed } : f
        )
      );
      const folder = folders.find((f) => f.id === id);
      if (folder) {
        await updateFolder(id, { isCollapsed: !folder.isCollapsed });
      }
    },
    [folders]
  );

  const handleRename = useCallback(async (id: string, name: string) => {
    try {
      await renameFolder(id, name);
    } catch {
      // Name validation failed — ignore
    }
  }, []);

  const handleDelete = useCallback(async (folder: Folder) => {
    const tabCount = folder.items.filter((i) => i.type === "tab").length;
    if (tabCount > 0) {
      const confirmed = window.confirm(
        `Close ${tabCount} tab${tabCount !== 1 ? "s" : ""} and delete folder "${folder.name}"?`
      );
      if (!confirmed) return;
    }
    await deleteFolder(folder.id);
  }, []);

  const handleCreateFolder = useCallback(async (parentId?: string) => {
    try {
      await createFolder("New Folder", parentId ?? null);
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes("Maximum nesting depth")
      ) {
        setToast(
          "Cannot create subfolder: maximum nesting depth of 3 levels reached."
        );
      }
    }
  }, []);

  const handleFolderContextMenu = useCallback(
    (e: React.MouseEvent, folder: Folder) => {
      e.preventDefault();
      const items: ContextMenuItem[] = [
        {
          label: "New Subfolder",
          onClick: () => handleCreateFolder(folder.id),
        },
        {
          label: "Rename",
          onClick: () => {
            const newName = window.prompt("Rename folder:", folder.name);
            if (newName && newName.trim()) {
              handleRename(folder.id, newName.trim());
            }
          },
        },
        {
          label: "Delete",
          onClick: () => handleDelete(folder),
        },
      ];
      onContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [onContextMenu, handleRename, handleDelete, handleCreateFolder]
  );

  // Build tree structure: top-level folders and their children
  const topLevelFolders = folders.filter((f) => f.parentId === null);

  const getChildren = (parentId: string): Folder[] =>
    folders
      .filter((f) => f.parentId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

  const renderFolder = (folder: Folder, depth: number) => (
    <div key={folder.id} style={{ paddingLeft: depth * 16 }}>
      <FolderHeader
        folder={folder}
        onToggleCollapse={handleToggleCollapse}
        onRename={handleRename}
        onContextMenu={handleFolderContextMenu}
      />
      {!folder.isCollapsed && (
        <div>
          {/* Render folder items */}
          {folder.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 px-2 h-7 text-sm rounded cursor-default hover:bg-gray-200 dark:hover:bg-gray-800"
              style={{ paddingLeft: (depth + 1) * 16 + 8 }}
            >
              {item.favicon ? (
                <img
                  src={item.favicon}
                  alt=""
                  className="w-4 h-4 shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <span className="w-4 h-4 shrink-0 rounded bg-gray-300 dark:bg-gray-600" />
              )}
              <span
                className={`truncate flex-1 select-none ${item.type === "link" ? "text-gray-400 dark:text-gray-500 italic" : ""}`}
              >
                {item.title || item.url}
              </span>
            </div>
          ))}
          {/* Render child folders */}
          {getChildren(folder.id).map((child) =>
            renderFolder(child, depth + 1)
          )}
        </div>
      )}
    </div>
  );

  if (topLevelFolders.length === 0 && folders.length === 0) {
    return (
      <div className="px-2 py-1">
        <button
          onClick={() => handleCreateFolder()}
          className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="w-3.5 h-3.5"
          >
            <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
          </svg>
          New Folder
        </button>
      </div>
    );
  }

  return (
    <div className="px-1 py-1">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
          Folders
        </span>
        <button
          onClick={() => handleCreateFolder()}
          className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          aria-label="New Folder"
          title="New Folder"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="w-3.5 h-3.5"
          >
            <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
          </svg>
        </button>
      </div>
      <div className="flex flex-col gap-0.5">
        {topLevelFolders.map((folder) => renderFolder(folder, 0))}
      </div>

      {/* Error toast */}
      {toast && (
        <div className="mx-2 mt-2 px-3 py-2 text-xs text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 rounded border border-red-200 dark:border-red-800">
          {toast}
        </div>
      )}
    </div>
  );
}
