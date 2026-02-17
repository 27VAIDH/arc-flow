import { useCallback, useEffect, useMemo, useRef, useState, memo, type RefObject } from "react";
import type {
  TabInfo,
  PinnedApp,
  Workspace,
  ServiceWorkerMessage,
  Folder,
  FolderItem,
  Session,
} from "../shared/types";
import { useTheme, applyPanelColor } from "./useTheme";
import type { Settings } from "../shared/types";
import {
  addPinnedApp,
  removePinnedApp,
} from "../shared/storage";
import { getSettings, updateSettings } from "../shared/settingsStorage";
import {
  createFolder,
  addItemToFolder,
  removeItemFromFolder,
  moveItemToFolder,
  reorderFolders,
  reorderItemsInFolder,
  renameItemInFolder,
} from "../shared/folderStorage";
import {
  getActiveWorkspace,
  getWorkspaces,
  createWorkspace,
  setActiveWorkspace as setActiveWorkspaceStorage,
} from "../shared/workspaceStorage";
import PinnedAppsRow from "./PinnedAppsRow";
import FolderTree from "./FolderTree";
import SearchBar from "./SearchBar";
import WorkspaceSwitcher from "./WorkspaceSwitcher";
import ArchiveSection from "./ArchiveSection";
import SettingsPanel from "./SettingsPanel";
import CommandPalette from "./CommandPalette";
import OrganizeTabsModal from "./OrganizeTabsModal";
import SessionManager from "./SessionManager";
import Onboarding from "./Onboarding";
import { isOnboardingCompleted } from "../shared/onboardingStorage";
import { createSessionFromState } from "../shared/sessionStorage";
import { updateWorkspace } from "../shared/workspaceStorage";
import QuickNotes from "./QuickNotes";
import TabPreviewCard from "./TabPreviewCard";
import type { TabPreviewInfo } from "./TabPreviewCard";
import { buildCommands } from "./commandRegistry";
import ContextMenu, { type ContextMenuItem } from "./ContextMenu";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
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
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { List } from "react-window";
import type { CSSProperties } from "react";

function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

// Lazy-loading favicon with IntersectionObserver
const LazyFavicon = memo(function LazyFavicon({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setLoaded(true);
          observer.disconnect();
        }
      },
      { rootMargin: "50px" }
    );

    observer.observe(img);
    return () => observer.disconnect();
  }, []);

  return loaded ? (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      className="w-4 h-4 shrink-0"
      draggable={false}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  ) : (
    <span
      ref={imgRef}
      className="w-4 h-4 shrink-0 rounded bg-gray-200 dark:bg-arc-surface-hover"
    />
  );
});

const VIRTUAL_LIST_THRESHOLD = 50;
const TAB_ITEM_HEIGHT = 36; // 32px height + 4px gap

// Row component for react-window virtual list
interface VirtualTabRowProps {
  tabs: TabInfo[];
  onContextMenu: (e: React.MouseEvent, tab: TabInfo) => void;
  tabNameOverrides: Record<number, string>;
  onTabRename: (tabId: number, newName: string) => void;
}

function VirtualTabRow({
  index,
  style,
  tabs,
  onContextMenu,
  tabNameOverrides,
  onTabRename,
}: {
  index: number;
  style: CSSProperties;
  ariaAttributes: Record<string, unknown>;
  tabs: TabInfo[];
  onContextMenu: (e: React.MouseEvent, tab: TabInfo) => void;
  tabNameOverrides: Record<number, string>;
  onTabRename: (tabId: number, newName: string) => void;
}) {
  const tab = tabs[index];
  if (!tab) return null;
  return (
    <DraggableTabItem
      key={tab.id}
      tab={tab}
      onContextMenu={onContextMenu}
      style={style}
      displayName={tabNameOverrides[tab.id]}
      onTabRename={onTabRename}
    />
  );
}

