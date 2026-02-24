import { useCallback, useEffect, useState } from "react";
import type { Annotation } from "../shared/types";
import { getAllAnnotations, deleteAnnotation } from "../shared/annotationStorage";

interface AnnotationGroup {
  url: string;
  pageTitle: string;
  annotations: Annotation[];
  lastAnnotatedAt: number;
}

function groupAnnotationsByPage(annotations: Annotation[]): AnnotationGroup[] {
  const byUrl = new Map<string, Annotation[]>();
  for (const a of annotations) {
    if (!byUrl.has(a.url)) {
      byUrl.set(a.url, []);
    }
    byUrl.get(a.url)!.push(a);
  }

  const groups: AnnotationGroup[] = [];
  for (const [url, pageAnnotations] of byUrl) {
    const sorted = pageAnnotations.sort((a, b) => b.createdAt - a.createdAt);
    groups.push({
      url,
      pageTitle: sorted[0].pageTitle || url,
      annotations: sorted,
      lastAnnotatedAt: sorted[0].createdAt,
    });
  }

  return groups.sort((a, b) => b.lastAnnotatedAt - a.lastAnnotatedAt);
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\u2026";
}

const COLOR_LABELS: Record<string, string> = {
  "#FFEB3B": "yellow",
  "#81C784": "green",
  "#64B5F6": "blue",
};

function getColorDot(color: string): string {
  const label = COLOR_LABELS[color];
  if (label === "yellow") return "bg-yellow-400";
  if (label === "green") return "bg-green-400";
  if (label === "blue") return "bg-blue-400";
  return "bg-gray-400";
}

function AnnotationItem({
  annotation,
  onDelete,
}: {
  annotation: Annotation;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-start gap-1.5 px-2 py-1 group">
      <span
        className={`w-2 h-2 rounded-full shrink-0 mt-1 ${getColorDot(annotation.color)}`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-700 dark:text-gray-300 leading-tight">
          {truncate(annotation.text, 80)}
        </p>
        {annotation.comment && (
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 italic">
            {truncate(annotation.comment, 60)}
          </p>
        )}
      </div>
      <button
        onClick={() => onDelete(annotation.id)}
        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 shrink-0 transition-opacity"
        aria-label="Delete annotation"
        title="Delete annotation"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-3.5 h-3.5"
        >
          <path
            fillRule="evenodd"
            d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
}

function PageGroup({
  group,
  onDelete,
}: {
  group: AnnotationGroup;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-1.5 w-full px-2 py-1 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800 text-left"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-3 h-3 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
            clipRule="evenodd"
          />
        </svg>
        <span className="truncate flex-1 text-xs text-gray-700 dark:text-gray-300">
          {truncate(group.pageTitle, 35)}
        </span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
          {group.annotations.length}
        </span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
          {formatDate(group.lastAnnotatedAt)}
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-0.5 pb-1">
          {group.annotations.map((a) => (
            <AnnotationItem key={a.id} annotation={a} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AnnotationsSection() {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const loadAnnotations = useCallback(async () => {
    const all = await getAllAnnotations();
    setAnnotations(all);
  }, []);

  useEffect(() => {
    loadAnnotations();
  }, [loadAnnotations]);

  // Listen for storage changes (live updates)
  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area === "local" && changes.annotations) {
        loadAnnotations();
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [loadAnnotations]);

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteAnnotation(id);
      loadAnnotations();
    },
    [loadAnnotations],
  );

  const groups = groupAnnotationsByPage(annotations);

  return (
    <section className="px-1 pb-2" aria-label="Annotations">
      {/* Collapsible header */}
      <button
        onClick={() => setIsCollapsed((prev) => !prev)}
        aria-expanded={!isCollapsed}
        aria-controls="annotations-list"
        className="flex items-center gap-1 w-full px-2 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-3.5 h-3.5 shrink-0 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
            clipRule="evenodd"
          />
        </svg>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-3.5 h-3.5 shrink-0"
        >
          <path d="M15.988 3.012A2.25 2.25 0 0 0 14.25 2h-8.5A2.25 2.25 0 0 0 3.5 4.25v11.5A2.25 2.25 0 0 0 5.75 18h8.5A2.25 2.25 0 0 0 16.5 15.75V4.25c0-.58-.22-1.11-.512-1.238ZM7 5.25a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 7 5.25Zm.75 2.25a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5ZM7 10.75a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z" />
        </svg>
        <span>Annotations ({annotations.length})</span>
      </button>

      {/* Content */}
      {!isCollapsed && (
        <div id="annotations-list">
          {groups.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 px-2 py-2 text-center">
              No annotations yet. Select text on any page to highlight or add notes.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {groups.map((group) => (
                <PageGroup
                  key={group.url}
                  group={group}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
