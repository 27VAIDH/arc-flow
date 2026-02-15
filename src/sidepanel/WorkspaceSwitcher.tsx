import { useCallback, useEffect, useRef, useState } from "react";
import type { Workspace } from "../shared/types";
import {
  getWorkspaces,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  setActiveWorkspace,
} from "../shared/workspaceStorage";

const CURATED_EMOJIS = [
  "🏠",
  "💼",
  "📁",
  "🎯",
  "🚀",
  "💡",
  "📚",
  "🎨",
  "🔬",
  "🎮",
  "🛒",
  "✈️",
  "🎵",
  "📧",
  "🔧",
  "🌱",
];

const COLOR_PALETTE = [
  "#2E75B6",
  "#EF4444",
  "#F97316",
  "#EAB308",
  "#22C55E",
  "#14B8A6",
  "#06B6D4",
  "#6366F1",
  "#A855F7",
  "#EC4899",
  "#78716C",
  "#64748B",
];

const DEFAULT_WORKSPACE_ID = "default";

interface WorkspaceSwitcherProps {
  activeWorkspaceId: string;
  onWorkspaceChange: (workspaceId: string) => void;
  onContextMenu: (state: {
    x: number;
    y: number;
    items: { label: string; onClick: () => void }[];
  }) => void;
  onSaveSession?: () => void;
}