const DraggableTabItem = memo(function DraggableTabItem({
  tab,
  onContextMenu,
  style: outerStyle,
  onMouseEnter,
  onMouseLeave,
  displayName,
  onTabRename,
}: {
  tab: TabInfo;
  onContextMenu: (e: React.MouseEvent, tab: TabInfo) => void;
  style?: React.CSSProperties;
  onMouseEnter?: (e: React.MouseEvent, tab: TabInfo) => void;
  onMouseLeave?: () => void;
  displayName?: string;
  onTabRename?: (tabId: number, newName: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: `tab:${tab.id}` });

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null) as RefObject<HTMLInputElement>;
  const committedRef = useRef(false);

  const hasCustomName = !!displayName;
  const shownName = displayName || tab.title || tab.url;
  const originalTitle = tab.title || tab.url;

  const style = {
    ...outerStyle,
    transform: transform
      ? `translate(${transform.x}px, ${transform.y}px)`
      : undefined,
    opacity: isDragging ? 0.3 : 1,
  };

  const commitRename = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    const trimmed = editName.trim();
    if (onTabRename) {
      // Empty name clears the override, reverting to original title
      onTabRename(tab.id, trimmed);
    }
    setEditing(false);
  }, [editName, onTabRename, tab.id]);

  const handleClick = () => {
    if (editing) return;
    chrome.runtime.sendMessage({ type: "SWITCH_TAB", tabId: tab.id });
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onTabRename) return;
    setEditing(true);
    setEditName(shownName);
    committedRef.current = false;
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
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

  const srLabel = [
    originalTitle,
    tab.active ? "active" : "",
    tab.audible ? "playing audio" : "",
    tab.discarded ? "suspended" : "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      role="option"
      aria-selected={tab.active}
      aria-label={srLabel}
      tabIndex={0}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onKeyDown={(e) => {
        if (editing) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        } else if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          chrome.runtime.sendMessage({ type: "CLOSE_TAB", tabId: tab.id });
        }
      }}
      onContextMenu={(e) => onContextMenu(e, tab)}
      onMouseEnter={onMouseEnter ? (e) => onMouseEnter(e, tab) : undefined}
      onMouseLeave={onMouseLeave}
      className={`group flex items-center gap-2 px-2 h-8 text-sm rounded-lg cursor-default transition-all duration-150 hover:bg-gray-100 dark:hover:bg-arc-surface-hover focus:outline-none focus:ring-2 focus:ring-arc-accent/50 focus:ring-inset ${
        tab.active
          ? "border-l-[3px] border-l-arc-accent font-medium bg-gray-100/50 dark:bg-arc-surface"
          : "border-l-[3px] border-l-transparent"
      } ${tab.discarded ? "opacity-50 italic" : ""}`}
    >
      {/* Drag grip */}
      <span
        {...listeners}
        className="shrink-0 flex items-center cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 touch-none opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Drag to reorder"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
          <path d="M6 3.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm0 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm0 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm5-9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm0 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm0 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
        </svg>
      </span>
      {tab.favIconUrl ? (
        <LazyFavicon src={tab.favIconUrl} alt="" />
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
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              commitRename();
            } else if (e.key === "Escape") {
              committedRef.current = true;
              setEditing(false);
            }
          }}
          onBlur={commitRename}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 bg-transparent border border-arc-accent/50 rounded px-1 text-sm text-gray-700 dark:text-arc-text-primary outline-none"
        />
      ) : (
        <span
          className={`truncate flex-1 select-none text-gray-700 dark:text-arc-text-primary ${hasCustomName ? "italic" : ""}`}
          title={hasCustomName ? originalTitle : undefined}
        >
          {shownName}
        </span>
      )}
      {tab.audible && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-3.5 h-3.5 shrink-0 text-arc-accent dark:text-arc-accent-hover"
          aria-hidden="true"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      )}
      <button
        onClick={handleClose}
        onPointerDown={(e) => e.stopPropagation()}
        className="shrink-0 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
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
    </li>
  );
});

