import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
  type RefObject,
} from "react";
import { useSwipeGesture } from "./useSwipeGesture";
import type {
  TabInfo,
  PinnedApp,
  Workspace,
  ServiceWorkerMessage,
  Folder,
  FolderItem,
  Session,
  WorkspaceSuggestion,
} from "../shared/types";
import { useTheme, applyPanelColor } from "./useTheme";
import {
  addPinnedApp,
  removePinnedApp,
  reorderPinnedApps,
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
  assignTabToWorkspace,
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
import RecentlyClosedSection from "./RecentlyClosedSection";
import PomodoroTimer from "./PomodoroTimer";
import MorningBriefing from "./MorningBriefing";
import QuickNotes from "./QuickNotes";
import SnippetsSection from "./SnippetsSection";
import ToolsPanel from "./ToolsPanel";
import AutopilotBanner from "./AutopilotBanner";
import TabPreviewCard from "./TabPreviewCard";
import type { TabPreviewInfo } from "./TabPreviewCard";
import { buildCommands } from "./commandRegistry";
import ContextMenu, { type ContextMenuItem } from "./ContextMenu";
import Popover from "./Popover";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  arrayMove,
  sortableKeyboardCoordinates,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  tabEnergyScores: Record<string, number>;
}

function VirtualTabRow({
  index,
  style,
  tabs,
  onContextMenu,
  tabNameOverrides,
  onTabRename,
  tabEnergyScores,
}: {
  index: number;
  style: CSSProperties;
  ariaAttributes: Record<string, unknown>;
  tabs: TabInfo[];
  onContextMenu: (e: React.MouseEvent, tab: TabInfo) => void;
  tabNameOverrides: Record<number, string>;
  onTabRename: (tabId: number, newName: string) => void;
  tabEnergyScores: Record<string, number>;
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
      energyScore={tabEnergyScores[String(tab.id)]}
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
  energyScore,
}: {
  tab: TabInfo;
  onContextMenu: (e: React.MouseEvent, tab: TabInfo) => void;
  style?: React.CSSProperties;
  onMouseEnter?: (e: React.MouseEvent, tab: TabInfo) => void;
  onMouseLeave?: () => void;
  displayName?: string;
  onTabRename?: (tabId: number, newName: string) => void;
  energyScore?: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `tab:${tab.id}` });

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const inputRef = useRef<HTMLInputElement>(
    null
  ) as RefObject<HTMLInputElement>;
  const committedRef = useRef(false);

  const hasCustomName = !!displayName;
  const shownName = displayName || tab.title || tab.url;
  const originalTitle = tab.title || tab.url;

  const style = {
    ...outerStyle,
    transform: CSS.Transform.toString(transform),
    transition: transition || "transform 200ms ease",
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
      {...listeners}
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
      className={`group flex items-center gap-2 px-3 h-8 text-sm rounded-lg cursor-default transition-all duration-200 hover:bg-gray-100 dark:hover:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-arc-accent/50 focus:ring-inset ${
        tab.active
          ? "font-medium dark:text-arc-text-primary dark:bg-white/[0.08]"
          : ""
      } ${tab.discarded ? "opacity-40 italic" : ""}`}
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
      {/* Active dot indicator */}
      {tab.active ? (
        <span className="w-1 h-1 rounded-full bg-arc-accent shrink-0" />
      ) : (
        <span className="w-1 h-1 shrink-0" />
      )}
      {/* Energy score dot */}
      {energyScore != null && (
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            energyScore >= 70
              ? "bg-green-400"
              : energyScore >= 40
                ? "bg-yellow-400"
                : "bg-red-400"
          }`}
          title={`Energy: ${energyScore} — ${
            energyScore >= 70
              ? "Active, frequently visited"
              : energyScore >= 40
                ? "Moderate activity"
                : "Inactive, consider closing"
          }`}
        />
      )}
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
        className="shrink-0 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
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

function DragOverlayCard({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 px-2 h-8 text-sm rounded-lg bg-white dark:bg-arc-surface shadow-lg border border-gray-200 dark:border-arc-border opacity-90 max-w-[200px]">
      {icon}
      <span className="truncate flex-1 select-none text-gray-700 dark:text-arc-text-primary">
        {title}
      </span>
    </div>
  );
}

function TabDragOverlay({ tab }: { tab: TabInfo }) {
  return (
    <DragOverlayCard
      icon={
        tab.favIconUrl ? (
          <img
            src={tab.favIconUrl}
            alt=""
            className="w-4 h-4 shrink-0"
            draggable={false}
          />
        ) : (
          <span className="w-4 h-4 shrink-0 rounded bg-gray-200 dark:bg-arc-surface-hover" />
        )
      }
      title={tab.title || tab.url}
    />
  );
}

function FolderDragOverlay({ folder }: { folder: Folder }) {
  return (
    <DragOverlayCard
      icon={
        <span className="text-sm shrink-0" aria-hidden="true">
          {folder.name.match(/^\p{Emoji}/u)?.[0] || "\uD83D\uDCC1"}
        </span>
      }
      title={folder.name}
    />
  );
}

function FolderItemDragOverlay({ item }: { item: FolderItem }) {
  return (
    <DragOverlayCard
      icon={
        item.favicon ? (
          <img
            src={item.favicon}
            alt=""
            className="w-4 h-4 shrink-0"
            draggable={false}
          />
        ) : (
          <span className="w-4 h-4 shrink-0 rounded bg-gray-200 dark:bg-arc-surface-hover" />
        )
      }
      title={item.title || item.url}
    />
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
  const renderFolderOption = (
    folder: Folder,
    depth: number
  ): React.ReactNode => {
    const children = folders.filter((f) => f.parentId === folder.id);
    return (
      <div key={folder.id}>
        <button
          onClick={() => onSelect(folder.id)}
          className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-arc-text-primary hover:bg-gray-100 dark:hover:bg-arc-surface-hover flex items-center gap-2 transition-colors duration-200"
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

  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreating]);

  const handleCreateFolder = async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    const folder = await createFolder(trimmed, null);
    onSelect(folder.id);
  };

  return (
    <Popover x={x} y={y} onClose={onClose} className="max-w-[240px]">
      <div className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400 font-medium">
        Save to folder
      </div>
      <div className="max-h-[160px] overflow-y-auto">
        {topLevelFolders.map((folder) => renderFolderOption(folder, 0))}
      </div>
      <div className="border-t border-gray-200 dark:border-white/10 mt-1 pt-1">
        {!isCreating ? (
          <button
            onClick={() => setIsCreating(true)}
            className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-arc-text-primary hover:bg-gray-100 dark:hover:bg-arc-surface-hover flex items-center gap-2 transition-colors duration-200"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4 shrink-0 text-gray-500 dark:text-gray-400"
            >
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            <span className="truncate">New Folder</span>
          </button>
        ) : (
          <div className="px-3 py-1.5 flex items-center gap-1">
            <input
              ref={inputRef}
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.stopPropagation();
                  handleCreateFolder();
                } else if (e.key === "Escape") {
                  e.stopPropagation();
                  setIsCreating(false);
                  setNewFolderName("");
                }
              }}
              placeholder="Folder name"
              className="flex-1 min-w-0 text-sm bg-transparent border border-gray-300 dark:border-white/20 rounded px-2 py-1 outline-none focus:border-arc-accent dark:text-white"
            />
            <button
              onClick={handleCreateFolder}
              className="p-1 text-green-500 hover:text-green-400 transition-colors"
              title="Create"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <button
              onClick={() => {
                setIsCreating(false);
                setNewFolderName("");
              }}
              className="p-1 text-gray-400 hover:text-gray-300 transition-colors"
              title="Cancel"
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
        )}
      </div>
    </Popover>
  );
}

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

// Custom collision detection: prefer droppable folder targets, then zone targets, then fall back to closest center
const customCollisionDetection: CollisionDetection = (args) => {
  // First check for pointer-within collisions (good for drop targets like folders)
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    // Prefer folder drop targets
    const folderDrops = pointerCollisions.filter((c) =>
      String(c.id).startsWith("folder-drop:")
    );
    if (folderDrops.length > 0) return folderDrops;
    // Then check for pinned-drop-zone and tablist-drop-zone
    const zoneDrops = pointerCollisions.filter((c) => {
      const id = String(c.id);
      return id === "pinned-drop-zone" || id === "tablist-drop-zone";
    });
    if (zoneDrops.length > 0) return zoneDrops;
    return pointerCollisions;
  }
  // Fall back to rect intersection for sortable items
  return rectIntersection(args);
};

// Droppable zone wrapper for pinned apps area
function DroppablePinnedZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "pinned-drop-zone" });
  return (
    <div
      ref={setNodeRef}
      className={`transition-all duration-200 ${
        isOver ? "ring-1 ring-arc-accent/30 rounded-xl" : ""
      }`}
    >
      {children}
    </div>
  );
}

// Droppable zone wrapper for tab list area
function DroppableTabListZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "tablist-drop-zone" });
  return (
    <div
      ref={setNodeRef}
      className={`transition-all duration-200 ${
        isOver ? "ring-1 ring-arc-accent/30 rounded-xl" : ""
      }`}
    >
      {children}
    </div>
  );
}

export default function App() {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [pinnedApps, setPinnedApps] = useState<PinnedApp[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [activeDragTab, setActiveDragTab] = useState<TabInfo | null>(null);
  const [activeDragFolder, setActiveDragFolder] = useState<Folder | null>(null);
  const [activeDragFolderItem, setActiveDragFolderItem] =
    useState<FolderItem | null>(null);
  const [activeDragPinned, setActiveDragPinned] = useState<PinnedApp | null>(
    null
  );
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
  const [showSettings, setShowSettings] = useState(false);
  const [showToolsPanel, setShowToolsPanel] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showOrganizeTabs, setShowOrganizeTabs] = useState(false);
  const [showSessionManager, setShowSessionManager] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [tabNameOverrides, setTabNameOverrides] = useState<
    Record<number, string>
  >({});
  const [tabOrderOverrides, setTabOrderOverrides] = useState<number[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [isDraggingTabs, setIsDraggingTabs] = useState(false);
  const [autoRouteIndicator, setAutoRouteIndicator] = useState<{
    workspaceId: string;
    workspaceName: string;
    workspaceEmoji: string;
  } | null>(null);
  const [dupNotification, setDupNotification] = useState<{
    newTabId: number;
    existingTabId: number;
    existingWorkspaceId: string;
    existingWorkspaceName: string;
  } | null>(null);
  const [tabPreview, setTabPreview] = useState<{
    tab: TabPreviewInfo;
    position: { top: number; left: number };
  } | null>(null);
  const tabPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mainContentRef = useRef<HTMLElement>(null);
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  const [swipeBounce, setSwipeBounce] = useState<"left" | "right" | null>(null);
  const [workspaceSuggestion, setWorkspaceSuggestion] =
    useState<WorkspaceSuggestion | null>(null);
  const [deepWorkActive, setDeepWorkActive] = useState(false);
  const [tabEnergyScores, setTabEnergyScores] = useState<
    Record<string, number>
  >({});

  // Sorted workspaces for swipe navigation
  const sortedWorkspaces = useMemo(
    () => [...workspaces].sort((a, b) => a.sortOrder - b.sortOrder),
    [workspaces]
  );

  const handleSwipeLeft = useCallback(() => {
    const idx = sortedWorkspaces.findIndex((w) => w.id === activeWorkspaceId);
    if (idx === -1) return;
    if (idx < sortedWorkspaces.length - 1) {
      const nextWs = sortedWorkspaces[idx + 1];
      setActiveWorkspaceStorage(nextWs.id);
      setActiveWorkspaceId(nextWs.id);
    } else {
      // At last workspace — rubber-band bounce
      setSwipeBounce("left");
      setTimeout(() => setSwipeBounce(null), 300);
    }
  }, [sortedWorkspaces, activeWorkspaceId]);

  const handleSwipeRight = useCallback(() => {
    const idx = sortedWorkspaces.findIndex((w) => w.id === activeWorkspaceId);
    if (idx === -1) return;
    if (idx > 0) {
      const prevWs = sortedWorkspaces[idx - 1];
      setActiveWorkspaceStorage(prevWs.id);
      setActiveWorkspaceId(prevWs.id);
    } else {
      // At first workspace — rubber-band bounce
      setSwipeBounce("right");
      setTimeout(() => setSwipeBounce(null), 300);
    }
  }, [sortedWorkspaces, activeWorkspaceId]);

  useSwipeGesture(mainContentRef, {
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
    disabled: sortedWorkspaces.length <= 1,
  });

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

  // Load pending workspace suggestion (check dismissal within 24h)
  const loadWorkspaceSuggestion = useCallback(() => {
    chrome.storage.local.get(
      ["pendingWorkspaceSuggestion", "suggestionDismissedAt"],
      (result) => {
        const dismissedAt = result.suggestionDismissedAt as number | undefined;
        if (dismissedAt && Date.now() - dismissedAt < 24 * 60 * 60 * 1000) {
          return; // Dismissed within 24 hours
        }
        const suggestion = result.pendingWorkspaceSuggestion as
          | WorkspaceSuggestion
          | undefined;
        if (suggestion && suggestion.suggest) {
          setWorkspaceSuggestion(suggestion);
        }
      }
    );
  }, []);

  // Load Deep Work state from storage on mount
  useEffect(() => {
    chrome.storage.local.get("deepWorkActive", (result) => {
      if (result.deepWorkActive) {
        setDeepWorkActive(true);
      }
    });
  }, []);

  // Load tab energy scores from storage on mount
  useEffect(() => {
    chrome.storage.local.get("tabEnergyScores", (result) => {
      if (result.tabEnergyScores) {
        setTabEnergyScores(result.tabEnergyScores as Record<string, number>);
      }
    });
  }, []);

  // Check if onboarding is needed on mount
  useEffect(() => {
    isOnboardingCompleted().then((completed) => {
      if (!completed) {
        setTimeout(() => setShowOnboarding(true), 0);
      }
    });
  }, []);

  // Keep activeWorkspaceId ref in sync for use in message listener
  useEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspaceId;
  }, [activeWorkspaceId]);

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Auto-dismiss auto-route indicator after 3 seconds
  useEffect(() => {
    if (autoRouteIndicator) {
      const timer = setTimeout(() => setAutoRouteIndicator(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [autoRouteIndicator]);

  // Auto-dismiss duplicate tab notification after 8 seconds
  useEffect(() => {
    if (dupNotification) {
      const timer = setTimeout(() => setDupNotification(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [dupNotification]);

  // Listen for Ctrl+Shift+K to open command palette, Ctrl+Shift+D for Deep Work
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
        if (changes.deepWorkActive) {
          setDeepWorkActive(!!changes.deepWorkActive.newValue);
        }
        if (changes.tabEnergyScores) {
          setTabEnergyScores(
            (changes.tabEnergyScores.newValue as Record<string, number>) ?? {}
          );
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
      setTimeout(() => {
        setPinnedApps(
          [...(ws.pinnedApps ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
        );
        setFolders(
          [...(ws.folders ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
        );
      }, 0);
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

  // Load tabOrderOverrides for the active workspace
  useEffect(() => {
    const key = `tabOrderOverrides_${activeWorkspaceId}`;
    chrome.storage.local.get(key, (result) => {
      setTabOrderOverrides((result[key] as number[]) ?? []);
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
      } else if (message.type === "tab-auto-routed") {
        // Show indicator only if user is viewing the target workspace
        if (message.workspaceId === activeWorkspaceIdRef.current) {
          getWorkspaces().then((wsList) => {
            const ws = wsList.find((w) => w.id === message.workspaceId);
            if (ws) {
              setAutoRouteIndicator({
                workspaceId: ws.id,
                workspaceName: ws.name,
                workspaceEmoji: ws.emoji,
              });
            }
          });
        }
      } else if (message.type === "workspace-suggestion-ready") {
        loadWorkspaceSuggestion();
      } else if (message.type === "duplicate-tab-detected") {
        setDupNotification({
          newTabId: message.newTabId,
          existingTabId: message.existingTabId,
          existingWorkspaceId: message.existingWorkspaceId,
          existingWorkspaceName: message.existingWorkspaceName,
        });
      } else if (message.type === "notes-saved-from-page") {
        setToast(`Saved to ${message.workspaceName} notes`);
        // Reload workspaces to reflect updated notes
        getWorkspaces().then(setWorkspaces);
      } else if (message.type === "snippet-saved") {
        setToast(`Snippet saved to ${message.workspaceName}`);
      }
    };

    // Load any pending workspace suggestion on mount
    loadWorkspaceSuggestion();

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [loadWorkspaceSuggestion]);

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

    const filtered = tabs.filter((tab) => {
      const wsId = tabWorkspaceMap[String(tab.id)];
      // Show tabs assigned to the active workspace.
      // Unmapped tabs default to "default" workspace (not shown everywhere).
      const effectiveWsId = wsId || "default";
      return (
        effectiveWsId === activeWorkspaceId && !tabIdsInFolders.has(tab.id)
      );
    });

    // Apply custom tab order if available
    if (tabOrderOverrides.length > 0) {
      const orderMap = new Map(tabOrderOverrides.map((id, idx) => [id, idx]));
      const ordered: TabInfo[] = [];
      const unordered: TabInfo[] = [];
      for (const tab of filtered) {
        if (orderMap.has(tab.id)) {
          ordered.push(tab);
        } else {
          unordered.push(tab);
        }
      }
      ordered.sort(
        (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0)
      );
      return [...ordered, ...unordered];
    }

    return filtered;
  }, [tabs, tabWorkspaceMap, activeWorkspaceId, folders, tabOrderOverrides]);

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

  // Restore yesterday's tabs from daily snapshot
  const restoreYesterdayTabs = useCallback(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    chrome.storage.local.get("dailySnapshots", (result) => {
      const snapshots =
        (result.dailySnapshots as Record<
          string,
          {
            tabs: Record<
              string,
              { url: string; title: string; favicon: string }[]
            >;
            createdAt: number;
          }
        >) ?? {};
      const snap = snapshots[yKey];
      if (!snap) {
        setToast("No snapshot from yesterday");
        return;
      }
      const allTabs: { url: string; title: string; favicon: string }[] = [];
      for (const tabs of Object.values(snap.tabs)) {
        allTabs.push(...tabs);
      }
      if (allTabs.length === 0) {
        setToast("Yesterday's snapshot has no tabs");
        return;
      }
      // Open all tabs from yesterday's snapshot (add mode)
      for (const tab of allTabs) {
        chrome.runtime.sendMessage({ type: "OPEN_URL", url: tab.url });
      }
      setToast(`Restored ${allTabs.length} tabs from yesterday`);
    });
  }, []);

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

  // Toggle Deep Work Mode
  const toggleDeepWork = useCallback(async () => {
    const newActive = !deepWorkActive;
    setDeepWorkActive(newActive);
    await chrome.storage.local.set({ deepWorkActive: newActive });

    if (newActive) {
      // Enable focus mode in settings
      const s = await getSettings();
      await updateSettings({
        focusMode: { ...s.focusMode, enabled: true },
      });
      chrome.runtime.sendMessage({
        type: "UPDATE_FOCUS_MODE",
        enabled: true,
        redirectRules: s.focusMode.redirectRules,
      });
      // Suspend all non-active tabs
      for (const tab of filteredTabs) {
        if (!tab.active && !tab.discarded) {
          chrome.runtime.sendMessage({ type: "SUSPEND_TAB", tabId: tab.id });
        }
      }
      // Expand Quick Notes
      if (activeWorkspace?.notesCollapsed) {
        updateWorkspace(activeWorkspaceId, { notesCollapsed: false });
      }
    } else {
      // Disable focus mode in settings (don't unsuspend tabs)
      const s = await getSettings();
      await updateSettings({
        focusMode: { ...s.focusMode, enabled: false },
      });
      chrome.runtime.sendMessage({
        type: "UPDATE_FOCUS_MODE",
        enabled: false,
        redirectRules: s.focusMode.redirectRules,
      });
    }
  }, [deepWorkActive, filteredTabs, activeWorkspace, activeWorkspaceId]);

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

  // Workspace suggestion handlers
  const handleAcceptSuggestion = useCallback(async () => {
    if (!workspaceSuggestion) return;
    try {
      const ws = await createWorkspace(workspaceSuggestion.name);
      // Update emoji and accent color
      await updateWorkspace(ws.id, { emoji: workspaceSuggestion.emoji });
      // Move suggested tabs to the new workspace
      for (const tabId of workspaceSuggestion.tabIds) {
        await assignTabToWorkspace(tabId, ws.id);
      }
      // Switch to the new workspace
      await setActiveWorkspaceStorage(ws.id);
      setActiveWorkspaceId(ws.id);
      // Clear suggestion
      setWorkspaceSuggestion(null);
      await chrome.storage.local.remove("pendingWorkspaceSuggestion");
      setToast(
        `Created ${workspaceSuggestion.emoji} ${workspaceSuggestion.name} workspace`
      );
    } catch (err) {
      console.error("Failed to create workspace from suggestion:", err);
      setToast("Failed to create workspace");
    }
  }, [workspaceSuggestion]);

  // Duplicate tab notification handlers
  const handleDupSwitch = useCallback(async () => {
    if (!dupNotification) return;
    // Close the duplicate (new) tab
    chrome.runtime.sendMessage({
      type: "CLOSE_TAB",
      tabId: dupNotification.newTabId,
    });
    // Activate the existing tab
    chrome.runtime.sendMessage({
      type: "SWITCH_TAB",
      tabId: dupNotification.existingTabId,
    });
    // Switch workspace if needed
    if (dupNotification.existingWorkspaceId !== activeWorkspaceIdRef.current) {
      await setActiveWorkspaceStorage(dupNotification.existingWorkspaceId);
      setActiveWorkspaceId(dupNotification.existingWorkspaceId);
    }
    setDupNotification(null);
  }, [dupNotification]);

  const handleDismissSuggestion = useCallback(async () => {
    setWorkspaceSuggestion(null);
    await chrome.storage.local.set({ suggestionDismissedAt: Date.now() });
    await chrome.storage.local.remove("pendingWorkspaceSuggestion");
  }, []);

  const exportCurrentWorkspace = useCallback(() => {
    const ws = workspaces.find((w) => w.id === activeWorkspaceId);
    if (!ws) return;
    const exportData = {
      version: "2.0",
      type: "arcflow-workspace",
      name: ws.name,
      emoji: ws.emoji,
      accentColor: ws.accentColor,
      pinnedApps: ws.pinnedApps,
      folders: ws.folders,
      notes: ws.notes,
    };
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);
    const safeName = ws.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const a = document.createElement("a");
    a.href = url;
    a.download = `arcflow-workspace-${safeName}-${today}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [workspaces, activeWorkspaceId]);

  const importWorkspace = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (
          data.version !== "2.0" ||
          data.type !== "arcflow-workspace" ||
          !data.name
        ) {
          setToast("Invalid workspace file");
          return;
        }
        const allWs = await getWorkspaces();
        let name = data.name;
        if (allWs.some((ws) => ws.name === name)) {
          name = `${name} (imported)`;
        }
        const ws = await createWorkspace(name);
        const pinnedApps = Array.isArray(data.pinnedApps)
          ? data.pinnedApps.map(
              (
                app: { url?: string; title?: string; favicon?: string },
                i: number
              ) => ({
                id: crypto.randomUUID(),
                url: app.url || "",
                title: app.title || "",
                favicon: app.favicon || "",
                sortOrder: i,
              })
            )
          : [];
        const folderIdMap = new Map<string, string>();
        const importedFolders = Array.isArray(data.folders) ? data.folders : [];
        for (const folder of importedFolders) {
          if (folder.id) folderIdMap.set(folder.id, crypto.randomUUID());
        }
        const folders = importedFolders.map(
          (
            folder: {
              id?: string;
              name?: string;
              parentId?: string | null;
              items?: Array<{
                url?: string;
                title?: string;
                favicon?: string;
                type?: string;
                isArchived?: boolean;
                lastActiveAt?: number;
              }>;
              isCollapsed?: boolean;
              sortOrder?: number;
            },
            i: number
          ) => ({
            id: folderIdMap.get(folder.id || "") || crypto.randomUUID(),
            name: folder.name || "Untitled",
            parentId: folder.parentId
              ? (folderIdMap.get(folder.parentId) ?? null)
              : null,
            items: Array.isArray(folder.items)
              ? folder.items.map((item) => ({
                  id: crypto.randomUUID(),
                  type: item.type || "link",
                  tabId: null,
                  url: item.url || "",
                  title: item.title || "",
                  favicon: item.favicon || "",
                  isArchived: item.isArchived || false,
                  lastActiveAt: item.lastActiveAt || 0,
                }))
              : [],
            isCollapsed: folder.isCollapsed ?? false,
            sortOrder: folder.sortOrder ?? i,
          })
        );
        await updateWorkspace(ws.id, {
          emoji: data.emoji || ws.emoji,
          accentColor: data.accentColor || ws.accentColor,
          pinnedApps,
          folders,
          notes: typeof data.notes === "string" ? data.notes : "",
        });
        setActiveWorkspaceId(ws.id);
        setActiveWorkspaceStorage(ws.id);
        const pinnedCount = pinnedApps.length;
        const folderCount = folders.length;
        setToast(
          `Workspace ${data.emoji || ""} ${name} imported with ${pinnedCount} pinned app${pinnedCount !== 1 ? "s" : ""} and ${folderCount} folder${folderCount !== 1 ? "s" : ""}`
        );
      } catch {
        setToast("Invalid workspace file");
      }
    };
    input.click();
  }, []);

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
        onToggleDeepWork: toggleDeepWork,
        onRestoreYesterdayTabs: restoreYesterdayTabs,
        onExportWorkspace: exportCurrentWorkspace,
        onImportWorkspace: importWorkspace,
        onTimeMachine: () => {
          const el = document.querySelector('[aria-label="Time Machine"]');
          el?.scrollIntoView({ behavior: "smooth" });
        },
        onAnnotations: () => {
          const el = document.querySelector('[aria-label="Annotations"]');
          el?.scrollIntoView({ behavior: "smooth" });
        },
        onTabGraph: () => {
          const el = document.querySelector('[aria-label="Tab Graph"]');
          el?.scrollIntoView({ behavior: "smooth" });
        },
        onResearchCopilot: () => {
          const el = document.querySelector('[aria-label="Research Copilot"]');
          el?.scrollIntoView({ behavior: "smooth" });
        },
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
      toggleDeepWork,
      restoreYesterdayTabs,
      exportCurrentWorkspace,
      importWorkspace,
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

      // Add "Always open [domain] in this workspace" for auto-routing
      try {
        const domain = new URL(tab.url).hostname;
        if (
          domain &&
          !domain.startsWith("chrome") &&
          !domain.startsWith("extension")
        ) {
          items.push({
            label: `Always open ${domain} here`,
            onClick: async () => {
              const s = await getSettings();
              const pattern = `*://${domain}/*`;
              const existing = s.routingRules.find(
                (r) => r.pattern === pattern || r.pattern === `${domain}/*`
              );
              if (existing) {
                setToast(`Rule already exists for ${domain}`);
                return;
              }
              const activeWs = workspaces.find(
                (ws) => ws.id === activeWorkspaceId
              );
              const newRule = {
                pattern,
                workspaceId: activeWorkspaceId,
                enabled: true,
              };
              await updateSettings({
                routingRules: [...s.routingRules, newRule],
              });
              setToast(
                `Tabs from ${domain} will auto-route to ${activeWs?.emoji ?? ""} ${activeWs?.name ?? "this workspace"}`
              );
            },
          });
        }
      } catch {
        // Invalid URL — skip menu item
      }

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

  const handleFolderItemClick = useCallback(
    (item: FolderItem) => {
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
    },
    [tabs]
  );

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
              chrome.runtime.sendMessage({
                type: "SWITCH_TAB",
                tabId: item.tabId,
              });
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
        if (tab) {
          setActiveDragTab(tab);
          setIsDraggingTabs(true);
        }
      } else if (id.startsWith("folder:")) {
        const folderId = id.replace("folder:", "");
        const folder = folders.find((f) => f.id === folderId);
        if (folder) {
          setActiveDragFolder(folder);
        }
      } else if (id.startsWith("folder-item:")) {
        const itemId = id.replace("folder-item:", "");
        for (const folder of folders) {
          const item = folder.items.find((i) => i.id === itemId);
          if (item) {
            setActiveDragFolderItem(item);
            break;
          }
        }
      } else if (id.startsWith("pinned:")) {
        const pinnedId = id.replace("pinned:", "");
        const app = pinnedApps.find((a) => a.id === pinnedId);
        if (app) {
          setActiveDragPinned(app);
        }
      }
    },
    [tabs, folders, pinnedApps]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveDragTab(null);
      setActiveDragFolder(null);
      setActiveDragFolderItem(null);
      setActiveDragPinned(null);
      setIsDraggingTabs(false);
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

        // Duplicate check: skip if same URL already exists in target folder
        const targetFolder = folders.find((f) => f.id === folderId);
        if (targetFolder?.items.some((i) => i.url === tab.url)) {
          setToast("Already saved in this folder");
          return;
        }

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
        return;
      }

      // Case 1b: Tab dropped onto pinned apps zone
      if (activeId.startsWith("tab:") && overId === "pinned-drop-zone") {
        const tabId = parseInt(activeId.replace("tab:", ""), 10);
        const tab = tabs.find((t) => t.id === tabId);
        if (!tab) return;

        // Duplicate check: skip if URL already pinned
        if (pinnedApps.some((app) => app.url === tab.url)) {
          setToast("Already pinned");
          return;
        }

        await addPinnedApp({
          id: crypto.randomUUID(),
          url: tab.url,
          title: tab.title || tab.url,
          favicon: tab.favIconUrl || "",
        });
        return;
      }

      // Case 1c: Pinned app dropped onto a folder
      if (activeId.startsWith("pinned:") && overId.startsWith("folder-drop:")) {
        const pinnedId = activeId.replace("pinned:", "");
        const folderId = overId.replace("folder-drop:", "");
        const app = pinnedApps.find((a) => a.id === pinnedId);
        if (!app) return;

        // Duplicate check: skip if same URL already exists in target folder
        const targetFolder = folders.find((f) => f.id === folderId);
        if (targetFolder?.items.some((i) => i.url === app.url)) {
          setToast("Already saved in this folder");
          return;
        }

        const newItem: FolderItem = {
          id: crypto.randomUUID(),
          type: "link",
          tabId: null,
          url: app.url,
          title: app.title,
          favicon: app.favicon || "",
          isArchived: false,
          lastActiveAt: Date.now(),
        };

        await addItemToFolder(folderId, newItem);
        return;
      }

      // Case 1d: Folder item dropped onto pinned apps zone
      if (
        activeId.startsWith("folder-item:") &&
        overId === "pinned-drop-zone"
      ) {
        const itemId = activeId.replace("folder-item:", "");
        let folderItem: FolderItem | undefined;
        for (const folder of folders) {
          folderItem = folder.items.find((i) => i.id === itemId);
          if (folderItem) break;
        }
        if (!folderItem || !folderItem.url) return;

        // Duplicate check: skip if URL already pinned
        if (pinnedApps.some((app) => app.url === folderItem!.url)) {
          setToast("Already pinned");
          return;
        }

        await addPinnedApp({
          id: crypto.randomUUID(),
          url: folderItem.url,
          title: folderItem.title || folderItem.url,
          favicon: folderItem.favicon || "",
        });
        return;
      }

      // Case 1e: Folder item dropped onto tab list zone (unpin from folder)
      if (
        activeId.startsWith("folder-item:") &&
        overId === "tablist-drop-zone"
      ) {
        const itemId = activeId.replace("folder-item:", "");
        let folderItem: FolderItem | undefined;
        let sourceFolderId: string | undefined;
        for (const folder of folders) {
          folderItem = folder.items.find((i) => i.id === itemId);
          if (folderItem) {
            sourceFolderId = folder.id;
            break;
          }
        }
        if (!folderItem || !sourceFolderId) return;

        if (folderItem.type === "link" && folderItem.url) {
          // Open the URL in a new tab, then remove from folder
          await chrome.tabs.create({ url: folderItem.url });
        }
        // For type "tab" with valid tabId, tab is already open — just remove from folder
        await removeItemFromFolder(sourceFolderId, itemId);
        return;
      }

      // Case 1f: Reorder pinned apps
      if (activeId.startsWith("pinned:") && overId.startsWith("pinned:")) {
        const activePinnedId = activeId.replace("pinned:", "");
        const overPinnedId = overId.replace("pinned:", "");

        const oldIndex = pinnedApps.findIndex((a) => a.id === activePinnedId);
        const newIndex = pinnedApps.findIndex((a) => a.id === overPinnedId);
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

        const reordered = arrayMove(pinnedApps, oldIndex, newIndex);
        await reorderPinnedApps(reordered.map((a) => a.id));
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

      // Case 4: Reorder tabs within the tab list
      if (activeId.startsWith("tab:") && overId.startsWith("tab:")) {
        const activeTabId = parseInt(activeId.replace("tab:", ""), 10);
        const overTabId = parseInt(overId.replace("tab:", ""), 10);

        const oldIndex = filteredTabs.findIndex((t) => t.id === activeTabId);
        const newIndex = filteredTabs.findIndex((t) => t.id === overTabId);

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const reordered = arrayMove(filteredTabs, oldIndex, newIndex);
          const newOrder = reordered.map((t) => t.id);

          // Optimistic update
          setTabOrderOverrides(newOrder);

          // Persist to storage
          const key = `tabOrderOverrides_${activeWorkspaceId}`;
          chrome.storage.local.set({ [key]: newOrder });
        }
        return;
      }

      // Case 5: Reorder folders among siblings
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
    [
      tabs,
      folders,
      setFolders,
      filteredTabs,
      activeWorkspaceId,
      pinnedApps,
      setToast,
    ]
  );

  const activeDragType = activeDragTab
    ? "tab"
    : activeDragFolder
      ? "folder"
      : activeDragFolderItem
        ? "folder-item"
        : activeDragPinned
          ? "pinned"
          : undefined;

  return (
    <div
      className="flex flex-col h-screen overflow-hidden bg-gray-50 text-gray-900 dark:bg-[rgba(15,15,23,0.78)] dark:text-arc-text-primary backdrop-frosted"
      data-drag-type={activeDragType}
    >
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

      {/* Pomodoro Timer (Deep Work Mode) */}
      {deepWorkActive && <PomodoroTimer />}

      {/* Morning Briefing */}
      <MorningBriefing
        tabs={tabs}
        workspaces={workspaces}
        tabWorkspaceMap={tabWorkspaceMap}
      />

      {/* Search bar + action buttons (compact header) */}
      <nav
        aria-label="Tab search"
        className={`flex items-center gap-1 px-2 pt-2 pb-1${deepWorkActive ? " ring-1 ring-arc-accent/30 rounded-lg mx-1" : ""}`}
      >
        <div className="flex-1 min-w-0">
          <SearchBar
            tabs={tabs}
            folders={folders}
            allTabs={tabs}
            tabWorkspaceMap={tabWorkspaceMap}
            activeWorkspaceId={activeWorkspaceId}
            workspaces={workspaces}
            onSwitchTab={(tabId) => {
              chrome.runtime.sendMessage({ type: "SWITCH_TAB", tabId });
            }}
            onSwitchWorkspaceAndTab={(workspaceId, tabId) => {
              setActiveWorkspaceStorage(workspaceId);
              setActiveWorkspaceId(workspaceId);
              setTimeout(() => {
                chrome.runtime.sendMessage({ type: "SWITCH_TAB", tabId });
              }, 100);
            }}
            onOpenUrl={(url) => {
              chrome.runtime.sendMessage({ type: "OPEN_URL", url });
            }}
          />
        </div>
        <button
          onClick={toggleDeepWork}
          className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-200 ${
            deepWorkActive
              ? "bg-arc-accent/15 text-arc-accent dark:text-arc-accent-hover"
              : "hover:bg-gray-100 dark:hover:bg-arc-surface-hover text-gray-500 dark:text-arc-text-secondary"
          }`}
          title={
            deepWorkActive
              ? "Exit Deep Work Mode (Ctrl+Shift+D)"
              : "Enter Deep Work Mode (Ctrl+Shift+D)"
          }
          aria-label={
            deepWorkActive ? "Exit Deep Work Mode" : "Enter Deep Work Mode"
          }
          aria-pressed={deepWorkActive}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <path d="M12 2a7 7 0 0 0-7 7c0 3.5 2.5 6.5 4 8 .5.5 1 1.5 1 2.5V21h4v-1.5c0-1 .5-2 1-2.5 1.5-1.5 4-4.5 4-8a7 7 0 0 0-7-7Z" />
            <path d="M10 21h4" />
          </svg>
        </button>
        <button
          onClick={() => setShowToolsPanel(true)}
          className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-arc-surface-hover text-gray-500 dark:text-arc-text-secondary transition-colors duration-200"
          title="Tools"
          aria-label="Open Tools panel"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path
              fillRule="evenodd"
              d="M14.5 10a4.5 4.5 0 0 0 4.284-5.882c-.105-.324-.51-.391-.752-.15L15.34 6.66a.454.454 0 0 1-.493.101 3.046 3.046 0 0 1-1.608-1.607.454.454 0 0 1 .1-.493l2.693-2.692c.24-.241.174-.647-.15-.752a4.5 4.5 0 0 0-5.873 4.575c.055.873-.128 1.808-.8 2.368l-7.23 6.024a2.724 2.724 0 1 0 3.837 3.837l6.024-7.23c.56-.672 1.495-.855 2.368-.8.096.007.193.01.29.01ZM5 16a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <button
          onClick={() => setShowOrganizeTabs(true)}
          className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-arc-surface-hover text-gray-500 dark:text-arc-text-secondary transition-colors duration-200"
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
        </button>
      </nav>

      {/* Auto-routing indicator */}
      {autoRouteIndicator && (
        <div className="mx-2 mb-1 flex items-center justify-between gap-2 px-2 py-1.5 text-xs rounded-lg bg-arc-accent/10 dark:bg-arc-accent/15 text-arc-accent dark:text-arc-accent-hover animate-fade-in transition-opacity duration-300">
          <span>
            Tab auto-routed to {autoRouteIndicator.workspaceEmoji}{" "}
            {autoRouteIndicator.workspaceName}
          </span>
          <button
            onClick={() => setAutoRouteIndicator(null)}
            className="shrink-0 w-4 h-4 flex items-center justify-center hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            aria-label="Dismiss auto-route notification"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="w-3 h-3"
            >
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>
      )}

      {/* Duplicate tab notification */}
      {dupNotification && (
        <div className="mx-2 mb-1 flex items-center justify-between gap-2 px-2 py-1.5 text-xs rounded-lg bg-yellow-500/10 dark:bg-yellow-400/10 text-yellow-700 dark:text-yellow-300 animate-fade-in transition-opacity duration-300">
          <span className="truncate">
            Already open in {dupNotification.existingWorkspaceName}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleDupSwitch}
              className="px-2 py-0.5 text-xs font-medium rounded bg-yellow-600/20 dark:bg-yellow-400/20 hover:bg-yellow-600/30 dark:hover:bg-yellow-400/30 transition-colors duration-200"
            >
              Switch
            </button>
            <button
              onClick={() => setDupNotification(null)}
              className="px-2 py-0.5 text-xs font-medium rounded hover:bg-yellow-600/10 dark:hover:bg-yellow-400/10 transition-colors duration-200"
            >
              Keep Both
            </button>
          </div>
        </div>
      )}

      {/* Workspace Suggestion Card */}
      {workspaceSuggestion && (
        <div className="mx-2 mb-2 p-2 rounded-xl border border-arc-accent/20 dark:border-arc-accent/15 bg-white/80 dark:bg-arc-surface/80 shadow-sm animate-fade-in">
          <div className="flex items-start gap-2">
            <span className="text-lg shrink-0">
              {workspaceSuggestion.emoji}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-arc-text-primary">
                Create &ldquo;{workspaceSuggestion.name}&rdquo; workspace?
              </p>
              <p className="text-xs text-gray-500 dark:text-arc-text-secondary mt-0.5">
                {workspaceSuggestion.reason}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={handleAcceptSuggestion}
                  className="px-3 py-1 text-xs font-medium rounded-lg bg-arc-accent text-white hover:bg-arc-accent-hover transition-colors duration-200"
                >
                  Create
                </button>
                <button
                  onClick={handleDismissSuggestion}
                  className="px-3 py-1 text-xs font-medium rounded-lg text-gray-500 dark:text-arc-text-secondary hover:bg-gray-100 dark:hover:bg-arc-surface-hover transition-colors duration-200"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={customCollisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveDragTab(null);
          setActiveDragFolder(null);
          setActiveDragFolderItem(null);
          setActiveDragPinned(null);
          setIsDraggingTabs(false);
        }}
      >
        {/* Pinned Apps Row (Zone 2) */}
        <DroppablePinnedZone>
          <PinnedAppsRow
            tabs={tabs}
            pinnedApps={pinnedApps}
            onContextMenu={setContextMenu}
          />
        </DroppablePinnedZone>

        <main
          ref={mainContentRef}
          className={`flex-1 flex flex-col overflow-y-auto${swipeBounce === "left" ? " swipe-bounce-left" : swipeBounce === "right" ? " swipe-bounce-right" : ""}`}
          aria-label="Tab management"
        >
          {/* Folder Tree (Zone 3) */}
          <FolderTree
            onContextMenu={setContextMenu}
            folders={folders}
            setFolders={setFolders}
            onItemClick={handleFolderItemClick}
            onItemContextMenu={handleFolderItemContextMenu}
            onItemRename={(folderId, itemId, newTitle) => {
              setFolders((prev) =>
                prev.map((f) =>
                  f.id === folderId
                    ? {
                        ...f,
                        items: f.items.map((i) =>
                          i.id === itemId ? { ...i, title: newTitle } : i
                        ),
                      }
                    : f
                )
              );
              renameItemInFolder(folderId, itemId, newTitle);
            }}
            onOpenAllTabs={handleOpenAllTabs}
            onCloseAllTabs={handleCloseAllTabs}
          />

          {/* Tab list */}
          <DroppableTabListZone>
            <section
              className="flex-1 px-1 pt-2"
              aria-label="Open tabs"
              data-drop-section="tabs"
            >
              <div className="flex items-center justify-between px-2 py-1">
                <p
                  className="text-[11px] text-gray-400 dark:text-arc-text-secondary font-medium"
                  aria-live="polite"
                >
                  {filteredTabs.length} tab
                  {filteredTabs.length !== 1 ? "s" : ""} open
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
                    className="text-[11px] text-gray-400 dark:text-arc-text-secondary hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-200"
                    title="Close all non-active tabs"
                  >
                    Close All
                  </button>
                )}
              </div>
              <SortableContext
                items={filteredTabs.map((t) => `tab:${t.id}`)}
                strategy={verticalListSortingStrategy}
              >
                {filteredTabs.length >= VIRTUAL_LIST_THRESHOLD &&
                !isDraggingTabs ? (
                  <List<VirtualTabRowProps>
                    style={{
                      height: Math.min(
                        filteredTabs.length * TAB_ITEM_HEIGHT,
                        400
                      ),
                    }}
                    rowComponent={VirtualTabRow}
                    rowCount={filteredTabs.length}
                    rowHeight={TAB_ITEM_HEIGHT}
                    rowProps={{
                      tabs: filteredTabs,
                      onContextMenu: handleTabContextMenu,
                      tabNameOverrides,
                      onTabRename: handleTabRename,
                      tabEnergyScores,
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
                        energyScore={tabEnergyScores[String(tab.id)]}
                      />
                    ))}
                  </ul>
                )}
              </SortableContext>
            </section>
          </DroppableTabListZone>

          <DragOverlay>
            {activeDragTab ? (
              <TabDragOverlay tab={activeDragTab} />
            ) : activeDragFolder ? (
              <FolderDragOverlay folder={activeDragFolder} />
            ) : activeDragFolderItem ? (
              <FolderItemDragOverlay item={activeDragFolderItem} />
            ) : activeDragPinned ? (
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-arc-surface flex items-center justify-center shadow-lg border border-gray-200 dark:border-arc-border">
                  {activeDragPinned.favicon ? (
                    <img
                      src={activeDragPinned.favicon}
                      alt=""
                      className="w-5 h-5 rounded-full"
                      draggable={false}
                    />
                  ) : (
                    <span className="text-xs font-bold text-gray-500 dark:text-arc-text-secondary">
                      {activeDragPinned.title.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            ) : null}
          </DragOverlay>

          {/* Autopilot Undo Banner */}
          <AutopilotBanner />

          {/* Archive Section (Zone 4) */}
          <ArchiveSection />

          {/* Recently Closed Section */}
          <RecentlyClosedSection workspaces={workspaces} />
        </main>
      </DndContext>

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

      {/* Snippets Section */}
      <SnippetsSection workspaceId={activeWorkspaceId} />

      {/* Footer (Zone 5) */}
      <footer className="border-t border-gray-200/10 dark:border-white/5">
        <WorkspaceSwitcher
          activeWorkspaceId={activeWorkspaceId}
          onWorkspaceChange={handleWorkspaceChange}
          onContextMenu={setContextMenu}
          onSaveSession={handleSaveSession}
          onOpenSettings={openSettings}
          tabEnergyScores={tabEnergyScores}
          tabWorkspaceMap={tabWorkspaceMap}
        />
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

      {/* Tools Panel */}
      {showToolsPanel && (
        <ToolsPanel onClose={() => setShowToolsPanel(false)} />
      )}

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
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
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

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 text-xs font-medium text-white bg-gray-800 dark:bg-arc-surface-active rounded-lg shadow-lg animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
