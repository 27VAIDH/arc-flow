import { useEffect, useState, useRef } from "react";
import type { PinnedApp, TabInfo } from "../shared/types";
import {
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
  pinnedApps: PinnedApp[];
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
      aria-label={`${app.title}${hasOpenTab ? " (open)" : ""}`}
    >
      <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-white/[0.06] flex items-center justify-center transition-all duration-200 group-hover:bg-gray-200 dark:group-hover:bg-white/[0.10]">
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
          <span className="text-xs font-bold text-gray-500 dark:text-arc-text-secondary">
            {app.title.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      {/* Active indicator */}
      <div
        className={`w-[3px] h-[3px] rounded-full mt-0.5 transition-colors duration-200 ${
          hasOpenTab ? "bg-arc-accent" : "bg-transparent"
        }`}
        aria-hidden="true"
      />
    </button>
  );
}

export default function PinnedAppsRow({
  tabs,
  pinnedApps,
  onContextMenu,
}: PinnedAppsRowProps) {
  const [localPinnedApps, setLocalPinnedApps] =
    useState<PinnedApp[]>(pinnedApps);
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

  // Sync local state with prop changes
  useEffect(() => {
    setLocalPinnedApps(pinnedApps);
  }, [pinnedApps]);

  useEffect(() => {
    if (editingApp && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingApp?.id, editingApp?.field]);

  if (localPinnedApps.length === 0 && !editingApp) return null;

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

    const oldIndex = localPinnedApps.findIndex((a) => a.id === active.id);
    const newIndex = localPinnedApps.findIndex((a) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(localPinnedApps, oldIndex, newIndex);
    setLocalPinnedApps(reordered);
    reorderPinnedApps(reordered.map((a) => a.id));
  };

  return (
    <nav aria-label="Pinned apps" className="px-3 py-2 pb-2">
      <span className="text-[11px] text-gray-400 dark:text-arc-text-secondary font-medium px-1 mb-1 block">
        Pinned apps
      </span>
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
            className="w-full px-2 py-1 text-xs rounded-lg border border-gray-300 dark:border-arc-border bg-white dark:bg-arc-surface text-gray-900 dark:text-arc-text-primary outline-none focus:ring-1 focus:ring-arc-accent/50 transition-colors duration-200"
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
          items={localPinnedApps.map((a) => a.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div
            ref={scrollRef}
            className="flex flex-wrap gap-2 py-0.5"
            role="toolbar"
            aria-label="Pinned applications"
          >
            {localPinnedApps.map((app) => {
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
    </nav>
  );
}
