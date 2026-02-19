import { useCallback, useEffect, useRef, useState } from "react";

const PLACEHOLDERS = [
  "What are you working on in this workspace?",
  "Jot down links, TODOs, or context for later...",
  "Quick notes to help you pick up where you left off",
];

const MAX_CHARS = 2000;
const SHOW_COUNTER_THRESHOLD = 1500;

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return "";
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (diff < 60000) return "just now";
  if (minutes < 60)
    return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

interface QuickNotesProps {
  workspaceId: string;
  workspaceName: string;
  notes: string;
  notesCollapsed: boolean;
  notesLastEditedAt: number;
  onNotesChange: (notes: string) => void;
  onCollapseToggle: () => void;
}

export default function QuickNotes({
  workspaceId,
  workspaceName,
  notes,
  notesCollapsed,
  notesLastEditedAt,
  onNotesChange,
  onCollapseToggle,
}: QuickNotesProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localNotes, setLocalNotes] = useState(notes);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local state when workspace changes or external notes update
  useEffect(() => {
    setTimeout(() => setLocalNotes(notes), 0);
  }, [notes, workspaceId]);

  const debouncedSave = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onNotesChange(value);
      }, 500);
    },
    [onNotesChange]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = (value: string) => {
    if (value.length > MAX_CHARS) return;
    setLocalNotes(value);
    debouncedSave(value);
  };

  const handleClear = () => {
    if (!localNotes) return;
    if (!confirm("Clear all notes for this workspace?")) return;
    setLocalNotes("");
    onNotesChange("");
  };

  // Focus textarea when expanding
  const handleToggle = () => {
    onCollapseToggle();
    if (notesCollapsed) {
      // Will expand — focus after React re-renders
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const placeholderIndex = workspaceId.charCodeAt(0) % PLACEHOLDERS.length;

  return (
    <div className="border-t border-gray-200 dark:border-gray-700">
      {/* Header */}
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800/50"
        onClick={handleToggle}
        aria-expanded={!notesCollapsed}
        aria-label={`Notes for ${workspaceName}`}
      >
        <span>📝</span>
        <span>Notes</span>
        {localNotes.length > 0 && (
          <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] tabular-nums dark:bg-gray-700">
            {localNotes.length}
          </span>
        )}
        <span className="ml-auto text-gray-400">
          {notesCollapsed ? "▸" : "▾"}
        </span>
      </button>

      {/* Expanded content */}
      {!notesCollapsed && (
        <div className="px-3 pb-2">
          <textarea
            ref={textareaRef}
            className="w-full resize-y rounded border border-gray-200 bg-white p-2 text-xs text-gray-800 placeholder-gray-400 focus:border-blue-400 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500 dark:focus:border-blue-500"
            style={{ minHeight: "80px", maxHeight: "200px" }}
            placeholder={PLACEHOLDERS[placeholderIndex]}
            value={localNotes}
            onChange={(e) => handleChange(e.target.value)}
            maxLength={MAX_CHARS}
            aria-label={`Workspace notes for ${workspaceName}`}
          />
          <div className="mt-1 flex items-center justify-between text-[10px] text-gray-400 dark:text-gray-500">
            <span>
              {notesLastEditedAt
                ? `Last edited: ${formatRelativeTime(notesLastEditedAt)}`
                : ""}
            </span>
            <div className="flex items-center gap-2">
              {localNotes.length > SHOW_COUNTER_THRESHOLD && (
                <span
                  className="tabular-nums"
                  aria-live="polite"
                >
                  {localNotes.length} / {MAX_CHARS}
                </span>
              )}
              {localNotes.length > 0 && (
                <button
                  className="text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                  onClick={handleClear}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { formatRelativeTime };
