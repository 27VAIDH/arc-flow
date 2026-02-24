import { useCallback, useEffect, useState, useRef } from "react";
import type { Folder, FolderItem } from "../shared/types";
import {
  createFolder,
  renameFolder,
  deleteFolder,
  updateFolder,
} from "../shared/folderStorage";
import type { ContextMenuItem } from "./ContextMenu";
import { useDroppable, useDndMonitor } from "@dnd-kit/core";
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
  onItemClick?: (item: FolderItem, folderId: string) => void;
  onItemContextMenu?: (
    e: React.MouseEvent,
    item: FolderItem,
    folderId: string
  ) => void;
  onItemRename?: (folderId: string, itemId: string, newTitle: string) => void;
  onOpenAllTabs?: (folder: Folder) => void;
  onCloseAllTabs?: (folder: Folder) => void;
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
  const committedRef = useRef(false);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitRename = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const trimmed = editName.trim();
    if (trimmed && trimmed !== folder.name) {
      onRename(folder.id, trimmed);
    }
    setEditing(false);
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
      className="flex-1 flex items-center gap-1 px-2 h-7 text-sm rounded-lg cursor-default hover:bg-gray-100 dark:hover:bg-white/[0.05] group transition-colors duration-200"
      onContextMenu={(e) => onContextMenu(e, folder)}
    >
      {/* Chevron toggle */}
      <button
        onClick={() => onToggleCollapse(folder.id)}
        className="shrink-0 w-4 h-4 flex items-center justify-center text-gray-400 dark:text-white/25"
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
        className="w-4 h-4 shrink-0 text-arc-accent dark:text-white/40"
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
            e.stopPropagation();
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") {
              committedRef.current = true;
              setEditing(false);
              setEditName(folder.name);
            }
          }}
          className="flex-1 text-sm bg-white dark:bg-arc-surface border border-arc-accent/50 rounded-md px-1 py-0 outline-none"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="truncate flex-1 select-none font-normal"
          onDoubleClick={() => {
            committedRef.current = false;
            setEditName(folder.name);
            setEditing(true);
          }}
        >
          {folder.name}
        </span>
      )}

      {/* Count badge */}
      {badgeParts.length > 0 && (
        <span className="text-[10px] text-gray-400 dark:text-white/25 shrink-0">
          ({badgeParts.join(", ")})
        </span>
      )}
    </div>
  );
}

function DropIndicatorLine({ depth }: { depth: number }) {
  return (
    <div
      className="h-0.5 bg-arc-accent rounded-full"
      style={{ marginLeft: (depth + 1) * 16 + 8 + 4, marginRight: 8 }}
    />
  );
}

