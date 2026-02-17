import { useCallback, useEffect, useRef, useState } from "react";
import type { Workspace } from "../shared/types";
import {
  getWorkspaces,
  createWorkspace,
  createWorkspaceFromTemplate,
  updateWorkspace,
  deleteWorkspace,
  setActiveWorkspace,
} from "../shared/workspaceStorage";
import { applyPanelColor } from "./useTheme";
import { getSettings } from "../shared/settingsStorage";
import WorkspaceTemplatesModal from "./WorkspaceTemplates";

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
  const [showPanelColorPicker, setShowPanelColorPicker] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const panelColorPickerRef = useRef<HTMLDivElement>(null);
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
      if (
        showPanelColorPicker &&
        panelColorPickerRef.current &&
        !panelColorPickerRef.current.contains(e.target as Node)
      ) {
        setShowPanelColorPicker(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowEmojiPicker(null);
        setShowColorPicker(null);
        setShowPanelColorPicker(null);
        setEditingId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showEmojiPicker, showColorPicker, showPanelColorPicker]);

  const handleSwitchWorkspace = useCallback(
    async (wsId: string) => {
      await setActiveWorkspace(wsId);
      onWorkspaceChange(wsId);
    },
    [onWorkspaceChange]
  );

  const handleCreate = useCallback(() => {
    setShowTemplateModal(true);
  }, []);

  const handleTemplateCreate = useCallback(
    async (templateId: string | null) => {
      try {
        let ws;
        if (templateId) {
          ws = await createWorkspaceFromTemplate(templateId);
        } else {
          ws = await createWorkspace("New Workspace");
          await setActiveWorkspace(ws.id);
          setEditingId(ws.id);
          setEditName(ws.name);
        }
        onWorkspaceChange(ws.id);
      } catch {
        // Ignore errors
      }
      setShowTemplateModal(false);
    },
    [onWorkspaceChange]
  );

  const handleClone = useCallback(
    async (sourceWs: Workspace) => {
      try {
        const ws = await createWorkspace(
          `${sourceWs.name} (Copy)`,
          sourceWs.id
        );
        await setActiveWorkspace(ws.id);
        onWorkspaceChange(ws.id);
      } catch {
        // Ignore errors
      }
    },
    [onWorkspaceChange]
  );

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

  const handlePanelColorSelect = useCallback(async (wsId: string, color: string) => {
    try {
      await updateWorkspace(wsId, { panelColor: color });
      // Apply immediately if this is the active workspace
      if (wsId === activeWorkspaceId) {
        applyPanelColor(color);
      }
    } catch {
      // Ignore errors
    }
    setShowPanelColorPicker(null);
  }, [activeWorkspaceId]);

  const handlePanelColorClear = useCallback(async (wsId: string) => {
    try {
      await updateWorkspace(wsId, { panelColor: "" });
      // If this is the active workspace, fall back to global setting
      if (wsId === activeWorkspaceId) {
        const settings = await getSettings();
        applyPanelColor(settings.panelColor);
      }
    } catch {
      // Ignore errors
    }
    setShowPanelColorPicker(null);
  }, [activeWorkspaceId]);

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

      items.push({
        label: "Panel Color",
        onClick: () => {
          setShowPanelColorPicker(ws.id);
        },
      });

      items.push({
        label: "Clone Workspace",
        onClick: () => handleClone(ws),
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
    [onContextMenu, handleDelete, handleClone, onSaveSession]
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
            className="w-full text-xs bg-white dark:bg-arc-surface border border-gray-300 dark:border-arc-border rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-arc-accent/50 text-gray-900 dark:text-arc-text-primary transition-colors duration-150"
            placeholder="Workspace name"
          />
        </div>
      )}

      {/* Icon strip */}
      <div
        className="flex items-center gap-1.5 px-3 py-2"
        role="toolbar"
        aria-label="Workspace switcher"
        onKeyDown={(e) => {
          const buttons = e.currentTarget.querySelectorAll("button");
          const focused = document.activeElement as HTMLElement;
          const idx = Array.from(buttons).indexOf(focused as HTMLButtonElement);
          if (idx === -1) return;

          if (e.key === "ArrowRight") {
            e.preventDefault();
            const next = idx < buttons.length - 1 ? idx + 1 : 0;
            buttons[next].focus();
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            const prev = idx > 0 ? idx - 1 : buttons.length - 1;
            buttons[prev].focus();
          }
        }}
      >
        {workspaces.map((ws) => {
          const isActive = ws.id === activeWorkspaceId;
          return (
            <button
              key={ws.id}
              onClick={() => handleSwitchWorkspace(ws.id)}
              onContextMenu={(e) => handleContextMenu(e, ws)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-arc-accent/50 ${
                isActive
                  ? "ring-2 ring-offset-1 dark:ring-offset-arc-bg scale-105"
                  : "opacity-60 hover:opacity-100 hover:scale-105"
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
              tabIndex={isActive ? 0 : -1}
              title={ws.name}
              aria-label={`Switch to ${ws.name} workspace${isActive ? " (active)" : ""}`}
              aria-pressed={isActive}
            >
              {ws.emoji}
            </button>
          );
        })}

        {/* Add workspace button */}
        <button
          onClick={handleCreate}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 dark:text-arc-text-secondary hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-arc-surface-hover shrink-0 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-arc-accent/50"
          aria-label="New Workspace"
          title="New Workspace"
          tabIndex={-1}
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
          role="dialog"
          aria-label="Choose emoji"
          className="absolute bottom-full left-3 mb-1 p-2 bg-white dark:bg-arc-surface border border-gray-200 dark:border-arc-border rounded-xl shadow-xl z-50"
        >
          <p className="text-[11px] text-gray-500 dark:text-arc-text-secondary mb-1.5 uppercase tracking-wider font-medium">
            Choose emoji
          </p>
          <div
            className="grid grid-cols-8 gap-1"
            role="radiogroup"
            aria-label="Emoji options"
          >
            {CURATED_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleEmojiSelect(showEmojiPicker, emoji)}
                className="w-7 h-7 rounded-lg hover:bg-gray-100 dark:hover:bg-arc-surface-hover text-base flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-arc-accent/50 transition-colors duration-100"
                aria-label={`Select emoji ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Template Picker Modal */}
      <WorkspaceTemplatesModal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        onCreate={handleTemplateCreate}
      />

      {/* Color Picker Popover (above the footer) */}
      {showColorPicker && (
        <div
          ref={colorPickerRef}
          role="dialog"
          aria-label="Choose color"
          className="absolute bottom-full left-3 mb-1 p-2 bg-white dark:bg-arc-surface border border-gray-200 dark:border-arc-border rounded-xl shadow-xl z-50"
        >
          <p className="text-[11px] text-gray-500 dark:text-arc-text-secondary mb-1.5 uppercase tracking-wider font-medium">
            Choose color
          </p>
          <div
            className="grid grid-cols-6 gap-1.5"
            role="radiogroup"
            aria-label="Color options"
          >
            {COLOR_PALETTE.map((color) => {
              const ws = workspaces.find((w) => w.id === showColorPicker);
              const isSelected = ws?.accentColor === color;
              return (
                <button
                  key={color}
                  onClick={() => handleColorSelect(showColorPicker, color)}
                  className={`w-6 h-6 rounded-full focus:outline-none focus:ring-2 focus:ring-arc-accent/50 transition-transform duration-100 hover:scale-110 ${isSelected ? "ring-2 ring-offset-1 ring-gray-400 dark:ring-offset-arc-surface" : ""}`}
                  style={{ backgroundColor: color }}
                  title={color}
                  aria-label={`Select color ${color}${isSelected ? " (selected)" : ""}`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Workspace dot indicators and arrow navigation */}
      {workspaces.length > 1 && (() => {
        const sorted = [...workspaces].sort((a, b) => a.sortOrder - b.sortOrder);
        const activeIdx = sorted.findIndex((ws) => ws.id === activeWorkspaceId);
        const isFirst = activeIdx <= 0;
        const isLast = activeIdx >= sorted.length - 1;
        return (
          <div className="flex items-center justify-center gap-2 px-3 pb-1">
            <button
              onClick={() => {
                if (!isFirst) handleSwitchWorkspace(sorted[activeIdx - 1].id);
              }}
              disabled={isFirst}
              className="flex items-center justify-center w-5 h-5 rounded text-gray-400 dark:text-arc-text-secondary hover:text-gray-600 dark:hover:text-arc-accent-hover transition-colors duration-150 disabled:opacity-0 disabled:pointer-events-none"
              aria-label="Previous workspace"
              title="Previous workspace"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              {sorted.map((ws) => {
                const isActive = ws.id === activeWorkspaceId;
                return (
                  <button
                    key={ws.id}
                    onClick={() => handleSwitchWorkspace(ws.id)}
                    className="p-0 border-0 bg-transparent cursor-pointer transition-transform duration-150 hover:scale-125"
                    aria-label={`Switch to ${ws.name}${isActive ? " (active)" : ""}`}
                    title={ws.name}
                  >
                    <span
                      className="block rounded-full transition-colors duration-150"
                      style={{
                        width: 6,
                        height: 6,
                        backgroundColor: isActive ? (ws.accentColor || "var(--color-arc-accent)") : "#4b5563",
                      }}
                    />
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => {
                if (!isLast) handleSwitchWorkspace(sorted[activeIdx + 1].id);
              }}
              disabled={isLast}
              className="flex items-center justify-center w-5 h-5 rounded text-gray-400 dark:text-arc-text-secondary hover:text-gray-600 dark:hover:text-arc-accent-hover transition-colors duration-150 disabled:opacity-0 disabled:pointer-events-none"
              aria-label="Next workspace"
              title="Next workspace"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        );
      })()}

      {/* Panel Color Picker Popover (above the footer) */}
      {showPanelColorPicker && (
        <div
          ref={panelColorPickerRef}
          role="dialog"
          aria-label="Choose panel color"
          className="absolute bottom-full left-3 mb-1 p-2 bg-white dark:bg-arc-surface border border-gray-200 dark:border-arc-border rounded-xl shadow-xl z-50"
        >
          <p className="text-[11px] text-gray-500 dark:text-arc-text-secondary mb-1.5 uppercase tracking-wider font-medium">
            Panel Color
          </p>
          <div
            className="grid grid-cols-7 gap-1.5"
            role="radiogroup"
            aria-label="Panel color options"
          >
            {/* Default/Reset swatch */}
            <button
              onClick={() => handlePanelColorClear(showPanelColorPicker)}
              className={`w-6 h-6 rounded-full focus:outline-none focus:ring-2 focus:ring-arc-accent/50 transition-transform duration-100 hover:scale-110 ${
                !workspaces.find((w) => w.id === showPanelColorPicker)?.panelColor
                  ? "ring-2 ring-offset-1 ring-gray-400 dark:ring-offset-arc-surface"
                  : ""
              }`}
              style={{ background: "linear-gradient(135deg, #0f0f17, #1a1a2e)" }}
              title="Default (use global setting)"
              aria-label="Reset to default panel color"
            />
            {COLOR_PALETTE.map((color) => {
              const ws = workspaces.find((w) => w.id === showPanelColorPicker);
              const isSelected = ws?.panelColor === color;
              return (
                <button
                  key={color}
                  onClick={() => handlePanelColorSelect(showPanelColorPicker, color)}
                  className={`w-6 h-6 rounded-full focus:outline-none focus:ring-2 focus:ring-arc-accent/50 transition-transform duration-100 hover:scale-110 ${isSelected ? "ring-2 ring-offset-1 ring-gray-400 dark:ring-offset-arc-surface" : ""}`}
                  style={{ backgroundColor: color }}
                  title={color}
                  aria-label={`Select panel color ${color}${isSelected ? " (selected)" : ""}`}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
