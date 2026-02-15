import { useCallback, useEffect, useRef, useState } from "react";
import type {
  TabInfo,
  PinnedApp,
  ServiceWorkerMessage,
  Folder,
  FolderItem,
} from "../shared/types";
import { useTheme, type ThemePreference } from "./useTheme";
import {
  getPinnedApps,
  addPinnedApp,
  removePinnedApp,
} from "../shared/storage";
import {
  getFolders,
  addItemToFolder,
  removeItemFromFolder,
  moveItemToFolder,
  reorderFolders,
  reorderItemsInFolder,
} from "../shared/folderStorage";
import PinnedAppsRow from "./PinnedAppsRow";
import FolderTree from "./FolderTree";
import SearchBar from "./SearchBar";
import WorkspaceManager from "./WorkspaceManager";
import ContextMenu, { type ContextMenuItem } from "./ContextMenu";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  useDraggable,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function DraggableTabItem({
  tab,
  onContextMenu,
}: {
  tab: TabInfo;
  onContextMenu: (e: React.MouseEvent, tab: TabInfo) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: `tab:${tab.id}` });

  const style = {
    transform: transform
      ? `translate(${transform.x}px, ${transform.y}px)`
      : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleClick = () => {
    chrome.runtime.sendMessage({ type: "SWITCH_TAB", tabId: tab.id });
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: "CLOSE_TAB", tabId: tab.id });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      chrome.runtime.sendMessage({ type: "CLOSE_TAB", tabId: tab.id });
    }
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onContextMenu={(e) => onContextMenu(e, tab)}
      className={`flex items-center gap-2 px-2 h-8 text-sm rounded cursor-default hover:bg-gray-200 dark:hover:bg-gray-800 touch-none ${
        tab.active
          ? "border-l-[3px] border-l-[#2E75B6] font-bold"
          : "border-l-[3px] border-l-transparent"
      } ${tab.discarded ? "opacity-50 italic" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {tab.favIconUrl ? (
        <img
          src={tab.favIconUrl}
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
      <span className="truncate flex-1 select-none">
        {tab.title || tab.url}
      </span>
      {tab.audible && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-3.5 h-3.5 shrink-0 text-blue-500 dark:text-blue-400"
          aria-label="Playing audio"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      )}
      {hovered && (
        <button
          onClick={handleClose}
          className="shrink-0 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          aria-label={`Close ${tab.title}`}
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
    </li>
  );
}

function TabDragOverlay({ tab }: { tab: TabInfo }) {
  return (
    <div className="flex items-center gap-2 px-2 h-8 text-sm rounded bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-600 opacity-90">
      {tab.favIconUrl ? (
        <img src={tab.favIconUrl} alt="" className="w-4 h-4 shrink-0" />
      ) : (
        <span className="w-4 h-4 shrink-0 rounded bg-gray-300 dark:bg-gray-600" />
      )}
      <span className="truncate flex-1 select-none">
        {tab.title || tab.url}
      </span>
    </div>
  );
}

function FolderPickerDropdown({
  folders,
  x,
  y,
  onSelect,
  onClose,
}: {
  folders: Folder[];
  x: number;
  y: number;
  onSelect: (folderId: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - 200),
    zIndex: 1000,
  };

  const renderFolderOption = (
    folder: Folder,
    depth: number
  ): React.ReactNode => {
    const children = folders.filter((f) => f.parentId === folder.id);
    return (
      <div key={folder.id}>
        <button
          onClick={() => onSelect(folder.id)}
          className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
          style={{ paddingLeft: 12 + depth * 16 }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4 shrink-0 text-gray-500 dark:text-gray-400"
          >
            <path d="M3.75 3A1.75 1.75 0 0 0 2 4.75v3.26a3.235 3.235 0 0 1 1.75-.51h12.5c.644 0 1.245.188 1.75.51V6.75A1.75 1.75 0 0 0 16.25 5h-4.836a.25.25 0 0 1-.177-.073L9.823 3.513A1.75 1.75 0 0 0 8.586 3H3.75ZM3.75 9A1.75 1.75 0 0 0 2 10.75v4.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0 0 18 15.25v-4.5A1.75 1.75 0 0 0 16.25 9H3.75Z" />
          </svg>
          <span className="truncate">{folder.name}</span>
        </button>
        {children.map((child) => renderFolderOption(child, depth + 1))}
      </div>
    );
  };

  const topLevelFolders = folders.filter((f) => f.parentId === null);

  return (
    <div
      ref={ref}
      style={style}
      className="min-w-[180px] max-w-[240px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1 max-h-[200px] overflow-y-auto"
    >
      <div className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400 font-medium">
        Save to folder
      </div>
      {topLevelFolders.map((folder) => renderFolderOption(folder, 0))}
    </div>
  );
}

const THEME_LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

function ThemeToggle({
  theme,
  onCycle,
}: {
  theme: ThemePreference;
  onCycle: () => void;
}) {
  return (
    <button
      onClick={onCycle}
      className="flex items-center gap-1.5 px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
      aria-label={`Theme: ${THEME_LABELS[theme]}. Click to cycle.`}
      title={`Theme: ${THEME_LABELS[theme]}`}
    >
      {theme === "dark" ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4"
        >
          <path
            fillRule="evenodd"
            d="M7.455 2.004a.75.75 0 0 1 .26.77 7 7 0 0 0 9.958 7.967.75.75 0 0 1 1.067.853A8.5 8.5 0 1 1 6.647 1.921a.75.75 0 0 1 .808.083Z"
            clipRule="evenodd"
          />
        </svg>
      ) : theme === "light" ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4"
        >
          <path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2ZM10 15a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 15ZM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM15.657 5.404a.75.75 0 1 0-1.06-1.06l-1.061 1.06a.75.75 0 0 0 1.06 1.061l1.061-1.06ZM6.464 14.596a.75.75 0 1 0-1.06-1.06l-1.061 1.06a.75.75 0 0 0 1.06 1.061l1.061-1.06ZM18 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 18 10ZM5 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 5 10ZM14.596 15.657a.75.75 0 0 0 1.06-1.06l-1.06-1.061a.75.75 0 1 0-1.061 1.06l1.06 1.061ZM5.404 6.464a.75.75 0 0 0 1.06-1.06l-1.06-1.061a.75.75 0 1 0-1.061 1.06l1.06 1.061Z" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4"
        >
          <path
            fillRule="evenodd"
            d="M2 4.25A2.25 2.25 0 0 1 4.25 2h11.5A2.25 2.25 0 0 1 18 4.25v8.5A2.25 2.25 0 0 1 15.75 15h-3.105a3.501 3.501 0 0 0 1.1 1.677A.75.75 0 0 1 13.26 18H6.74a.75.75 0 0 1-.484-1.323A3.501 3.501 0 0 0 7.355 15H4.25A2.25 2.25 0 0 1 2 12.75v-8.5Zm1.5 0a.75.75 0 0 1 .75-.75h11.5a.75.75 0 0 1 .75.75v7.5a.75.75 0 0 1-.75.75H4.25a.75.75 0 0 1-.75-.75v-7.5Z"
            clipRule="evenodd"
          />
        </svg>
      )}
      {THEME_LABELS[theme]}
    </button>
  );
}

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

// Custom collision detection: prefer droppable folder targets, then fall back to closest center
const customCollisionDetection: CollisionDetection = (args) => {
  // First check for pointer-within collisions (good for drop targets like folders)
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    // Prefer folder drop targets
    const folderDrops = pointerCollisions.filter((c) =>
      String(c.id).startsWith("folder-drop:")
    );
    if (folderDrops.length > 0) return folderDrops;
    return pointerCollisions;
  }
  // Fall back to rect intersection for sortable items
  return rectIntersection(args);
};

export default function App() {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [pinnedApps, setPinnedApps] = useState<PinnedApp[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [activeDragTab, setActiveDragTab] = useState<TabInfo | null>(null);
  const [folderPicker, setFolderPicker] = useState<{
    tab: TabInfo;
    x: number;
    y: number;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

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

  // Load pinned apps and listen for changes
  useEffect(() => {
    getPinnedApps().then(setPinnedApps);

    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === "local" && changes.pinnedApps) {
        const apps = (changes.pinnedApps.newValue as PinnedApp[]) ?? [];
        setPinnedApps(apps.sort((a, b) => a.sortOrder - b.sortOrder));
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  useEffect(() => {
    // Request initial tab list from service worker
    chrome.runtime.sendMessage({ type: "GET_TABS" }, (response: TabInfo[]) => {
      if (response) {
        setTabs(response);
      }
    });

    // Also try loading from storage in case service worker responds slowly
    chrome.storage.local.get("tabList", (result) => {
      if (result.tabList && Array.isArray(result.tabList)) {
        const stored = result.tabList as TabInfo[];
        setTabs((prev) => (prev.length === 0 ? stored : prev));
      }
    });

    // Listen for tab state updates from service worker
    const handleMessage = (message: ServiceWorkerMessage) => {
      if (message.type === "TABS_UPDATED") {
        setTabs(message.tabs);
      } else if (message.type === "TAB_ACTIVATED") {
        setTabs((prev) =>
          prev.map((tab) => ({
            ...tab,
            active:
              tab.id === message.tabId && tab.windowId === message.windowId,
          }))
        );
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  const { theme, cycleTheme } = useTheme();

  const handleTabContextMenu = useCallback(
    (e: React.MouseEvent, tab: TabInfo) => {
      e.preventDefault();
      const origin = getOrigin(tab.url);
      const isPinned = pinnedApps.some((app) => getOrigin(app.url) === origin);

      const items: ContextMenuItem[] = [];

      if (isPinned) {
        items.push({
          label: "Unpin from ArcFlow",
          onClick: () => {
            const app = pinnedApps.find((a) => getOrigin(a.url) === origin);
            if (app) {
              removePinnedApp(app.id);
            }
          },
        });
      } else {
        items.push({
          label: "Pin to ArcFlow",
          onClick: () => {
            addPinnedApp({
              id: crypto.randomUUID(),
              url: tab.url,
              title: tab.title || tab.url,
              favicon: tab.favIconUrl || "",
            }).catch(() => {
              // Max pinned apps reached — silently ignore
            });
          },
        });
      }

      // Add "Save Link to Folder..." if there are folders
      if (folders.length > 0) {
        items.push({
          label: "Save Link to Folder...",
          onClick: () => {
            setFolderPicker({ tab, x: e.clientX, y: e.clientY });
          },
        });
      }

      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [pinnedApps, folders]
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleSaveLinkToFolder = useCallback(
    async (folderId: string) => {
      if (!folderPicker) return;
      const { tab } = folderPicker;
      const newItem: FolderItem = {
        id: crypto.randomUUID(),
        type: "link",
        tabId: null,
        url: tab.url,
        title: tab.title || tab.url,
        favicon: tab.favIconUrl || "",
        isArchived: false,
        lastActiveAt: Date.now(),
      };
      await addItemToFolder(folderId, newItem);
      setFolderPicker(null);
    },
    [folderPicker]
  );

  const handleOpenAllTabs = useCallback((folder: Folder) => {
    // Open all saved links (type === 'link') as new tabs
    const links = folder.items.filter((i) => i.type === "link");
    for (const link of links) {
      chrome.runtime.sendMessage({ type: "OPEN_URL", url: link.url });
    }
  }, []);

  const handleCloseAllTabs = useCallback((folder: Folder) => {
    // Close all active tabs (type === 'tab') via chrome.tabs.remove; saved links remain
    const tabIds = folder.items
      .filter((i) => i.type === "tab" && i.tabId != null)
      .map((i) => i.tabId as number);
    if (tabIds.length > 0) {
      chrome.runtime.sendMessage({ type: "CLOSE_TABS", tabIds });
    }
  }, []);

  const handleFolderItemClick = useCallback((item: FolderItem) => {
    if (item.type === "link") {
      chrome.runtime.sendMessage({ type: "OPEN_URL", url: item.url });
    } else if (item.type === "tab" && item.tabId != null) {
      chrome.runtime.sendMessage({ type: "SWITCH_TAB", tabId: item.tabId });
    }
  }, []);

  const handleFolderItemContextMenu = useCallback(
    (e: React.MouseEvent, item: FolderItem, folderId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const items: ContextMenuItem[] = [];

      if (item.type === "link") {
        items.push({
          label: "Open Link",
          onClick: () => {
            chrome.runtime.sendMessage({ type: "OPEN_URL", url: item.url });
          },
        });
        items.push({
          label: "Remove",
          onClick: () => {
            removeItemFromFolder(folderId, item.id);
          },
        });
      }

      if (items.length > 0) {
        setContextMenu({ x: e.clientX, y: e.clientY, items });
      }
    },
    []
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = String(event.active.id);
      if (id.startsWith("tab:")) {
        const tabId = parseInt(id.replace("tab:", ""), 10);
        const tab = tabs.find((t) => t.id === tabId);
        if (tab) setActiveDragTab(tab);
      }
    },
    [tabs]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveDragTab(null);
      const { active, over } = event;
      if (!over) return;

      const activeId = String(active.id);
      const overId = String(over.id);

      // Case 1: Tab dropped onto a folder
      if (activeId.startsWith("tab:") && overId.startsWith("folder-drop:")) {
        const tabId = parseInt(activeId.replace("tab:", ""), 10);
        const folderId = overId.replace("folder-drop:", "");
        const tab = tabs.find((t) => t.id === tabId);
        if (!tab) return;

        const newItem: FolderItem = {
          id: crypto.randomUUID(),
          type: "tab",
          tabId: tab.id,
          url: tab.url,
          title: tab.title || tab.url,
          favicon: tab.favIconUrl || "",
          isArchived: false,
          lastActiveAt: Date.now(),
        };

        await addItemToFolder(folderId, newItem);
        return;
      }

      // Case 2: Folder item dropped onto a different folder
      if (
        activeId.startsWith("folder-item:") &&
        overId.startsWith("folder-drop:")
      ) {
        const itemId = activeId.replace("folder-item:", "");
        const targetFolderId = overId.replace("folder-drop:", "");
        try {
          await moveItemToFolder(itemId, targetFolderId);
        } catch {
          // Item not found or target not found
        }
        return;
      }

      // Case 3: Reorder folder items within same folder
      if (
        activeId.startsWith("folder-item:") &&
        overId.startsWith("folder-item:")
      ) {
        const activeItemId = activeId.replace("folder-item:", "");
        const overItemId = overId.replace("folder-item:", "");

        // Find which folder contains the active item
        const sourceFolder = folders.find((f) =>
          f.items.some((i) => i.id === activeItemId)
        );
        const targetFolder = folders.find((f) =>
          f.items.some((i) => i.id === overItemId)
        );

        if (
          sourceFolder &&
          targetFolder &&
          sourceFolder.id === targetFolder.id
        ) {
          // Reorder within same folder
          const oldIndex = sourceFolder.items.findIndex(
            (i) => i.id === activeItemId
          );
          const newIndex = sourceFolder.items.findIndex(
            (i) => i.id === overItemId
          );
          if (oldIndex !== -1 && newIndex !== -1) {
            const reorderedItems = arrayMove(
              sourceFolder.items,
              oldIndex,
              newIndex
            );

            // Optimistic update
            setFolders((prev) =>
              prev.map((f) =>
                f.id === sourceFolder.id ? { ...f, items: reorderedItems } : f
              )
            );

            await reorderItemsInFolder(
              sourceFolder.id,
              reorderedItems.map((i) => i.id)
            );
          }
        } else if (sourceFolder && targetFolder) {
          // Move between folders
          await moveItemToFolder(activeItemId, targetFolder.id);
        }
        return;
      }

      // Case 4: Reorder folders among siblings
      if (activeId.startsWith("folder:") && overId.startsWith("folder:")) {
        const activeFolderId = activeId.replace("folder:", "");
        const overFolderId = overId.replace("folder:", "");

        const activeFolder = folders.find((f) => f.id === activeFolderId);
        const overFolder = folders.find((f) => f.id === overFolderId);

        if (
          activeFolder &&
          overFolder &&
          activeFolder.parentId === overFolder.parentId
        ) {
          const siblings = folders
            .filter((f) => f.parentId === activeFolder.parentId)
            .sort((a, b) => a.sortOrder - b.sortOrder);

          const oldIndex = siblings.findIndex((f) => f.id === activeFolderId);
          const newIndex = siblings.findIndex((f) => f.id === overFolderId);

          if (oldIndex !== -1 && newIndex !== -1) {
            const reordered = arrayMove(siblings, oldIndex, newIndex);

            // Optimistic update
            setFolders((prev) => {
              const updated = [...prev];
              reordered.forEach((f, i) => {
                const idx = updated.findIndex((u) => u.id === f.id);
                if (idx !== -1) {
                  updated[idx] = { ...updated[idx], sortOrder: i };
                }
              });
              return updated;
            });

            await reorderFolders(
              reordered.map((f) => f.id),
              activeFolder.parentId
            );
          }
        }
        return;
      }
    },
    [tabs, folders, setFolders]
  );

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <header className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-lg font-semibold">ArcFlow</h1>
      </header>

      {/* Search bar (Zone 1) */}
      <SearchBar
        tabs={tabs}
        folders={folders}
        onSwitchTab={(tabId) => {
          chrome.runtime.sendMessage({ type: "SWITCH_TAB", tabId });
        }}
        onOpenUrl={(url) => {
          chrome.runtime.sendMessage({ type: "OPEN_URL", url });
        }}
      />

      {/* Pinned Apps Row (Zone 2) */}
      <PinnedAppsRow tabs={tabs} onContextMenu={setContextMenu} />

      {/* Workspace Manager */}
      <WorkspaceManager onContextMenu={setContextMenu} />

      <DndContext
        sensors={sensors}
        collisionDetection={customCollisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Folder Tree (Zone 3) */}
        <FolderTree
          onContextMenu={setContextMenu}
          folders={folders}
          setFolders={setFolders}
          onItemClick={handleFolderItemClick}
          onItemContextMenu={handleFolderItemContextMenu}
          onOpenAllTabs={handleOpenAllTabs}
          onCloseAllTabs={handleCloseAllTabs}
        />

        {/* Tab list */}
        <div className="flex-1 px-1">
          <p className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">
            {tabs.length} tab{tabs.length !== 1 ? "s" : ""} open
          </p>
          <ul className="flex flex-col gap-1">
            {tabs.map((tab) => (
              <DraggableTabItem
                key={tab.id}
                tab={tab}
                onContextMenu={handleTabContextMenu}
              />
            ))}
          </ul>
        </div>

        <DragOverlay>
          {activeDragTab ? <TabDragOverlay tab={activeDragTab} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Footer */}
      <footer className="flex items-center justify-end px-3 py-2 border-t border-gray-200 dark:border-gray-700">
        <ThemeToggle theme={theme} onCycle={cycleTheme} />
      </footer>

      {/* Folder Picker Dropdown */}
      {folderPicker && (
        <FolderPickerDropdown
          folders={folders}
          x={folderPicker.x}
          y={folderPicker.y}
          onSelect={handleSaveLinkToFolder}
          onClose={() => setFolderPicker(null)}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}
