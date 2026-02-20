import { useCallback, useEffect, useState } from "react";
import type { Workspace, TabInfo } from "../shared/types";

interface FocusStatsDay {
  totalMinutes: number;
  sessions: number;
}

type FocusStatsData = Record<string, FocusStatsDay>;

interface MorningBriefingProps {
  tabs: TabInfo[];
  workspaces: Workspace[];
  tabWorkspaceMap: Record<string, string>;
}

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getYesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatFocusTime(totalMinutes: number): string {
  if (totalMinutes === 0) return "0m";
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export default function MorningBriefing({
  tabs,
  workspaces,
  tabWorkspaceMap,
}: MorningBriefingProps) {
  const [visible, setVisible] = useState(false);
  const [yesterdayFocus, setYesterdayFocus] = useState<FocusStatsDay | null>(null);
  const [tabCounters, setTabCounters] = useState<{ opened: number; closed: number }>({ opened: 0, closed: 0 });

  // Check if briefing should show (first open per calendar day)
  useEffect(() => {
    chrome.storage.local.get("briefingDismissedDate", (result) => {
      const dismissedDate = result.briefingDismissedDate as string | undefined;
      const today = getTodayKey();
      if (dismissedDate !== today) {
        setVisible(true);
      }
    });
  }, []);

  // Load yesterday's focus stats
  useEffect(() => {
    if (!visible) return;
    chrome.storage.local.get("focusStats", (result) => {
      const stats = (result.focusStats as FocusStatsData) ?? {};
      const yesterday = getYesterdayKey();
      if (stats[yesterday] && stats[yesterday].totalMinutes > 0) {
        setYesterdayFocus(stats[yesterday]);
      }
    });
  }, [visible]);

  // Load tab session counters
  useEffect(() => {
    if (!visible) return;
    chrome.storage.local.get("tabSessionCounters", (result) => {
      const counters = (result.tabSessionCounters as { opened: number; closed: number }) ?? { opened: 0, closed: 0 };
      setTabCounters(counters);
    });
  }, [visible]);

  // Update lastSessionTimestamp on sidebar visibility change (hidden)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        chrome.storage.local.set({ lastSessionTimestamp: Date.now() });
        // Reset tab counters when sidebar is hidden (new "session" starts)
        chrome.storage.local.set({ tabSessionCounters: { opened: 0, closed: 0 } });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    chrome.storage.local.set({ briefingDismissedDate: getTodayKey() });
  }, []);

  if (!visible) return null;

  // Calculate per-workspace tab counts
  const workspaceTabCounts: { emoji: string; name: string; count: number }[] = [];
  const wsCounts = new Map<string, number>();
  for (const tab of tabs) {
    const wsId = tabWorkspaceMap[String(tab.id)] || "default";
    wsCounts.set(wsId, (wsCounts.get(wsId) ?? 0) + 1);
  }
  for (const ws of workspaces) {
    const count = wsCounts.get(ws.id) ?? 0;
    if (count > 0) {
      workspaceTabCounts.push({ emoji: ws.emoji, name: ws.name, count });
    }
  }

  // Get first line of each workspace's notes (non-empty)
  const noteReminders: { emoji: string; name: string; note: string }[] = [];
  for (const ws of workspaces) {
    if (ws.notes && ws.notes.trim()) {
      const firstLine = ws.notes.trim().split("\n")[0].slice(0, 80);
      noteReminders.push({ emoji: ws.emoji, name: ws.name, note: firstLine });
    }
  }

  return (
    <div className="mx-4 mb-2 p-3 rounded-xl border border-arc-accent/20 dark:border-arc-accent/15 bg-white/80 dark:bg-arc-surface/80 shadow-sm animate-fade-in">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 dark:text-arc-text-primary mb-1.5">
            Good morning
          </p>

          {/* Total tabs + per-workspace breakdown */}
          <div className="text-xs text-gray-600 dark:text-arc-text-secondary space-y-0.5">
            <p>
              {tabs.length} tab{tabs.length !== 1 ? "s" : ""} open
            </p>
            {workspaceTabCounts.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-2">
                {workspaceTabCounts.map((ws) => (
                  <span key={ws.name}>
                    {ws.emoji} {ws.name}: {ws.count}
                  </span>
                ))}
              </div>
            )}

            {/* Tabs opened/closed since last session */}
            {(tabCounters.opened > 0 || tabCounters.closed > 0) && (
              <p className="mt-1">
                {tabCounters.opened} tab{tabCounters.opened !== 1 ? "s" : ""} opened, {tabCounters.closed} closed since last session
              </p>
            )}

            {/* Yesterday's focus time */}
            {yesterdayFocus && (
              <p className="mt-1">
                Yesterday&apos;s focus: {formatFocusTime(yesterdayFocus.totalMinutes)} ({yesterdayFocus.sessions} session{yesterdayFocus.sessions !== 1 ? "s" : ""})
              </p>
            )}

            {/* Workspace note reminders */}
            {noteReminders.length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                {noteReminders.map((nr) => (
                  <p key={nr.name} className="truncate text-gray-500 dark:text-arc-text-secondary">
                    {nr.emoji} {nr.note}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="shrink-0 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          aria-label="Dismiss morning briefing"
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
    </div>
  );
}