export default function WorkspaceSwitcher({
  activeWorkspaceId,
  onWorkspaceChange,
  onContextMenu,
  onSaveSession,
}: WorkspaceSwitcherProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Load workspaces
  useEffect(() => {
    getWorkspaces().then(setWorkspaces);

    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === "local" && changes.workspaces) {
        const updated = (changes.workspaces.newValue as Workspace[]) ?? [];
        setWorkspaces(updated.sort((a, b) => a.sortOrder - b.sortOrder));
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // Focus input when editing
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Click outside handlers for pickers
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        showEmojiPicker &&
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(e.target as Node)
      ) {
        setShowEmojiPicker(null);
      }
      if (
        showColorPicker &&
        colorPickerRef.current &&
        !colorPickerRef.current.contains(e.target as Node)
      ) {
        setShowColorPicker(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowEmojiPicker(null);
        setShowColorPicker(null);
        setEditingId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showEmojiPicker, showColorPicker]);

  const handleSwitchWorkspace = useCallback(
    async (wsId: string) => {
      await setActiveWorkspace(wsId);
      onWorkspaceChange(wsId);
    },
    [onWorkspaceChange]
  );

  const handleCreate = useCallback(async () => {
    try {
      const ws = await createWorkspace("New Workspace");
      await setActiveWorkspace(ws.id);
      onWorkspaceChange(ws.id);
      setEditingId(ws.id);
      setEditName(ws.name);
    } catch {
      // Ignore errors
    }
  }, [onWorkspaceChange]);

  const handleRenameCommit = useCallback(
    async (id: string) => {
      const trimmed = editName.trim();
      if (trimmed && id !== DEFAULT_WORKSPACE_ID) {
        try {
          await updateWorkspace(id, { name: trimmed });
        } catch {
          // Revert on error
        }
      }
      setEditingId(null);
    },
    [editName]
  );

  const handleDelete = useCallback(
    async (ws: Workspace) => {
      if (ws.id === DEFAULT_WORKSPACE_ID) return;
      const confirmed = window.confirm(
        `Delete workspace "${ws.name}"? Its tabs will be moved to the Default workspace.`
      );
      if (confirmed) {
        try {
          await deleteWorkspace(ws.id);
          // If deleted workspace was active, switch to default
          if (activeWorkspaceId === ws.id) {
            onWorkspaceChange(DEFAULT_WORKSPACE_ID);
          }
        } catch {
          // Ignore errors
        }
      }
    },
    [activeWorkspaceId, onWorkspaceChange]
  );

  const handleEmojiSelect = useCallback(async (wsId: string, emoji: string) => {
    try {
      await updateWorkspace(wsId, { emoji });
    } catch {
      // Ignore errors
    }
    setShowEmojiPicker(null);
  }, []);

  const handleColorSelect = useCallback(async (wsId: string, color: string) => {
    try {
      await updateWorkspace(wsId, { accentColor: color });
    } catch {
      // Ignore errors
    }
    setShowColorPicker(null);
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, ws: Workspace) => {
      e.preventDefault();
      const items: { label: string; onClick: () => void }[] = [];

      if (ws.id !== DEFAULT_WORKSPACE_ID) {
        items.push({
          label: "Rename",
          onClick: () => {
            setEditingId(ws.id);
            setEditName(ws.name);
          },
        });
      }

      items.push({
        label: "Change Emoji",
        onClick: () => {
          setShowEmojiPicker(ws.id);
        },
      });

      items.push({
        label: "Change Color",
        onClick: () => {
          setShowColorPicker(ws.id);
        },
      });

      if (onSaveSession) {
        items.push({
          label: "Save Session",
          onClick: onSaveSession,
        });
      }

      if (ws.id !== DEFAULT_WORKSPACE_ID) {
        items.push({
          label: "Delete",
          onClick: () => handleDelete(ws),
        });
      }

      onContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    [onContextMenu, handleDelete, onSaveSession]
  );

  return (
    <div className="relative">
      {/* Inline rename input */}
      {editingId && (
        <div className="px-3 pb-1">
          <input
            ref={editInputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={() => handleRenameCommit(editingId)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameCommit(editingId);
              if (e.key === "Escape") setEditingId(null);
            }}
            className="w-full text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Workspace name"
          />
        </div>
      )}

      {/* Icon strip */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        {workspaces.map((ws) => {
          const isActive = ws.id === activeWorkspaceId;
          return (
            <button
              key={ws.id}
              onClick={() => handleSwitchWorkspace(ws.id)}
              onContextMenu={(e) => handleContextMenu(e, ws)}
              className={`w-7 h-7 rounded-md flex items-center justify-center text-sm shrink-0 transition-all ${
                isActive
                  ? "ring-2 ring-offset-1 dark:ring-offset-gray-900"
                  : "opacity-70 hover:opacity-100"
              }`}
              style={{
                backgroundColor: ws.accentColor + "20",
                ...(isActive
                  ? {
                      ringColor: ws.accentColor,
                      boxShadow: `0 0 0 2px ${ws.accentColor}`,
                    }
                  : {}),
              }}
              title={ws.name}
              aria-label={`Switch to ${ws.name} workspace`}
            >
              {ws.emoji}
            </button>
          );
        })}

        {/* Add workspace button */}
        <button
          onClick={handleCreate}
          className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 shrink-0 transition-colors"
          aria-label="New Workspace"
          title="New Workspace"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
        </button>
      </div>

      {/* Emoji Picker Popover (above the footer) */}
      {showEmojiPicker && (
        <div
          ref={emojiPickerRef}
          className="absolute bottom-full left-3 mb-1 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50"
        >
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
            Choose emoji
          </p>
          <div className="grid grid-cols-8 gap-1">
            {CURATED_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleEmojiSelect(showEmojiPicker, emoji)}
                className="w-7 h-7 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-base flex items-center justify-center"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Color Picker Popover (above the footer) */}
      {showColorPicker && (
        <div
          ref={colorPickerRef}
          className="absolute bottom-full left-3 mb-1 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50"
        >
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
            Choose color
          </p>
          <div className="grid grid-cols-6 gap-1.5">
            {COLOR_PALETTE.map((color) => {
              const ws = workspaces.find((w) => w.id === showColorPicker);
              const isSelected = ws?.accentColor === color;
              return (
                <button
                  key={color}
                  onClick={() => handleColorSelect(showColorPicker, color)}
                  className={`w-6 h-6 rounded-full ${isSelected ? "ring-2 ring-offset-1 ring-gray-400 dark:ring-offset-gray-800" : ""}`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
