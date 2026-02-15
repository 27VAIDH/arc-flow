import { useCallback, useEffect, useState, useRef } from "react";
import type { Folder, FolderItem } from "../shared/types";
import {
  createFolder,
  renameFolder,
  deleteFolder,
  updateFolder,
} from "../shared/folderStorage";
import type { ContextMenuItem } from "./ContextMenu";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

interface FolderTreeProps {
  onContextMenu: (state: ContextMenuState) => void;
  folders: Folder[];
  setFolders: React.Dispatch<React.SetStateAction<Folder[]>>;
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

function DraggableFolderItem({
  item,
  depth,
}: {
  item: FolderItem;
  depth: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `folder-item:${item.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    paddingLeft: (depth + 1) * 16 + 8,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex items-center gap-2 px-2 h-7 text-sm rounded cursor-default hover:bg-gray-200 dark:hover:bg-gray-800 touch-none"
    >
      {item.favicon ? (
        <img
          src={item.favicon}
          alt=""
          className="w-4 h-4 shrink-0"
          draggable={false}
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
  );
}

function SortableFolder({
  folder,
  depth,
  onToggleCollapse,
  onRename,
  onContextMenu,
  getChildren,
  renderFolder,
}: {
  folder: Folder;
  depth: number;
  onToggleCollapse: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onContextMenu: (e: React.MouseEvent, folder: Folder) => void;
  getChildren: (parentId: string) => Folder[];
  renderFolder: (folder: Folder, depth: number) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `folder:${folder.id}` });

  const { isOver, setNodeRef: setDroppableRef } = useDroppable({
    id: `folder-drop:${folder.id}`,
  });

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const itemIds = folder.items.map((item) => `folder-item:${item.id}`);

  return (
    <div
      ref={(node) => {
        setSortableRef(node);
        setDroppableRef(node);
      }}
      style={{ ...sortableStyle, paddingLeft: depth * 16 }}
    >
      <div
        {...attributes}
        {...listeners}
        className={`touch-none rounded transition-colors ${
          isOver ? "bg-blue-100 dark:bg-blue-900/40 ring-1 ring-blue-400" : ""
        }`}
      >
        <FolderHeader
          folder={folder}
          onToggleCollapse={onToggleCollapse}
          onRename={onRename}
          onContextMenu={onContextMenu}
        />
      </div>
      {!folder.isCollapsed && (
        <div>
          <SortableContext
            items={itemIds}
            strategy={verticalListSortingStrategy}
          >
            {folder.items.map((item) => (
              <DraggableFolderItem key={item.id} item={item} depth={depth} />
            ))}
          </SortableContext>
          {getChildren(folder.id).map((child) =>
            renderFolder(child, depth + 1)
          )}
        </div>
      )}
    </div>
  );
}

export default function FolderTree({
  onContextMenu,
  folders,
  setFolders,
}: FolderTreeProps) {
  const [toast, setToast] = useState<string | null>(null);

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

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
    [folders, setFolders]
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
    <SortableFolder
      key={folder.id}
      folder={folder}
      depth={depth}
      onToggleCollapse={handleToggleCollapse}
      onRename={handleRename}
      onContextMenu={handleFolderContextMenu}
      getChildren={getChildren}
      renderFolder={renderFolder}
    />
  );

  const topLevelFolderIds = topLevelFolders.map((f) => `folder:${f.id}`);

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
      <SortableContext
        items={topLevelFolderIds}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-0.5">
          {topLevelFolders.map((folder) => renderFolder(folder, 0))}
        </div>
      </SortableContext>

      {/* Error toast */}
      {toast && (
        <div className="mx-2 mt-2 px-3 py-2 text-xs text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 rounded border border-red-200 dark:border-red-800">
          {toast}
        </div>
      )}
    </div>
  );
}