function TabDragOverlay({ tab }: { tab: TabInfo }) {
  return (
    <div className="flex items-center gap-2 px-2 h-8 text-sm rounded-lg bg-white dark:bg-arc-surface shadow-lg border border-gray-200 dark:border-arc-border opacity-90">
      {tab.favIconUrl ? (
        <img src={tab.favIconUrl} alt="" className="w-4 h-4 shrink-0" />
      ) : (
        <span className="w-4 h-4 shrink-0 rounded bg-gray-200 dark:bg-arc-surface-hover" />
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
          className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-arc-surface-hover flex items-center gap-2 transition-colors duration-150"
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
      className="min-w-[180px] max-w-[240px] bg-white dark:bg-arc-surface border border-gray-200 dark:border-arc-border rounded-xl shadow-xl py-1 max-h-[200px] overflow-y-auto"
    >
      <div className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400 font-medium">
        Save to folder
      </div>
      {topLevelFolders.map((folder) => renderFolderOption(folder, 0))}
    </div>
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
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("default");
  const [tabWorkspaceMap, setTabWorkspaceMap] = useState<
    Record<string, string>
  >({});
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [folderPicker, setFolderPicker] = useState<{
    tab: TabInfo;
    x: number;
    y: number;
  } | null>(null);
  const [focusModeEnabled, setFocusModeEnabled] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showOrganizeTabs, setShowOrganizeTabs] = useState(false);
  const [showSessionManager, setShowSessionManager] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [tabNameOverrides, setTabNameOverrides] = useState<Record<number, string>>({});
  const [tabPreview, setTabPreview] = useState<{
    tab: TabPreviewInfo;
    position: { top: number; left: number };
  } | null>(null);
  const tabPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Check if onboarding is needed on mount
  useEffect(() => {
    isOnboardingCompleted().then((completed) => {
      if (!completed) {
        setTimeout(() => setShowOnboarding(true), 0);
      }
    });
  }, []);

  // Listen for Ctrl+Shift+K to open command palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "K") {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Load active workspace, workspaces list, tab-workspace map, and settings on mount
  useEffect(() => {
    getActiveWorkspace().then((ws) => {
      setActiveWorkspaceId(ws.id);
    });
    getWorkspaces().then(setWorkspaces);
    getSettings().then((s) => {
      setFocusModeEnabled(s.focusMode.enabled);
    });

    // Request initial tab-workspace map from service worker
    chrome.runtime.sendMessage(
      { type: "GET_TAB_WORKSPACE_MAP" },
      (response: Record<string, string>) => {
        if (response) {
          setTabWorkspaceMap(response);
        }
      }
    );

    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === "local") {
        if (changes.activeWorkspaceId) {
          const newId = changes.activeWorkspaceId.newValue as string;
          if (newId) setActiveWorkspaceId(newId);
        }
        if (changes.tabWorkspaceMap) {
          const newMap =
            (changes.tabWorkspaceMap.newValue as Record<string, string>) ?? {};
          setTabWorkspaceMap(newMap);
        }
        if (changes.workspaces) {
          const updated = (changes.workspaces.newValue as Workspace[]) ?? [];
          setWorkspaces(updated.sort((a, b) => a.sortOrder - b.sortOrder));
        }
        if (changes.settings) {
          const newSettings = changes.settings.newValue as Settings | undefined;
          if (newSettings) {
            setFocusModeEnabled(newSettings.focusMode.enabled);
          }
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // Extract pinned apps and folders from the active workspace
  useEffect(() => {
    const ws = workspaces.find((w) => w.id === activeWorkspaceId);
    if (ws) {
      setPinnedApps(
        [...(ws.pinnedApps ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
      );
      setFolders(
        [...(ws.folders ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
      );
    }
  }, [activeWorkspaceId, workspaces]);

  // Apply workspace-level panel color on workspace switch
  useEffect(() => {
    const ws = workspaces.find((w) => w.id === activeWorkspaceId);
    if (!ws) return;
    if (ws.panelColor) {
      applyPanelColor(ws.panelColor);
    } else {
      // Fall back to global panel color from settings
      getSettings().then((s) => {
        applyPanelColor(s.panelColor);
      });
    }
  }, [activeWorkspaceId, workspaces]);

  // Load tabNameOverrides for the active workspace
  useEffect(() => {
    const key = `tabNameOverrides_${activeWorkspaceId}`;
    chrome.storage.local.get(key, (result) => {
      setTabNameOverrides((result[key] as Record<number, string>) ?? {});
    });
  }, [activeWorkspaceId]);

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
      if (message.type === "OPEN_COMMAND_PALETTE") {
        setShowCommandPalette(true);
      } else if (message.type === "TABS_UPDATED") {
        setTabs(message.tabs);
      } else if (message.type === "TAB_WORKSPACE_MAP_UPDATED") {
        setTabWorkspaceMap(message.tabWorkspaceMap);
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

  const handleWorkspaceChange = useCallback((workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
  }, []);

  // Filter tabs by active workspace and exclude tabs assigned to folders
  const filteredTabs = useMemo(() => {
    const tabIdsInFolders = new Set<number>(
      folders
        .flatMap((f) => f.items)
        .filter((item) => item.type === "tab" && item.tabId != null)
        .map((item) => item.tabId as number)
    );

    return tabs.filter((tab) => {
      const wsId = tabWorkspaceMap[String(tab.id)];
      // Show tabs assigned to the active workspace.
      // Unmapped tabs default to "default" workspace (not shown everywhere).
      const effectiveWsId = wsId || "default";
      return effectiveWsId === activeWorkspaceId && !tabIdsInFolders.has(tab.id);
    });
  }, [tabs, tabWorkspaceMap, activeWorkspaceId, folders]);

  const { cycleTheme } = useTheme();

  // Suspension stats
  const suspendedCount = useMemo(
    () => tabs.filter((t) => t.discarded).length,
    [tabs]
  );
  const estimatedMBSaved = suspendedCount * 50;

  // Stable callbacks for command palette actions
  const focusSearchInput = useCallback(() => {
    const input = document.querySelector<HTMLInputElement>(
      'input[placeholder="Search tabs..."]'
    );
    input?.focus();
  }, []);

  const suspendOtherTabs = useCallback(() => {
    const nonActive = filteredTabs.filter((t) => !t.active && !t.discarded);
    for (const tab of nonActive) {
      chrome.runtime.sendMessage({ type: "SUSPEND_TAB", tabId: tab.id });
    }
  }, [filteredTabs]);

  const createNewWorkspace = useCallback(() => {
    createWorkspace("New Workspace").then((ws) => {
      setActiveWorkspaceStorage(ws.id);
      handleWorkspaceChange(ws.id);
    });
  }, [handleWorkspaceChange]);

  const toggleFocusMode = useCallback(() => {
    getSettings().then((s) => {
      const newEnabled = !s.focusMode.enabled;
      const hasRules = s.focusMode.redirectRules.some(
        (r) => r.blockedPattern.trim() && r.redirectUrl.trim()
      );
      // If enabling but no rules configured, open settings so user can add rules
      if (newEnabled && !hasRules) {
        setShowSettings(true);
      }
      updateSettings({
        focusMode: { ...s.focusMode, enabled: newEnabled },
      }).then(() => {
        chrome.runtime.sendMessage({
          type: "UPDATE_FOCUS_MODE",
          enabled: newEnabled,
          redirectRules: s.focusMode.redirectRules,
        });
      });
    });
  }, []);

  const openSettings = useCallback(() => setShowSettings(true), []);

  const splitViewActiveTab = useCallback(() => {
    const activeTab = filteredTabs.find((t) => t.active);
    if (activeTab) {
      chrome.runtime.sendMessage({ type: "SPLIT_VIEW", tabId: activeTab.id });
    }
  }, [filteredTabs]);
  const createNewFolder = useCallback(() => {
    createFolder("New Folder");
  }, []);

  const handleSaveSession = useCallback(() => {
    const defaultName = `Session ${new Date().toLocaleString()}`;
    const name = window.prompt("Enter session name:", defaultName);
    if (!name) return;
    createSessionFromState({
      name,
      pinnedApps,
      folders,
      tabUrls: filteredTabs.map((t) => ({
        url: t.url,
        title: t.title || t.url,
        favicon: t.favIconUrl || "",
      })),
    });
  }, [pinnedApps, folders, filteredTabs]);

  const handleRestoreSession = useCallback(
    (session: Session, mode: "replace" | "add") => {
      if (mode === "replace") {
        // Close all current tabs in this workspace, then open session tabs
        const tabIds = filteredTabs.filter((t) => !t.active).map((t) => t.id);
        if (tabIds.length > 0) {
          chrome.runtime.sendMessage({ type: "CLOSE_TABS", tabIds });
        }
      }
      // Open all session tabs
      for (const tab of session.tabUrls) {
        chrome.runtime.sendMessage({ type: "OPEN_URL", url: tab.url });
      }
      setShowSessionManager(false);
    },
    [filteredTabs]
  );

  const openSessionManager = useCallback(() => setShowSessionManager(true), []);

  // QuickNotes: derive from active workspace
  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId),
    [workspaces, activeWorkspaceId]
  );

  const handleNotesChange = useCallback(
    (notes: string) => {
      updateWorkspace(activeWorkspaceId, {
        notes,
        notesLastEditedAt: Date.now(),
      });
    },
    [activeWorkspaceId]
  );

  const handleNotesCollapseToggle = useCallback(() => {
    if (!activeWorkspace) return;
    updateWorkspace(activeWorkspaceId, {
      notesCollapsed: !activeWorkspace.notesCollapsed,
    });
  }, [activeWorkspaceId, activeWorkspace]);

  // Tab name override handler
  const handleTabRename = useCallback(
    (tabId: number, newName: string) => {
      setTabNameOverrides((prev) => {
        const next = { ...prev };
        if (newName) {
          next[tabId] = newName;
        } else {
          delete next[tabId];
        }
        const key = `tabNameOverrides_${activeWorkspaceId}`;
        chrome.storage.local.set({ [key]: next });
        return next;
      });
    },
    [activeWorkspaceId]
  );

  // Tab hover preview handlers
  const handleTabHoverStart = useCallback(
    (e: React.MouseEvent, tab: TabInfo) => {
      if (tabPreviewTimerRef.current) clearTimeout(tabPreviewTimerRef.current);
      tabPreviewTimerRef.current = setTimeout(() => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const ws = workspaces.find(
          (w) => w.id === (tabWorkspaceMap[String(tab.id)] || "default")
        );
        const previewInfo: TabPreviewInfo = {
          id: tab.id,
          title: tab.title || tab.url,
          url: tab.url,
          favIconUrl: tab.favIconUrl || "",
          active: tab.active,
          audible: tab.audible,
          discarded: tab.discarded,
          lastActiveAt: 0,
          workspaceName: ws?.name || "Default",
          workspaceEmoji: ws?.emoji || "\uD83C\uDFE0",
        };
        setTabPreview({
          tab: previewInfo,
          position: { top: rect.top, left: rect.right + 8 },
        });
      }, 400);
    },
    [workspaces, tabWorkspaceMap]
  );

  const handleTabHoverEnd = useCallback(() => {
    if (tabPreviewTimerRef.current) clearTimeout(tabPreviewTimerRef.current);
    tabPreviewTimerRef.current = null;
    setTabPreview(null);
  }, []);

  // Focus Notes command
  const focusNotes = useCallback(() => {
    if (activeWorkspace?.notesCollapsed) {
      updateWorkspace(activeWorkspaceId, { notesCollapsed: false });
    }
    setTimeout(() => {
      const textarea = document.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label^="Workspace notes"]'
      );
      textarea?.focus();
    }, 100);
  }, [activeWorkspaceId, activeWorkspace]);

  // Build command palette commands
  const commands = useMemo(
    () =>
      buildCommands({
        workspaces,
        onSwitchWorkspace: handleWorkspaceChange,
        onCreateFolder: createNewFolder,
        onSuspendOthers: suspendOtherTabs,
        onToggleTheme: cycleTheme,
        onOpenSettings: openSettings,
        onSearchTabs: focusSearchInput,
        onNewWorkspace: createNewWorkspace,
        onToggleFocusMode: toggleFocusMode,
        onSplitView: splitViewActiveTab,
        onSaveSession: handleSaveSession,
        onRestoreSession: openSessionManager,
        onFocusNotes: focusNotes,
      }),
    [
      workspaces,
      handleWorkspaceChange,
      createNewFolder,
      suspendOtherTabs,
      cycleTheme,
      openSettings,
      focusSearchInput,
      createNewWorkspace,
      toggleFocusMode,
      splitViewActiveTab,
      handleSaveSession,
      openSessionManager,
      focusNotes,
    ]
  );

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

      // Add "Suspend Tab" if the tab is not already discarded
      if (!tab.discarded) {
        items.push({
          label: "Suspend Tab",
          onClick: () => {
            chrome.runtime.sendMessage({
              type: "SUSPEND_TAB",
              tabId: tab.id,
            });
          },
        });
      }

      // Add "Split View" to open tab in a side-by-side window
      items.push({
        label: "Split View",
        onClick: () => {
          chrome.runtime.sendMessage({
            type: "SPLIT_VIEW",
            tabId: tab.id,
          });
        },
      });

      // Add "Move to Workspace..." if there are multiple workspaces
      if (workspaces.length > 1) {
        const otherWorkspaces = workspaces.filter(
          (ws) => ws.id !== activeWorkspaceId
        );
        for (const ws of otherWorkspaces) {
          items.push({
            label: `Move to ${ws.emoji} ${ws.name}`,
            onClick: () => {
              chrome.runtime.sendMessage({
                type: "MOVE_TAB_TO_WORKSPACE",
                tabId: tab.id,
                workspaceId: ws.id,
              });
            },
          });
        }
      }

      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [pinnedApps, folders, workspaces, activeWorkspaceId]
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
    if (item.type === "tab" && item.tabId != null) {
      // Check if the tab still exists in our known tabs list
      const tabStillOpen = tabs.some((t) => t.id === item.tabId);
      if (tabStillOpen) {
        chrome.runtime.sendMessage({ type: "SWITCH_TAB", tabId: item.tabId });
      } else {
        // Tab was closed — open the URL instead
        chrome.runtime.sendMessage({ type: "OPEN_URL", url: item.url });
      }
    } else {
      chrome.runtime.sendMessage({ type: "OPEN_URL", url: item.url });
    }
  }, [tabs]);

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
      } else if (item.type === "tab") {
        items.push({
          label: "Switch to Tab",
          onClick: () => {
            if (item.tabId != null) {
              chrome.runtime.sendMessage({ type: "SWITCH_TAB", tabId: item.tabId });
            } else {
              chrome.runtime.sendMessage({ type: "OPEN_URL", url: item.url });
            }
          },
        });
      }

      items.push({
        label: "Rename",
        onClick: () => {
          const newName = window.prompt("Rename item:", item.title || item.url);
          if (newName && newName.trim()) {
            renameItemInFolder(folderId, item.id, newName.trim());
          }
        },
      });

      items.push({
        label: "Remove",
        onClick: () => {
          removeItemFromFolder(folderId, item.id);
        },
      });

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
    <div className="flex flex-col min-h-screen bg-gray-50 text-gray-900 dark:bg-[var(--color-arc-panel-bg)] dark:text-arc-text-primary">
      {/* Live region for screen reader announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        id="arcflow-live-region"
      >
        {filteredTabs.length} tab{filteredTabs.length !== 1 ? "s" : ""} open
        {suspendedCount > 0 &&
          `. ${suspendedCount} suspended, ~${estimatedMBSaved} MB saved`}
      </div>

      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200/80 dark:border-arc-border">
        <h1 className="text-sm font-semibold tracking-tight text-gray-800 dark:text-arc-text-primary">ArcFlow</h1>
        <button
          onClick={() => setShowOrganizeTabs(true)}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg hover:bg-gray-100 dark:hover:bg-arc-surface-hover text-gray-500 dark:text-arc-text-secondary transition-colors duration-150"
          title="Organize Tabs"
          aria-label="Organize Tabs"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path
              fillRule="evenodd"
              d="M2 3.75A.75.75 0 0 1 2.75 3h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 3.75Zm0 4.167a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Zm0 4.166a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Zm0 4.167a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z"
              clipRule="evenodd"
            />
          </svg>
          Organize
        </button>
      </header>

      {/* Search bar (Zone 1) */}
      <nav aria-label="Tab search">
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
      </nav>

      {/* Pinned Apps Row (Zone 2) */}
      <PinnedAppsRow tabs={tabs} pinnedApps={pinnedApps} onContextMenu={setContextMenu} />

      <main className="flex-1 flex flex-col" aria-label="Tab management">
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
            onItemRename={(folderId, itemId, newTitle) => {
              setFolders(prev => prev.map(f =>
                f.id === folderId
                  ? { ...f, items: f.items.map(i => i.id === itemId ? { ...i, title: newTitle } : i) }
                  : f
              ));
              renameItemInFolder(folderId, itemId, newTitle);
            }}
            onOpenAllTabs={handleOpenAllTabs}
            onCloseAllTabs={handleCloseAllTabs}
          />

          {/* Tab list */}
          <section className="flex-1 px-1 border-t border-gray-200/80 dark:border-arc-border" aria-label="Open tabs">
            <div className="flex items-center justify-between px-2 py-1">
              <p
                className="text-[11px] text-gray-400 dark:text-arc-text-secondary uppercase tracking-wider font-medium"
                aria-live="polite"
              >
                {filteredTabs.length} tab{filteredTabs.length !== 1 ? "s" : ""}{" "}
                open
              </p>
              {filteredTabs.length > 1 && (
                <button
                  onClick={() => {
                    const nonActive = filteredTabs.filter((t) => !t.active);
                    if (nonActive.length === 0) return;
                    const confirmed = window.confirm(
                      `Close ${nonActive.length} tab${nonActive.length !== 1 ? "s" : ""}? The active tab will remain open.`
                    );
                    if (!confirmed) return;
                    chrome.runtime.sendMessage({
                      type: "CLOSE_TABS",
                      tabIds: nonActive.map((t) => t.id),
                    });
                  }}
                  className="text-[11px] text-gray-400 dark:text-arc-text-secondary hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-150"
                  title="Close all non-active tabs"
                >
                  Close All
                </button>
              )}
            </div>
            {filteredTabs.length >= VIRTUAL_LIST_THRESHOLD ? (
              <List<VirtualTabRowProps>
                style={{
                  height: Math.min(filteredTabs.length * TAB_ITEM_HEIGHT, 400),
                }}
                rowComponent={VirtualTabRow}
                rowCount={filteredTabs.length}
                rowHeight={TAB_ITEM_HEIGHT}
                rowProps={{
                  tabs: filteredTabs,
                  onContextMenu: handleTabContextMenu,
                  tabNameOverrides,
                  onTabRename: handleTabRename,
                }}
                overscanCount={5}
              />
            ) : (
              <ul
                className="flex flex-col gap-1"
                role="listbox"
                aria-label="Open tabs"
              >
                {filteredTabs.map((tab) => (
                  <DraggableTabItem
                    key={tab.id}
                    tab={tab}
                    onContextMenu={handleTabContextMenu}
                    onMouseEnter={handleTabHoverStart}
                    onMouseLeave={handleTabHoverEnd}
                    displayName={tabNameOverrides[tab.id]}
                    onTabRename={handleTabRename}
                  />
                ))}
              </ul>
            )}
          </section>

          <DragOverlay>
            {activeDragTab ? <TabDragOverlay tab={activeDragTab} /> : null}
          </DragOverlay>
        </DndContext>

        {/* Archive Section (Zone 4) */}
        <ArchiveSection />
      </main>

      {/* Quick Notes */}
      {activeWorkspace && (
        <QuickNotes
          workspaceId={activeWorkspaceId}
          workspaceName={activeWorkspace.name}
          notes={activeWorkspace.notes ?? ""}
          notesCollapsed={activeWorkspace.notesCollapsed ?? true}
          notesLastEditedAt={activeWorkspace.notesLastEditedAt ?? 0}
          onNotesChange={handleNotesChange}
          onCollapseToggle={handleNotesCollapseToggle}
        />
      )}

      {/* Footer (Zone 5) */}
      <footer className="border-t border-gray-200/80 dark:border-arc-border">
        <WorkspaceSwitcher
          activeWorkspaceId={activeWorkspaceId}
          onWorkspaceChange={handleWorkspaceChange}
          onContextMenu={setContextMenu}
          onSaveSession={handleSaveSession}
        />
        {suspendedCount > 0 && (
          <div className="px-3 py-1 text-[11px] text-gray-400 dark:text-arc-text-secondary text-center">
            {suspendedCount} tab{suspendedCount !== 1 ? "s" : ""} suspended | ~
            {estimatedMBSaved} MB saved
          </div>
        )}
        <div className="flex items-center justify-end px-3 pb-2">
          <div className="flex items-center gap-1">
            <button
              onClick={toggleFocusMode}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-full transition-colors duration-150 hover:bg-gray-100 dark:hover:bg-arc-surface-hover ${
                focusModeEnabled
                  ? "text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10"
                  : "text-gray-500 dark:text-arc-text-secondary"
              }`}
              aria-label={`Focus mode: ${focusModeEnabled ? "On" : "Off"}`}
              title={`Focus mode: ${focusModeEnabled ? "On" : "Off"}`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                <path
                  fillRule="evenodd"
                  d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
                  clipRule="evenodd"
                />
              </svg>
              {focusModeEnabled ? "Focus" : ""}
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-gray-100 dark:hover:bg-arc-surface-hover text-gray-500 dark:text-arc-text-secondary transition-colors duration-150"
              aria-label="Open settings"
              title="Settings"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path
                  fillRule="evenodd"
                  d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.114a7.05 7.05 0 0 1 0-2.227L1.821 7.773a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.992 6.992 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>
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

      {/* Settings Panel */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* Command Palette */}
      {showCommandPalette && (
        <CommandPalette
          commands={commands}
          onClose={() => setShowCommandPalette(false)}
        />
      )}

      {/* Organize Tabs Modal */}
      {showOrganizeTabs && (
        <OrganizeTabsModal
          tabs={filteredTabs}
          folders={folders}
          onClose={() => setShowOrganizeTabs(false)}
        />
      )}

      {/* Session Manager */}
      {showSessionManager && (
        <SessionManager
          onClose={() => setShowSessionManager(false)}
          onRestore={handleRestoreSession}
        />
      )}

      {/* Onboarding */}
      {showOnboarding && (
        <Onboarding onComplete={() => setShowOnboarding(false)} />
      )}

      {/* Tab Preview Card */}
      {tabPreview && (
        <TabPreviewCard
          tab={tabPreview.tab}
          position={tabPreview.position}
          onClose={handleTabHoverEnd}
        />
      )}
    </div>
  );
}
