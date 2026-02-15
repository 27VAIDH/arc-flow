import { useEffect, useState, useRef } from "react";
import type { PinnedApp, TabInfo } from "../shared/types";
import {
  getPinnedApps,
  removePinnedApp,
  updatePinnedApp,
  reorderPinnedApps,
} from "../shared/storage";
import type { ContextMenuItem } from "./ContextMenu";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

interface PinnedAppsRowProps {
  tabs: TabInfo[];
  onContextMenu: (menu: ContextMenuState) => void;
}

function getOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

interface SortablePinnedAppProps {
  app: PinnedApp;
  hasOpenTab: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function SortablePinnedApp({
  app,
  hasOpenTab,
  onClick,
  onContextMenu,
}: SortablePinnedAppProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: app.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="flex flex-col items-center shrink-0 group touch-none"
      title={app.title}
      aria-label={`Open ${app.title}`}
    >
      <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
        {app.favicon ? (
          <img
            src={app.favicon}
            alt=""
            className="w-5 h-5"
            draggable={false}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
            {app.title.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      {/* Active indicator dot */}
      <div
        className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
          hasOpenTab ? "bg-[#2E75B6]" : "bg-transparent"
        }`}
      />
    </button>
  );
}

export default function PinnedAppsRow({
  tabs,
  onContextMenu,
}: PinnedAppsRowProps) {
  const [pinnedApps, setPinnedApps] = useState<PinnedApp[]>([]);
  const [editingApp, setEditingApp] = useState<{
    id: string;
    field: "title" | "url";
    value: string;
  } | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  useEffect(() => {
    getPinnedApps().then(setPinnedApps);

    // Listen for storage changes to pinned apps
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
    if (editingApp && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingApp]);

  if (pinnedApps.length === 0 && !editingApp) return null;

  // Build set of origins that have open tabs
  const activeOrigins = new Set(
    tabs.map((t) => getOrigin(t.url)).filter(Boolean)
  );

  const handleClick = (app: PinnedApp) => {
    const origin = getOrigin(app.url);
    chrome.runtime.sendMessage({
      type: "OPEN_PINNED_APP",
      url: app.url,
      origin,
    });
  };

  const handlePinnedAppContextMenu = (e: React.MouseEvent, app: PinnedApp) => {
    e.preventDefault();
    e.stopPropagation();

    const items: ContextMenuItem[] = [
      {
        label: "Rename",
        onClick: () => {
          setEditingApp({ id: app.id, field: "title", value: app.title });
        },
      },
      {
        label: "Edit URL",
        onClick: () => {
          setEditingApp({ id: app.id, field: "url", value: app.url });
        },
      },
      {
        label: "Open in New Tab",
        onClick: () => {
          chrome.runtime.sendMessage({
            type: "OPEN_PINNED_APP_NEW_TAB",
            url: app.url,
          });
        },
      },
      {
        label: "Remove",
        onClick: () => {
          removePinnedApp(app.id);
        },
      },
    ];

    onContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  const handleEditSubmit = () => {
    if (!editingApp) return;
    const trimmed = editingApp.value.trim();
    if (trimmed) {
      updatePinnedApp(editingApp.id, {
        [editingApp.field === "title" ? "title" : "url"]: trimmed,
      });
    }
    setEditingApp(null);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleEditSubmit();
    } else if (e.key === "Escape") {
      setEditingApp(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = pinnedApps.findIndex((a) => a.id === active.id);
    const newIndex = pinnedApps.findIndex((a) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(pinnedApps, oldIndex, newIndex);
    setPinnedApps(reordered);
    reorderPinnedApps(reordered.map((a) => a.id));
  };

  return (
    <div className="px-2 py-1.5 border-b border-gray-200 dark:border-gray-700">
      {editingApp && (
        <div className="mb-1.5">
          <input
            ref={editInputRef}
            type="text"
            value={editingApp.value}
            onChange={(e) =>
              setEditingApp({ ...editingApp, value: e.target.value })
            }
            onBlur={handleEditSubmit}
            onKeyDown={handleEditKeyDown}
            className="w-full px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:ring-1 focus:ring-[#2E75B6]"
            placeholder={
              editingApp.field === "title" ? "App name" : "https://..."
            }
          />
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={pinnedApps.map((a) => a.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div
            ref={scrollRef}
            className="flex gap-2 overflow-x-auto scrollbar-none"
          >
            {pinnedApps.map((app) => {
              const origin = getOrigin(app.url);
              const hasOpenTab = activeOrigins.has(origin);

              return (
                <SortablePinnedApp
                  key={app.id}
                  app={app}
                  hasOpenTab={hasOpenTab}
                  onClick={() => handleClick(app)}
                  onContextMenu={(e) => handlePinnedAppContextMenu(e, app)}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