function DraggableFolderItem({
  item,
  depth,
  folderId,
  onClick,
  onContextMenu,
  onRename,
  isOverItem,
}: {
  item: FolderItem;
  depth: number;
  folderId: string;
  onClick?: (item: FolderItem, folderId: string) => void;
  onContextMenu?: (
    e: React.MouseEvent,
    item: FolderItem,
    folderId: string
  ) => void;
  onRename?: (folderId: string, itemId: string, newTitle: string) => void;
  isOverItem?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(item.title || item.url);
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `folder-item:${item.id}` });

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitRename = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const trimmed = editName.trim();
    if (trimmed && trimmed !== (item.title || item.url)) {
      onRename?.(folderId, item.id, trimmed);
    }
    setEditing(false);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || "transform 200ms ease",
    opacity: isDragging ? 0.3 : 1,
    paddingLeft: (depth + 1) * 16 + 8,
  };

  return (
    <>
    {isOverItem && <DropIndicatorLine depth={depth} />}
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="treeitem"
      aria-level={depth + 2}
      aria-label={`${item.type === "link" ? "Saved link: " : ""}${item.title || item.url}`}
      tabIndex={0}
      className={`group flex items-center gap-2 px-2 h-7 text-sm rounded-lg cursor-default hover:bg-gray-100 dark:hover:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-arc-accent/50 focus:ring-inset transition-colors duration-200 ${item.type === "link" ? "cursor-pointer" : ""}`}
      onClick={() => {
        if (!editing) onClick?.(item, folderId);
      }}
      onKeyDown={(e) => {
        if (!editing && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick?.(item, folderId);
        }
      }}
      onContextMenu={(e) => onContextMenu?.(e, item, folderId)}
    >
      {/* Drag grip (visual hint only — drag listeners on full row) */}
      <span
        className="shrink-0 flex items-center text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-30 transition-opacity pointer-events-none"
        aria-hidden="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="w-3 h-3"
        >
          <path d="M6 3.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm0 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm0 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm5-9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm0 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm0 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
        </svg>
      </span>
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
        <span
          className="w-4 h-4 shrink-0 rounded bg-gray-200 dark:bg-arc-surface-hover"
          aria-hidden="true"
        />
      )}
      {editing ? (
        <input
          ref={inputRef}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") {
              committedRef.current = true;
              setEditing(false);
              setEditName(item.title || item.url);
            }
          }}
          className="flex-1 text-sm bg-white dark:bg-arc-surface border border-arc-accent/50 rounded-md px-1 py-0 outline-none"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="truncate flex-1 select-none"
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            committedRef.current = false;
            setEditName(item.title || item.url);
            setEditing(true);
          }}
        >
          {item.title || item.url}
        </span>
      )}
    </div>
    </>
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
  onItemClick,
  onItemContextMenu,
  onItemRename,
  isOverFolder,
}: {
  folder: Folder;
  depth: number;
  onToggleCollapse: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onContextMenu: (e: React.MouseEvent, folder: Folder) => void;
  getChildren: (parentId: string) => Folder[];
  renderFolder: (folder: Folder, depth: number) => React.ReactNode;
  onItemClick?: (item: FolderItem, folderId: string) => void;
  onItemContextMenu?: (
    e: React.MouseEvent,
    item: FolderItem,
    folderId: string
  ) => void;
  onItemRename?: (folderId: string, itemId: string, newTitle: string) => void;
  isOverFolder?: boolean;
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

  // Track which folder-item is being hovered for drop indicators
  const [overItemId, setOverItemId] = useState<string | null>(null);
  useDndMonitor({
    onDragOver(event) {
      const overId = event.over?.id ? String(event.over.id) : null;
      if (overId && overId.startsWith("folder-item:")) {
        const itemId = overId.replace("folder-item:", "");
        if (folder.items.some((i) => i.id === itemId)) {
          setOverItemId(itemId);
        } else {
          setOverItemId(null);
        }
      } else {
        setOverItemId(null);
      }
    },
    onDragEnd() {
      setOverItemId(null);
    },
    onDragCancel() {
      setOverItemId(null);
    },
  });

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition: transition || "transform 200ms ease",
    opacity: isDragging ? 0.3 : 1,
  };

  const itemIds = folder.items.map((item) => `folder-item:${item.id}`);

  return (
    <>
    {isOverFolder && (
      <div
        className="h-0.5 bg-arc-accent rounded-full"
        style={{ marginLeft: depth * 16 + 4, marginRight: 8 }}
      />
    )}
    <div
      ref={(node) => {
        setSortableRef(node);
        setDroppableRef(node);
      }}
      style={{ ...sortableStyle, paddingLeft: depth * 16 }}
      role="treeitem"
      aria-expanded={!folder.isCollapsed}
      aria-level={depth + 1}
      aria-label={folder.name}
    >
      <div
        className={`group rounded-lg transition-colors duration-200 flex items-center ${
          isOver
            ? "bg-indigo-50 dark:bg-arc-accent/10 ring-1 ring-arc-accent/40"
            : ""
        }`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" && folder.isCollapsed) {
            e.preventDefault();
            e.stopPropagation();
            onToggleCollapse(folder.id);
          } else if (e.key === "ArrowLeft" && !folder.isCollapsed) {
            e.preventDefault();
            e.stopPropagation();
            onToggleCollapse(folder.id);
          } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            onToggleCollapse(folder.id);
          }
        }}
      >
        {/* Drag grip */}
        <span
          {...attributes}
          {...listeners}
          className="shrink-0 flex items-center cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 touch-none pl-1 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Drag to reorder folder"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="w-3 h-3"
          >
            <path d="M6 3.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm0 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm0 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm5-9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm0 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm0 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
          </svg>
        </span>
        <FolderHeader
          folder={folder}
          onToggleCollapse={onToggleCollapse}
          onRename={onRename}
          onContextMenu={onContextMenu}
        />
      </div>
      {!folder.isCollapsed && (
        <div role="group">
          <SortableContext
            items={itemIds}
            strategy={verticalListSortingStrategy}
          >
            {folder.items.map((item) => (
              <DraggableFolderItem
                key={item.id}
                item={item}
                depth={depth}
                folderId={folder.id}
                onClick={onItemClick}
                onContextMenu={onItemContextMenu}
                onRename={onItemRename}
                isOverItem={overItemId === item.id}
              />
            ))}
          </SortableContext>
          {getChildren(folder.id).map((child) =>
            renderFolder(child, depth + 1)
          )}
        </div>
      )}
    </div>
    </>
  );
}

