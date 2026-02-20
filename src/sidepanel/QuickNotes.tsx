import { useCallback, useEffect, useRef, useState } from "react";

const PLACEHOLDERS = [
  "What are you working on in this workspace?",
  "Jot down links, TODOs, or context for later...",
  "Quick notes to help you pick up where you left off",
];

const MAX_CHARS = 5000;
const SHOW_COUNTER_THRESHOLD = 4000;

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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdownLine(line: string): string {
  // Headers
  if (line.startsWith("### ")) return `<h3 class="text-xs font-bold mt-2 mb-1">${escapeHtml(line.slice(4))}</h3>`;
  if (line.startsWith("## ")) return `<h2 class="text-sm font-bold mt-2 mb-1">${escapeHtml(line.slice(3))}</h2>`;
  if (line.startsWith("# ")) return `<h1 class="text-base font-bold mt-2 mb-1">${escapeHtml(line.slice(2))}</h1>`;

  // Inline formatting on escaped text
  let html = escapeHtml(line);
  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic: *text* (but not inside bold)
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Links: [text](url)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-500 underline hover:text-blue-400">$1</a>'
  );

  return html;
}

function renderMarkdown(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Checklist: - [ ] or - [x]
    const checkMatch = line.match(/^- \[([ xX])\] (.*)$/);
    if (checkMatch) {
      if (!inList) { result.push('<ul class="list-none pl-0 my-1">'); inList = true; }
      const checked = checkMatch[1] !== " ";
      const content = renderMarkdownLine(checkMatch[2]);
      result.push(
        `<li class="flex items-start gap-1.5 py-0.5"><input type="checkbox" ${checked ? "checked" : ""} data-check-line="${i}" class="mt-0.5 cursor-pointer" /><span class="${checked ? "line-through text-gray-400" : ""}">${content}</span></li>`
      );
      continue;
    }

    // Bullet list: - item
    const bulletMatch = line.match(/^- (.*)$/);
    if (bulletMatch) {
      if (!inList) { result.push('<ul class="list-disc pl-4 my-1">'); inList = true; }
      result.push(`<li class="py-0.5 text-xs">${renderMarkdownLine(bulletMatch[1])}</li>`);
      continue;
    }

    // Close list if we were in one
    if (inList) { result.push("</ul>"); inList = false; }

    // Empty line = paragraph break
    if (line.trim() === "") {
      result.push('<div class="h-2"></div>');
      continue;
    }

    // Headers (handled inside renderMarkdownLine)
    if (line.startsWith("#")) {
      result.push(renderMarkdownLine(line));
      continue;
    }

    // Regular paragraph
    result.push(`<p class="text-xs my-0.5">${renderMarkdownLine(line)}</p>`);
  }

  if (inList) result.push("</ul>");
  return result.join("\n");
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
  const [previewState, setPreviewState] = useState<{ wsId: string; preview: boolean }>({ wsId: workspaceId, preview: false });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset preview mode when workspace changes by tracking wsId in the state itself
  const previewMode = previewState.wsId === workspaceId && previewState.preview;
  const setPreviewMode = (preview: boolean) => setPreviewState({ wsId: workspaceId, preview });

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

  // Handle checklist toggle in preview mode
  const handleChecklistClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.tagName !== "INPUT" || target.getAttribute("type") !== "checkbox") return;
      const lineIndex = parseInt(target.getAttribute("data-check-line") || "-1", 10);
      if (lineIndex < 0) return;

      const lines = localNotes.split("\n");
      if (lineIndex >= lines.length) return;

      const line = lines[lineIndex];
      const checkMatch = line.match(/^(- \[)([ xX])(\] .*)$/);
      if (!checkMatch) return;

      const newCheck = checkMatch[2] === " " ? "x" : " ";
      lines[lineIndex] = `${checkMatch[1]}${newCheck}${checkMatch[3]}`;
      const updated = lines.join("\n");
      setLocalNotes(updated);
      onNotesChange(updated);
    },
    [localNotes, onNotesChange]
  );

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
          {/* Edit/Preview toggle */}
          <div className="mb-1.5 flex items-center gap-1">
            <button
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                !previewMode
                  ? "bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200"
                  : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              }`}
              onClick={() => setPreviewMode(false)}
              aria-label="Edit mode"
            >
              ✏️ Edit
            </button>
            <button
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                previewMode
                  ? "bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200"
                  : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              }`}
              onClick={() => setPreviewMode(true)}
              aria-label="Preview mode"
            >
              👁 Preview
            </button>
          </div>

          {/* Edit mode: textarea */}
          {!previewMode && (
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
          )}

          {/* Preview mode: rendered markdown */}
          {previewMode && (
            <div
              className="w-full overflow-y-auto rounded border border-gray-200 bg-white p-2 text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              style={{ minHeight: "80px", maxHeight: "200px" }}
              onClick={handleChecklistClick}
              dangerouslySetInnerHTML={{
                __html: localNotes
                  ? renderMarkdown(localNotes)
                  : '<p class="text-gray-400 dark:text-gray-500 italic">Nothing to preview</p>',
              }}
            />
          )}

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
                  {localNotes.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
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
