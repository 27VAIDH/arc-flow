import { useEffect, useState } from "react";
import type { Settings, Workspace, RoutingRule } from "../shared/types";
import {
  getSettings,
  updateSettings,
  resetSettings,
} from "../shared/settingsStorage";
import { getWorkspaces, createWorkspace, updateWorkspace, setActiveWorkspace } from "../shared/workspaceStorage";
import {
  AUTO_ARCHIVE_OPTIONS,
  SUSPEND_THRESHOLD_OPTIONS,
  THEME_OPTIONS,
} from "../shared/constants";
import { applyPanelColor } from "./useTheme";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  sortableKeyboardCoordinates,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const COLOR_PALETTE = [
  "#2E75B6", "#EF4444", "#F97316", "#EAB308",
  "#22C55E", "#14B8A6", "#06B6D4", "#6366f1",
  "#A855F7", "#EC4899", "#78716C", "#64748B",
];

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | number;
  options: readonly { label: string; value: string | number }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-sm text-gray-700 dark:text-arc-text-primary shrink-0">
        {label}
      </label>
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm bg-white dark:bg-arc-surface border border-gray-300 dark:border-arc-border rounded-lg px-2 py-1 text-gray-900 dark:text-arc-text-primary min-w-[120px] transition-colors duration-200"
      >
        {options.map((opt) => (
          <option key={String(opt.value)} value={String(opt.value)}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TestConnectionButton({ apiKey }: { apiKey: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleTest = async () => {
    if (!apiKey) {
      setStatus("error");
      setErrorMsg("Enter an API key first");
      return;
    }
    setStatus("loading");
    setErrorMsg("");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "chrome-extension://arcflow",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-001",
          max_tokens: 5,
          messages: [{ role: "user", content: "Say hi" }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(body || `HTTP ${res.status}`);
      }
      setStatus("success");
    } catch (e) {
      clearTimeout(timeoutId);
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Connection failed");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleTest}
        disabled={status === "loading"}
        className="text-sm text-arc-accent dark:text-arc-accent-hover hover:text-indigo-700 dark:hover:text-indigo-300 disabled:opacity-50"
      >
        {status === "loading" ? "Testing..." : "Test Connection"}
      </button>
      {status === "success" && (
        <span className="text-green-500 text-sm" title="Connection successful">&#10003;</span>
      )}
      {status === "error" && (
        <span className="text-red-500 text-xs" title={errorMsg}>&#10007; {errorMsg}</span>
      )}
    </div>
  );
}

function SortableRoutingRuleRow({
  rule,
  index,
  workspaces,
  onToggle,
  onDelete,
}: {
  rule: RoutingRule;
  index: number;
  workspaces: Workspace[];
  onToggle: (index: number) => void;
  onDelete: (index: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `rule:${index}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || "transform 200ms ease",
    opacity: isDragging ? 0.4 : 1,
  };

  const ws = workspaces.find((w) => w.id === rule.workspaceId);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`flex items-center gap-2 ${!rule.enabled ? "opacity-50" : ""}`}
    >
      {/* Drag handle */}
      <span
        {...listeners}
        className="shrink-0 flex items-center cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 touch-none"
        aria-label="Drag to reorder"
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
      {/* Pattern text */}
      <span className="text-sm text-gray-700 dark:text-arc-text-primary truncate flex-1 min-w-0">
        {rule.pattern || <span className="italic text-gray-400">empty</span>}
      </span>
      {/* Workspace badge */}
      <span className="text-xs text-gray-500 dark:text-arc-text-secondary shrink-0 truncate max-w-[80px]">
        {ws ? `${ws.emoji} ${ws.name}` : "Unknown"}
      </span>
      {/* Enable/disable toggle */}
      <button
        onClick={() => onToggle(index)}
        className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          rule.enabled
            ? "bg-arc-accent"
            : "bg-gray-300 dark:bg-arc-surface-hover"
        }`}
        aria-label={rule.enabled ? "Disable rule" : "Enable rule"}
      >
        <span
          className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
            rule.enabled ? "translate-x-3" : "translate-x-0"
          }`}
        />
      </button>
      {/* Delete button */}
      <button
        onClick={() => onDelete(index)}
        className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 dark:hover:text-red-400 shrink-0"
        aria-label="Delete rule"
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
    </div>
  );
}

interface AnalyticsDailyEntry {
  opened: number;
  closed: number;
  domains: Record<string, number>;
  workspaceMinutes: Record<string, number>;
}

interface AnalyticsData {
  daily: Record<string, AnalyticsDailyEntry>;
}

type FocusStatsData = Record<string, { totalMinutes: number; sessions: number }>;

function getDateKey(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getDayLabel(daysAgo: number): string {
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function AnalyticsSection({ workspaces }: { workspaces: Workspace[] }) {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [focusStats, setFocusStats] = useState<FocusStatsData>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    chrome.storage.local.get(["analytics", "focusStats"], (result) => {
      setAnalytics((result.analytics as AnalyticsData) ?? { daily: {} });
      setFocusStats((result.focusStats as FocusStatsData) ?? {});
      setLoading(false);
    });

    const handleChange = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== "local") return;
      if (changes.analytics) {
        setAnalytics((changes.analytics.newValue as AnalyticsData) ?? { daily: {} });
      }
      if (changes.focusStats) {
        setFocusStats((changes.focusStats.newValue as FocusStatsData) ?? {});
      }
    };
    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  const handleClear = () => {
    if (window.confirm("Are you sure? This cannot be undone.")) {
      chrome.storage.local.remove(["analytics", "focusStats"]);
      setAnalytics({ daily: {} });
      setFocusStats({});
    }
  };

  if (loading) return null;

  const daily = analytics?.daily ?? {};
  const hasData = Object.keys(daily).length > 0 || Object.keys(focusStats).length > 0;

  if (!hasData) {
    return (
      <section>
        <h3 className="text-[11px] font-medium text-gray-400 dark:text-arc-text-secondary mb-3">
          Analytics
        </h3>
        <p className="text-sm text-gray-500 dark:text-arc-text-secondary">No data yet</p>
      </section>
    );
  }

  // 7-day tabs data
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const key = getDateKey(6 - i);
    const entry = daily[key];
    return {
      label: getDayLabel(6 - i),
      opened: entry?.opened ?? 0,
      closed: entry?.closed ?? 0,
    };
  });
  const maxTabs = Math.max(1, ...last7.map((d) => Math.max(d.opened, d.closed)));

  // Workspace time (aggregate all days)
  const wsTimeMap: Record<string, number> = {};
  for (const entry of Object.values(daily)) {
    for (const [wsId, mins] of Object.entries(entry.workspaceMinutes)) {
      wsTimeMap[wsId] = (wsTimeMap[wsId] ?? 0) + mins;
    }
  }
  const wsTimeEntries = Object.entries(wsTimeMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);
  const maxWsTime = Math.max(1, ...wsTimeEntries.map(([, m]) => m));

  // Top 5 domains (aggregate all days)
  const domainMap: Record<string, number> = {};
  for (const entry of Object.values(daily)) {
    for (const [domain, count] of Object.entries(entry.domains)) {
      domainMap[domain] = (domainMap[domain] ?? 0) + count;
    }
  }
  const topDomains = Object.entries(domainMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  // Memory saved estimate: each suspended tab saves ~50MB
  let totalSuspended = 0;
  for (const entry of Object.values(daily)) {
    totalSuspended += entry.closed;
  }
  const memorySavedMB = Math.round(totalSuspended * 50);

  // Focus time 7-day chart
  const focusLast7 = Array.from({ length: 7 }, (_, i) => {
    const key = getDateKey(6 - i);
    return {
      label: getDayLabel(6 - i),
      minutes: focusStats[key]?.totalMinutes ?? 0,
    };
  });
  const maxFocus = Math.max(1, ...focusLast7.map((d) => d.minutes));

  const formatWsTime = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const getWsLabel = (wsId: string) => {
    const ws = workspaces.find((w) => w.id === wsId);
    return ws ? `${ws.emoji} ${ws.name}` : wsId.slice(0, 8);
  };

  return (
    <section>
      <h3 className="text-[11px] font-medium text-gray-400 dark:text-arc-text-secondary mb-3">
        Analytics
      </h3>
      <div className="space-y-5">
        {/* Tabs opened/closed chart */}
        <div>
          <p className="text-xs text-gray-500 dark:text-arc-text-secondary mb-2">Tabs opened / closed (7 days)</p>
          <div className="flex items-end gap-1 h-20">
            {last7.map((day, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="flex gap-px items-end w-full h-14">
                  <div
                    className="flex-1 rounded-t-sm bg-arc-accent/80"
                    style={{ height: `${(day.opened / maxTabs) * 100}%`, minHeight: day.opened > 0 ? 2 : 0 }}
                    title={`Opened: ${day.opened}`}
                  />
                  <div
                    className="flex-1 rounded-t-sm bg-gray-400/50 dark:bg-gray-600/50"
                    style={{ height: `${(day.closed / maxTabs) * 100}%`, minHeight: day.closed > 0 ? 2 : 0 }}
                    title={`Closed: ${day.closed}`}
                  />
                </div>
                <span className="text-[9px] text-gray-400 dark:text-arc-text-secondary">{day.label}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-[9px] text-gray-400">
              <span className="w-2 h-2 rounded-sm bg-arc-accent/80" /> Opened
            </span>
            <span className="flex items-center gap-1 text-[9px] text-gray-400">
              <span className="w-2 h-2 rounded-sm bg-gray-400/50 dark:bg-gray-600/50" /> Closed
            </span>
          </div>
        </div>

        {/* Workspace time */}
        {wsTimeEntries.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 dark:text-arc-text-secondary mb-2">Time per workspace</p>
            <div className="space-y-1.5">
              {wsTimeEntries.map(([wsId, mins]) => (
                <div key={wsId} className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 dark:text-arc-text-primary truncate w-24 shrink-0">
                    {getWsLabel(wsId)}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-arc-accent/70"
                      style={{ width: `${(mins / maxWsTime) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 dark:text-arc-text-secondary shrink-0 w-12 text-right">
                    {formatWsTime(mins)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top domains */}
        {topDomains.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 dark:text-arc-text-secondary mb-2">Top domains</p>
            <div className="space-y-1">
              {topDomains.map(([domain, count], i) => (
                <div key={domain} className="flex items-center justify-between">
                  <span className="text-xs text-gray-600 dark:text-arc-text-primary truncate">
                    <span className="text-gray-400 dark:text-arc-text-secondary mr-1">{i + 1}.</span>
                    {domain}
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-arc-text-secondary shrink-0 ml-2">
                    {count.toLocaleString()} visits
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Memory saved */}
        <div>
          <p className="text-xs text-gray-500 dark:text-arc-text-secondary mb-1">Estimated memory saved</p>
          <p className="text-sm font-medium text-gray-700 dark:text-arc-text-primary">
            ~{memorySavedMB >= 1000 ? `${(memorySavedMB / 1000).toFixed(1)} GB` : `${memorySavedMB} MB`}
          </p>
          <p className="text-[10px] text-gray-400 dark:text-arc-text-secondary">from {totalSuspended.toLocaleString()} closed/suspended tabs (~50 MB each)</p>
        </div>

        {/* Focus time chart */}
        {focusLast7.some((d) => d.minutes > 0) && (
          <div>
            <p className="text-xs text-gray-500 dark:text-arc-text-secondary mb-2">Deep Work focus time (7 days)</p>
            <div className="flex items-end gap-1 h-20">
              {focusLast7.map((day, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="flex items-end w-full h-14 justify-center">
                    <div
                      className="w-full rounded-t-sm bg-green-500/70"
                      style={{ height: `${(day.minutes / maxFocus) * 100}%`, minHeight: day.minutes > 0 ? 2 : 0 }}
                      title={`${day.minutes} min`}
                    />
                  </div>
                  <span className="text-[9px] text-gray-400 dark:text-arc-text-secondary">{day.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Clear analytics */}
        <button
          onClick={handleClear}
          className="w-full text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg px-3 py-2 text-center transition-colors duration-200"
        >
          Clear Analytics
        </button>
      </div>
    </section>
  );
}

function RoutingRulesSection({
  settings,
  workspaces,
  onUpdate,
}: {
  settings: Settings;
  workspaces: Workspace[];
  onUpdate: (data: Partial<Settings>) => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPattern, setNewPattern] = useState("");
  const [newWorkspaceId, setNewWorkspaceId] = useState(
    workspaces[0]?.id ?? "default"
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = parseInt(String(active.id).replace("rule:", ""), 10);
    const newIndex = parseInt(String(over.id).replace("rule:", ""), 10);

    const reordered = arrayMove(settings.routingRules, oldIndex, newIndex);
    onUpdate({ routingRules: reordered });
  };

  const handleToggle = (index: number) => {
    const rules = [...settings.routingRules];
    rules[index] = { ...rules[index], enabled: !rules[index].enabled };
    onUpdate({ routingRules: rules });
  };

  const handleDelete = (index: number) => {
    const rules = settings.routingRules.filter((_, i) => i !== index);
    onUpdate({ routingRules: rules });
  };

  const handleAdd = () => {
    if (!newPattern.trim()) return;
    const rules = [
      ...settings.routingRules,
      { pattern: newPattern.trim(), workspaceId: newWorkspaceId, enabled: true },
    ];
    onUpdate({ routingRules: rules });
    setNewPattern("");
    setNewWorkspaceId(workspaces[0]?.id ?? "default");
    setShowAddForm(false);
  };

  return (
    <section>
      <h3 className="text-[11px] font-medium text-gray-400 dark:text-arc-text-secondary mb-3">
        Auto-routing
      </h3>
      <div className="space-y-3">
        <p className="text-xs text-gray-500 dark:text-arc-text-secondary">
          Route new tabs to workspaces based on URL patterns. Use * as
          wildcard (e.g. *.google.com/*).
        </p>
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext
            items={settings.routingRules.map((_, i) => `rule:${i}`)}
            strategy={verticalListSortingStrategy}
          >
            {settings.routingRules.map((rule, index) => (
              <SortableRoutingRuleRow
                key={`rule-${index}`}
                rule={rule}
                index={index}
                workspaces={workspaces}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </SortableContext>
        </DndContext>
        {showAddForm ? (
          <div className="space-y-2 p-2 rounded-lg border border-gray-200 dark:border-arc-border bg-white/50 dark:bg-arc-surface/50">
            <input
              type="text"
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              placeholder="e.g., github.com/*"
              className="text-sm bg-white dark:bg-arc-surface border border-gray-300 dark:border-arc-border rounded-lg px-2 py-1 text-gray-900 dark:text-arc-text-primary transition-colors duration-200 w-full"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") setShowAddForm(false);
              }}
            />
            <select
              value={newWorkspaceId}
              onChange={(e) => setNewWorkspaceId(e.target.value)}
              className="text-sm bg-white dark:bg-arc-surface border border-gray-300 dark:border-arc-border rounded-lg px-2 py-1 text-gray-900 dark:text-arc-text-primary transition-colors duration-200 w-full"
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.emoji} {ws.name}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAdd}
                disabled={!newPattern.trim()}
                className="text-sm text-arc-accent dark:text-arc-accent-hover hover:text-indigo-700 dark:hover:text-indigo-300 disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewPattern("");
                }}
                className="text-sm text-gray-500 dark:text-arc-text-secondary hover:text-gray-700 dark:hover:text-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="text-sm text-arc-accent dark:text-arc-accent-hover hover:text-indigo-700 dark:hover:text-indigo-300"
          >
            + Add Rule
          </button>
        )}
      </div>
    </section>
  );
}

function ImportWorkspaceSection() {
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("idle");
    setMessage("");

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate structure
      if (data.version !== "2.0" || data.type !== "arcflow-workspace") {
        setStatus("error");
        setMessage("Invalid workspace file");
        return;
      }
      if (!data.name || typeof data.name !== "string") {
        setStatus("error");
        setMessage("Invalid workspace file");
        return;
      }

      // Check for name collision
      const workspaces = await getWorkspaces();
      let name = data.name;
      if (workspaces.some((ws) => ws.name === name)) {
        name = `${name} (imported)`;
      }

      // Create workspace
      const ws = await createWorkspace(name);

      // Apply imported data
      const pinnedApps = Array.isArray(data.pinnedApps)
        ? data.pinnedApps.map((app: { url?: string; title?: string; favicon?: string }, i: number) => ({
            id: crypto.randomUUID(),
            url: app.url || "",
            title: app.title || "",
            favicon: app.favicon || "",
            sortOrder: i,
          }))
        : [];

      const folderIdMap = new Map<string, string>();
      const importedFolders = Array.isArray(data.folders) ? data.folders : [];
      for (const folder of importedFolders) {
        if (folder.id) folderIdMap.set(folder.id, crypto.randomUUID());
      }

      const folders = importedFolders.map((folder: { id?: string; name?: string; parentId?: string | null; items?: Array<{ url?: string; title?: string; favicon?: string; type?: string; isArchived?: boolean; lastActiveAt?: number }>; isCollapsed?: boolean; sortOrder?: number }, i: number) => ({
        id: folderIdMap.get(folder.id || "") || crypto.randomUUID(),
        name: folder.name || "Untitled",
        parentId: folder.parentId ? (folderIdMap.get(folder.parentId) ?? null) : null,
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
      }));

      await updateWorkspace(ws.id, {
        emoji: data.emoji || ws.emoji,
        accentColor: data.accentColor || ws.accentColor,
        pinnedApps,
        folders,
        notes: typeof data.notes === "string" ? data.notes : "",
      });

      // Switch to imported workspace
      await setActiveWorkspace(ws.id);

      const pinnedCount = pinnedApps.length;
      const folderCount = folders.length;
      setStatus("success");
      setMessage(`Workspace ${data.emoji || ""} ${name} imported with ${pinnedCount} pinned app${pinnedCount !== 1 ? "s" : ""} and ${folderCount} folder${folderCount !== 1 ? "s" : ""}`);
    } catch {
      setStatus("error");
      setMessage("Invalid workspace file");
    }

    // Reset file input so same file can be re-selected
    e.target.value = "";
  };

  return (
    <section>
      <h3 className="text-[11px] font-medium text-gray-400 dark:text-arc-text-secondary mb-3">
        Import Workspace
      </h3>
      <div className="space-y-3">
        <label className="flex items-center justify-center gap-2 text-sm text-arc-accent dark:text-arc-accent-hover hover:bg-gray-100 dark:hover:bg-arc-surface-hover rounded-lg px-3 py-2 cursor-pointer transition-colors duration-200 border border-dashed border-gray-300 dark:border-arc-border">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
            <path d="M7.25 10.25a.75.75 0 0 0 1.5 0V4.56l2.22 2.22a.75.75 0 1 0 1.06-1.06l-3.5-3.5a.75.75 0 0 0-1.06 0l-3.5 3.5a.75.75 0 0 0 1.06 1.06l2.22-2.22v5.69Z" />
            <path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" />
          </svg>
          Choose .json file
          <input
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>
        {status === "success" && (
          <p className="text-xs text-green-600 dark:text-green-400">{message}</p>
        )}
        {status === "error" && (
          <p className="text-xs text-red-500 dark:text-red-400">{message}</p>
        )}
        <p className="text-xs text-gray-500 dark:text-arc-text-secondary">
          Import an ArcFlow workspace (.json) exported from another browser or device
        </p>
      </div>
    </section>
  );
}

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  useEffect(() => {
    getSettings().then(setSettings);
    getWorkspaces().then(setWorkspaces);
  }, []);

  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === "local" && changes.settings) {
        const newSettings = changes.settings.newValue as Settings | undefined;
        if (newSettings) setSettings(newSettings);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleUpdate = (data: Partial<Settings>) => {
    if (!settings) return;
    const updated = { ...settings, ...data };
    setSettings(updated);
    updateSettings(data);
  };

  const handleReset = () => {
    if (window.confirm("Reset all settings to their default values?")) {
      resetSettings().then(setSettings);
    }
  };

  if (!settings) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col bg-gray-50 dark:bg-[var(--color-arc-panel-bg)]"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/80 dark:border-arc-border">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-arc-text-primary tracking-tight">
          Settings
        </h2>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:text-arc-text-secondary dark:hover:text-gray-200 rounded-lg transition-colors duration-200"
          aria-label="Close settings"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>
      </div>

      {/* Settings Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {/* Appearance */}
        <section>
          <h3 className="text-[11px] font-medium text-gray-400 dark:text-arc-text-secondary mb-3">
            Appearance
          </h3>
          <div className="space-y-3">
            <SelectField
              label="Theme"
              value={settings.theme}
              options={THEME_OPTIONS}
              onChange={(v) =>
                handleUpdate({
                  theme: v as Settings["theme"],
                })
              }
            />
            <div>
              <label className="text-sm text-gray-700 dark:text-arc-text-primary block mb-2">
                Accent Color
              </label>
              <div className="flex flex-wrap gap-2">
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      handleUpdate({ accentColor: color });
                      // Apply immediately without waiting for storage roundtrip
                      document.documentElement.style.setProperty(
                        "--color-arc-accent",
                        color
                      );
                      const r = parseInt(color.slice(1, 3), 16);
                      const g = parseInt(color.slice(3, 5), 16);
                      const b = parseInt(color.slice(5, 7), 16);
                      const lighten = (c: number) =>
                        Math.min(255, Math.round(c + (255 - c) * 0.2));
                      const hover = `#${lighten(r).toString(16).padStart(2, "0")}${lighten(g).toString(16).padStart(2, "0")}${lighten(b).toString(16).padStart(2, "0")}`;
                      document.documentElement.style.setProperty(
                        "--color-arc-accent-hover",
                        hover
                      );
                    }}
                    className={`w-6 h-6 rounded-full focus:outline-none focus:ring-2 focus:ring-arc-accent/50 transition-transform duration-100 hover:scale-110 ${
                      settings.accentColor?.toLowerCase() ===
                      color.toLowerCase()
                        ? "ring-2 ring-offset-1 ring-gray-400 dark:ring-offset-arc-surface"
                        : ""
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                    aria-label={`Select accent color ${color}${settings.accentColor === color ? " (selected)" : ""}`}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-700 dark:text-arc-text-primary block mb-2">
                Panel Color
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                <button
                  onClick={() => {
                    handleUpdate({ panelColor: "" });
                    applyPanelColor("");
                  }}
                  className={`w-6 h-6 rounded-full border border-gray-300 dark:border-arc-border focus:outline-none focus:ring-2 focus:ring-arc-accent/50 transition-transform duration-100 hover:scale-110 flex items-center justify-center ${
                    !settings.panelColor
                      ? "ring-2 ring-offset-1 ring-gray-400 dark:ring-offset-arc-surface"
                      : ""
                  }`}
                  style={{ background: "linear-gradient(135deg, #1a1a2e 50%, #3a3a5e 50%)" }}
                  title="Default"
                  aria-label={`Reset to default panel color${!settings.panelColor ? " (selected)" : ""}`}
                />
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      handleUpdate({ panelColor: color });
                      applyPanelColor(color);
                    }}
                    className={`w-6 h-6 rounded-full focus:outline-none focus:ring-2 focus:ring-arc-accent/50 transition-transform duration-100 hover:scale-110 ${
                      settings.panelColor?.toLowerCase() === color.toLowerCase()
                        ? "ring-2 ring-offset-1 ring-gray-400 dark:ring-offset-arc-surface"
                        : ""
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                    aria-label={`Select panel color ${color}${settings.panelColor === color ? " (selected)" : ""}`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={settings.panelColor || ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    handleUpdate({ panelColor: v });
                    if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
                      applyPanelColor(v);
                    }
                  }}
                  placeholder="#000000"
                  className="text-sm bg-white dark:bg-arc-surface border border-gray-300 dark:border-arc-border rounded-lg px-2 py-1 text-gray-900 dark:text-arc-text-primary transition-colors duration-150 w-24"
                />
                {settings.panelColor && (
                  <button
                    onClick={() => {
                      handleUpdate({ panelColor: "" });
                      applyPanelColor("");
                    }}
                    className="text-xs text-gray-500 dark:text-arc-text-secondary hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Tab Management */}
        <section>
          <h3 className="text-[11px] font-medium text-gray-400 dark:text-arc-text-secondary mb-3">
            Tab Management
          </h3>
          <div className="space-y-3">
            <SelectField
              label="Auto-archive after"
              value={settings.autoArchiveMinutes}
              options={AUTO_ARCHIVE_OPTIONS}
              onChange={(v) =>
                handleUpdate({ autoArchiveMinutes: parseInt(v, 10) })
              }
            />
            <SelectField
              label="Suspend after"
              value={settings.suspendAfterMinutes}
              options={SUSPEND_THRESHOLD_OPTIONS}
              onChange={(v) =>
                handleUpdate({ suspendAfterMinutes: parseInt(v, 10) })
              }
            />
          </div>
        </section>

        {/* Focus Mode */}
        <section>
          <h3 className="text-[11px] font-medium text-gray-400 dark:text-arc-text-secondary mb-3">
            Focus Mode
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm text-gray-700 dark:text-arc-text-primary shrink-0">
                Enable focus mode
              </label>
              <button
                onClick={() => {
                  const updated = {
                    ...settings.focusMode,
                    enabled: !settings.focusMode.enabled,
                  };
                  handleUpdate({ focusMode: updated });
                  chrome.runtime.sendMessage({
                    type: "UPDATE_FOCUS_MODE",
                    enabled: updated.enabled,
                    redirectRules: updated.redirectRules,
                  });
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  settings.focusMode.enabled
                    ? "bg-red-600"
                    : "bg-gray-300 dark:bg-arc-surface-hover"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    settings.focusMode.enabled
                      ? "translate-x-4"
                      : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-arc-text-secondary">
              When enabled, navigating to blocked URLs will redirect to the
              configured productive URL.
            </p>
            {settings.focusMode.enabled &&
              (settings.focusMode.redirectRules.length === 0 ||
                settings.focusMode.redirectRules.every(
                  (r) => !r.blockedPattern.trim() || !r.redirectUrl.trim()
                )) && (
                <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Add redirect rules below for focus mode to take effect.
                  </p>
                </div>
              )}
            {settings.focusMode.redirectRules.map((rule, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={rule.blockedPattern}
                  onChange={(e) => {
                    const rules = [...settings.focusMode.redirectRules];
                    rules[index] = {
                      ...rules[index],
                      blockedPattern: e.target.value,
                    };
                    const updated = {
                      ...settings.focusMode,
                      redirectRules: rules,
                    };
                    handleUpdate({ focusMode: updated });
                  }}
                  placeholder="*twitter.com*"
                  className="text-sm bg-white dark:bg-arc-surface border border-gray-300 dark:border-arc-border rounded-lg px-2 py-1 text-gray-900 dark:text-arc-text-primary transition-colors duration-200 flex-1 min-w-0"
                />
                <input
                  type="text"
                  value={rule.redirectUrl}
                  onChange={(e) => {
                    const rules = [...settings.focusMode.redirectRules];
                    rules[index] = {
                      ...rules[index],
                      redirectUrl: e.target.value,
                    };
                    const updated = {
                      ...settings.focusMode,
                      redirectRules: rules,
                    };
                    handleUpdate({ focusMode: updated });
                  }}
                  placeholder="https://notion.so"
                  className="text-sm bg-white dark:bg-arc-surface border border-gray-300 dark:border-arc-border rounded-lg px-2 py-1 text-gray-900 dark:text-arc-text-primary transition-colors duration-200 flex-1 min-w-0"
                />
                <button
                  onClick={() => {
                    const rules = settings.focusMode.redirectRules.filter(
                      (_, i) => i !== index
                    );
                    const updated = {
                      ...settings.focusMode,
                      redirectRules: rules,
                    };
                    handleUpdate({ focusMode: updated });
                    chrome.runtime.sendMessage({
                      type: "UPDATE_FOCUS_MODE",
                      enabled: settings.focusMode.enabled,
                      redirectRules: rules,
                    });
                  }}
                  className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 dark:hover:text-red-400 shrink-0"
                  aria-label="Delete rule"
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
              </div>
            ))}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const rules = [
                    ...settings.focusMode.redirectRules,
                    { blockedPattern: "", redirectUrl: "" },
                  ];
                  handleUpdate({
                    focusMode: { ...settings.focusMode, redirectRules: rules },
                  });
                }}
                className="text-sm text-arc-accent dark:text-arc-accent-hover hover:text-indigo-700 dark:hover:text-indigo-300"
              >
                + Add Redirect Rule
              </button>
            </div>
          </div>
        </section>

        {/* AI / OpenRouter */}
        <section>
          <h3 className="text-[11px] font-medium text-gray-400 dark:text-arc-text-secondary mb-3">
            AI (OpenRouter)
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm text-gray-700 dark:text-arc-text-primary shrink-0">
                OpenRouter API Key
              </label>
              <input
                type="password"
                value={settings.openRouterApiKey}
                onChange={(e) =>
                  handleUpdate({ openRouterApiKey: e.target.value })
                }
                placeholder="sk-or-..."
                className="text-sm bg-white dark:bg-arc-surface border border-gray-300 dark:border-arc-border rounded-lg px-2 py-1 text-gray-900 dark:text-arc-text-primary transition-colors duration-200 min-w-[120px] w-full max-w-[180px]"
              />
            </div>
            <p className="text-xs text-gray-400 dark:text-arc-text-secondary">
              Your API key is stored locally on your device. It is only sent to OpenRouter for AI features.
            </p>
            <TestConnectionButton apiKey={settings.openRouterApiKey} />
          </div>
        </section>

        {/* Auto-routing */}
        <RoutingRulesSection
          settings={settings}
          workspaces={workspaces}
          onUpdate={handleUpdate}
        />

        {/* Analytics */}
        <AnalyticsSection workspaces={workspaces} />

        {/* Import Workspace */}
        <ImportWorkspaceSection />

        {/* Omnibox */}
        <section>
          <h3 className="text-[11px] font-medium text-gray-400 dark:text-arc-text-secondary mb-3">
            Omnibox
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm text-gray-700 dark:text-arc-text-primary shrink-0">
                Enable Omnibox
              </label>
              <button
                onClick={() =>
                  handleUpdate({ omniboxEnabled: !settings.omniboxEnabled })
                }
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  settings.omniboxEnabled
                    ? "bg-arc-accent"
                    : "bg-gray-300 dark:bg-arc-surface-hover"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    settings.omniboxEnabled
                      ? "translate-x-4"
                      : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-arc-text-secondary">
              Type <span className="font-medium">af</span> in address bar to search tabs
            </p>
          </div>
        </section>

        {/* Reset */}
        <section className="pt-2">
          <button
            onClick={handleReset}
            className="w-full text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg px-3 py-2 text-center transition-colors duration-200"
          >
            Reset to Defaults
          </button>
        </section>
      </div>
    </div>
  );
}
