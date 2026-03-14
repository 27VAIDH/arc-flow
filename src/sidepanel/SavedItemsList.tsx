import { useEffect, useState, useRef } from "react";
import type { FolderItem } from "../shared/types";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDndMonitor, useDroppable } from "@dnd-kit/core";

function DraggableSavedItem({
  item,
  onClick,
  onContextMenu,
  onRename,
  isOverItem,
  externalEditing,
  onEditingComplete,
}: {
  item: FolderItem;
  onClick?: (item: FolderItem) => void;
  onContextMenu?: (e: React.MouseEvent, item: FolderItem) => void;
  onRename?: (itemId: string, newTitle: string) => void;
  isOverItem?: boolean;
  externalEditing?: boolean;
  onEditingComplete?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(item.title || item.url);
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  // Allow external trigger of editing mode (from context menu Rename)
  useEffect(() => {
    if (externalEditing && !editing) {
      committedRef.current = false;
      setEditName(item.title || item.url);
      setEditing(true);
      onEditingComplete?.();
    }
  }, [externalEditing]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `saved-item:${item.id}` });

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
      onRename?.(item.id, trimmed);
    }
    setEditing(false);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || "transform 200ms ease",
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <>
      {isOverItem && (
        <div
          className="h-0.5 bg-arc-accent rounded-full"
          style={{ marginLeft: 24, marginRight: 8 }}
        />
      )}
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        role="listitem"
        aria-label={item.title || item.url}
        tabIndex={0}
        className="group flex items-center gap-2 px-2 h-7 text-sm rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-arc-accent/50 focus:ring-inset transition-colors duration-200"
        onClick={() => {
          if (!editing) onClick?.(item);
        }}
        onKeyDown={(e) => {
          if (!editing && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onClick?.(item);
          }
        }}
        onContextMenu={(e) => onContextMenu?.(e, item)}
      >
        {/* Drag grip */}
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

interface SavedItemsListProps {
  savedItems: FolderItem[];
  onItemClick?: (item: FolderItem) => void;
  onItemContextMenu?: (e: React.MouseEvent, item: FolderItem) => void;
  onItemRename?: (itemId: string, newTitle: string) => void;
  editingItemId?: string | null;
  onEditingComplete?: () => void;
}

export default function SavedItemsList({
  savedItems,
  onItemClick,
  onItemContextMenu,
  onItemRename,
  editingItemId,
  onEditingComplete,
}: SavedItemsListProps) {
  const { setNodeRef: setDroppableRef, isOver: isOverDropZone } = useDroppable({
    id: "saved-items-drop",
  });

  // Track which saved-item is being hovered for drop indicators
  const [overItemId, setOverItemId] = useState<string | null>(null);
  useDndMonitor({
    onDragOver(event) {
      const overId = event.over?.id ? String(event.over.id) : null;
      if (overId && overId.startsWith("saved-item:")) {
        const itemId = overId.replace("saved-item:", "");
        if (savedItems.some((i) => i.id === itemId)) {
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

  const sortableIds = savedItems.map((item) => `saved-item:${item.id}`);
  const isEmpty = savedItems.length === 0;

  // Always render the droppable zone so items can be dropped here even when empty
  if (isEmpty && !isOverDropZone) return <div ref={setDroppableRef} />;

  return (
    <div
      ref={setDroppableRef}
      className={`px-1 pt-3 pb-2 transition-all duration-200 ${
        isOverDropZone ? "ring-1 ring-arc-accent/30 rounded-xl" : ""
      }`}
    >
      <div className="flex items-center px-2 py-1">
        <span className="text-[11px] text-gray-400 dark:text-arc-text-secondary font-medium">
          Saved
        </span>
      </div>
      {isEmpty ? (
        <div className="px-2 py-2 text-xs text-gray-400 dark:text-arc-text-secondary">
          Drop here to save
        </div>
      ) : (
        <SortableContext
          items={sortableIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-0.5" role="list" aria-label="Saved items">
            {savedItems.map((item) => (
              <DraggableSavedItem
                key={item.id}
                item={item}
                onClick={onItemClick}
                onContextMenu={onItemContextMenu}
                onRename={onItemRename}
                isOverItem={overItemId === item.id}
                externalEditing={editingItemId === item.id}
                onEditingComplete={onEditingComplete}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
}