export default function FolderTree({
  onContextMenu,
  folders,
  setFolders,
  onItemClick,
  onItemContextMenu,
  onItemRename,
  onOpenAllTabs,
  onCloseAllTabs,
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

  const handleRename = useCallback(
    async (id: string, name: string) => {
      // Optimistic update
      setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
      try {
        await renameFolder(id, name);
      } catch {
        // Name validation failed — ignore
      }
    },
    [setFolders]
  );

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

  const handleCollapseAll = useCallback(
    async (folder: Folder) => {
      // Collect this folder and all descendant folder IDs
      const collectDescendantIds = (parentId: string): string[] => {
        const children = folders.filter((f) => f.parentId === parentId);
        const ids: string[] = [];
        for (const child of children) {
          ids.push(child.id);
          ids.push(...collectDescendantIds(child.id));
        }
        return ids;
      };

      const idsToCollapse = [folder.id, ...collectDescendantIds(folder.id)];

      // Optimistic update
      setFolders((prev) =>
        prev.map((f) =>
          idsToCollapse.includes(f.id) ? { ...f, isCollapsed: true } : f
        )
      );

      // Persist all collapse states
      await Promise.all(
        idsToCollapse.map((id) => updateFolder(id, { isCollapsed: true }))
      );
    },
    [folders, setFolders]
  );

  const handleFolderContextMenu = useCallback(
    (e: React.MouseEvent, folder: Folder) => {
      e.preventDefault();

      const items: ContextMenuItem[] = [
        {
          label: "New Subfolder",
          onClick: () => handleCreateFolder(folder.id),
        },
        {
          label: "Open All Tabs",
          onClick: () => onOpenAllTabs?.(folder),
        },
        {
          label: "Close All Tabs",
          onClick: () => onCloseAllTabs?.(folder),
        },
        {
          label: "Collapse All Subfolders",
          onClick: () => handleCollapseAll(folder),
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
    [
      onContextMenu,
      handleRename,
      handleDelete,
      handleCreateFolder,
      handleCollapseAll,
      onOpenAllTabs,
      onCloseAllTabs,
    ]
  );

  // Track which folder is being hovered for drop indicator between folders
  const [overFolderId, setOverFolderId] = useState<string | null>(null);
  useDndMonitor({
    onDragOver(event) {
      const overId = event.over?.id ? String(event.over.id) : null;
      if (overId && overId.startsWith("folder:")) {
        setOverFolderId(overId.replace("folder:", ""));
      } else {
        setOverFolderId(null);
      }
    },
    onDragEnd() {
      setOverFolderId(null);
    },
    onDragCancel() {
      setOverFolderId(null);
    },
  });

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
      onItemClick={onItemClick}
      onItemContextMenu={onItemContextMenu}
      onItemRename={onItemRename}
      isOverFolder={overFolderId === folder.id}
    />
  );

  const topLevelFolderIds = topLevelFolders.map((f) => `folder:${f.id}`);

  if (topLevelFolders.length === 0 && folders.length === 0) {
    return (
      <div className="px-2 py-1">
        <button
          onClick={() => handleCreateFolder()}
          className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-arc-text-secondary hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-arc-surface-hover transition-colors duration-200"
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
    <div className="px-1 pt-3 pb-2">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-[11px] text-gray-400 dark:text-arc-text-secondary font-medium">
          Folders
        </span>
        <button
          onClick={() => handleCreateFolder()}
          className="text-gray-400 dark:text-arc-text-secondary hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-200"
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
        <div
          className="flex flex-col gap-0.5"
          role="tree"
          aria-label="Folder tree"
        >
          {topLevelFolders.map((folder) => renderFolder(folder, 0))}
        </div>
      </SortableContext>

      {/* Error toast */}
      {toast && (
        <div className="mx-2 mt-2 px-3 py-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 rounded-lg border border-red-200 dark:border-red-500/20">
          {toast}
        </div>
      )}
    </div>
  );
}
