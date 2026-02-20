import { useCallback, useEffect, useRef, useState } from "react";

interface PomodoroState {
  phase: "work" | "break";
  sessionNumber: number;
  startedAt: number; // timestamp when current phase started (or resumed)
  pausedAt: number | null; // timestamp when paused, null if running
  remainingMs: number; // remaining ms at time of pause (or initial duration)
}

const WORK_DURATION_MS = 25 * 60 * 1000;
const SHORT_BREAK_MS = 5 * 60 * 1000;
const LONG_BREAK_MS = 15 * 60 * 1000;
const TOTAL_SESSIONS = 4;
const ALARM_NAME = "arcflow-pomodoro";
const WORK_DURATION_MINUTES = 25;

interface FocusStatsDay {
  totalMinutes: number;
  sessions: number;
}

type FocusStatsData = Record<string, FocusStatsDay>;

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function pruneOldEntries(data: FocusStatsData): FocusStatsData {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const result: FocusStatsData = {};
  for (const [key, value] of Object.entries(data)) {
    if (new Date(key).getTime() >= cutoff) {
      result[key] = value;
    }
  }
  return result;
}

async function recordWorkSessionComplete(): Promise<void> {
  const result = await chrome.storage.local.get("focusStats");
  const stats: FocusStatsData = (result.focusStats as FocusStatsData) ?? {};
  const today = getTodayKey();
  const todayStats = stats[today] ?? { totalMinutes: 0, sessions: 0 };
  todayStats.totalMinutes += WORK_DURATION_MINUTES;
  todayStats.sessions += 1;
  stats[today] = todayStats;
  const pruned = pruneOldEntries(stats);
  await chrome.storage.local.set({ focusStats: pruned });
}

function formatFocusTime(totalMinutes: number): string {
  if (totalMinutes === 0) return "0m";
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function getPhaseDuration(phase: "work" | "break", sessionNumber: number): number {
  if (phase === "work") return WORK_DURATION_MS;
  return sessionNumber >= TOTAL_SESSIONS ? LONG_BREAK_MS : SHORT_BREAK_MS;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getDefaultState(): PomodoroState {
  return {
    phase: "work",
    sessionNumber: 1,
    startedAt: Date.now(),
    pausedAt: null,
    remainingMs: WORK_DURATION_MS,
  };
}

export default function PomodoroTimer() {
  const [state, setState] = useState<PomodoroState | null>(null);
  const [displayMs, setDisplayMs] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [todayStats, setTodayStats] = useState<FocusStatsDay>({ totalMinutes: 0, sessions: 0 });

  // Load today's focus stats on mount and listen for changes
  useEffect(() => {
    const loadTodayStats = () => {
      chrome.storage.local.get("focusStats", (result) => {
        const stats = (result.focusStats as FocusStatsData) ?? {};
        const today = getTodayKey();
        setTodayStats(stats[today] ?? { totalMinutes: 0, sessions: 0 });
      });
    };
    loadTodayStats();

    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === "local" && changes.focusStats) {
        const stats = (changes.focusStats.newValue as FocusStatsData) ?? {};
        const today = getTodayKey();
        setTodayStats(stats[today] ?? { totalMinutes: 0, sessions: 0 });
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  // Load persisted state on mount
  useEffect(() => {
    chrome.storage.local.get("pomodoroState", (result) => {
      const saved = result.pomodoroState as PomodoroState | undefined;
      if (saved) {
        setState(saved);
      } else {
        const initial = getDefaultState();
        setState(initial);
        chrome.storage.local.set({ pomodoroState: initial });
      }
    });
  }, []);

  // Persist state changes
  const persistState = useCallback((newState: PomodoroState) => {
    setState(newState);
    chrome.storage.local.set({ pomodoroState: newState });
  }, []);

  // Calculate remaining time
  const calcRemaining = useCallback((s: PomodoroState): number => {
    if (s.pausedAt !== null) {
      return s.remainingMs;
    }
    const elapsed = Date.now() - s.startedAt;
    return Math.max(0, s.remainingMs - elapsed);
  }, []);

  // Advance to next phase
  const advancePhase = useCallback(
    (current: PomodoroState) => {
      let nextPhase: "work" | "break";
      let nextSession = current.sessionNumber;

      if (current.phase === "work") {
        nextPhase = "break";
        // Record completed work session to focus stats
        recordWorkSessionComplete();
        // Notify break
        const isLong = current.sessionNumber >= TOTAL_SESSIONS;
        try {
          chrome.notifications?.create(`pomodoro-break-${Date.now()}`, {
            type: "basic",
            iconUrl: "icons/icon128.png",
            title: "Break time!",
            message: isLong
              ? "Great work! Take a 15-minute long break."
              : `${SHORT_BREAK_MS / 60000} minutes`,
          });
        } catch {
          // Notifications may not be available
        }
      } else {
        nextPhase = "work";
        nextSession =
          current.sessionNumber >= TOTAL_SESSIONS
            ? 1
            : current.sessionNumber + 1;
        // Notify work
        try {
          chrome.notifications?.create(`pomodoro-work-${Date.now()}`, {
            type: "basic",
            iconUrl: "icons/icon128.png",
            title: "Back to work!",
            message: `Session ${nextSession} starting`,
          });
        } catch {
          // Notifications may not be available
        }
      }

      const duration = getPhaseDuration(nextPhase, nextSession);
      const newState: PomodoroState = {
        phase: nextPhase,
        sessionNumber: nextSession,
        startedAt: Date.now(),
        pausedAt: null,
        remainingMs: duration,
      };
      persistState(newState);
      // Re-create alarm
      chrome.alarms.clear(ALARM_NAME).then(() => {
        chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
      });
    },
    [persistState]
  );

  // Tick: update display every second and check for phase completion
  useEffect(() => {
    if (!state) return;

    const tick = () => {
      const remaining = calcRemaining(state);
      setDisplayMs(remaining);
      if (remaining <= 0 && state.pausedAt === null) {
        advancePhase(state);
      }
    };

    tick(); // immediate

    if (state.pausedAt === null) {
      tickRef.current = setInterval(tick, 1000);
    }

    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [state, calcRemaining, advancePhase]);

  // Set up chrome.alarms for accuracy (fires every minute when running)
  useEffect(() => {
    if (!state) return;

    if (state.pausedAt === null) {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
    } else {
      chrome.alarms.clear(ALARM_NAME);
    }

    const handleAlarm = (alarm: chrome.alarms.Alarm) => {
      if (alarm.name !== ALARM_NAME) return;
      // Recalculate remaining on alarm for accuracy
      const remaining = calcRemaining(state);
      setDisplayMs(remaining);
      if (remaining <= 0 && state.pausedAt === null) {
        advancePhase(state);
      }
    };

    chrome.alarms.onAlarm.addListener(handleAlarm);
    return () => {
      chrome.alarms.onAlarm.removeListener(handleAlarm);
    };
  }, [state, calcRemaining, advancePhase]);

  // Pause / Resume
  const togglePause = useCallback(() => {
    if (!state) return;

    if (state.pausedAt === null) {
      // Pause: store remaining
      const remaining = calcRemaining(state);
      persistState({
        ...state,
        pausedAt: Date.now(),
        remainingMs: remaining,
      });
    } else {
      // Resume: recalculate startedAt based on remaining
      persistState({
        ...state,
        startedAt: Date.now(),
        pausedAt: null,
      });
    }
  }, [state, calcRemaining, persistState]);

  // Skip to next phase
  const skipPhase = useCallback(() => {
    if (!state) return;
    advancePhase(state);
  }, [state, advancePhase]);

  if (!state) return null;

  const isPaused = state.pausedAt !== null;

  return (
    <div className="mx-4 mb-1 space-y-0.5 animate-fade-in">
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg bg-arc-accent/10 dark:bg-arc-accent/5 text-gray-700 dark:text-arc-text-primary">
        {/* Timer display */}
        <span className="font-mono font-semibold text-sm tabular-nums">
          {formatTime(displayMs)}
        </span>

        {/* Session info */}
        <span className="text-gray-500 dark:text-arc-text-secondary">
          Session {state.sessionNumber}/{TOTAL_SESSIONS} &middot;{" "}
          {state.phase === "work" ? "Work" : "Break"}
        </span>

        <div className="flex items-center gap-1 ml-auto shrink-0">
          {/* Pause/Resume button */}
          <button
            onClick={togglePause}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200/50 dark:hover:bg-white/10 transition-colors"
            title={isPaused ? "Resume" : "Pause"}
            aria-label={isPaused ? "Resume timer" : "Pause timer"}
          >
            {isPaused ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-3.5 h-3.5"
              >
                <path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.344-5.891a1.5 1.5 0 0 0 0-2.538L6.3 2.841Z" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-3.5 h-3.5"
              >
                <path d="M5.75 3a.75.75 0 0 0-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75A.75.75 0 0 0 7.25 3h-1.5ZM12.75 3a.75.75 0 0 0-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75V3.75a.75.75 0 0 0-.75-.75h-1.5Z" />
              </svg>
            )}
          </button>

          {/* Skip button */}
          <button
            onClick={skipPhase}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200/50 dark:hover:bg-white/10 transition-colors"
            title="Skip to next phase"
            aria-label="Skip to next phase"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-3.5 h-3.5"
            >
              <path d="M3.288 4.818A1.5 1.5 0 0 0 1 6.032v7.936a1.5 1.5 0 0 0 2.288 1.214l6.264-3.968a1.5 1.5 0 0 0 0-2.428L3.288 4.818Z" />
              <path d="M13 4.5v11a1 1 0 1 0 2 0v-11a1 1 0 1 0-2 0Z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Focus stats for today */}
      <div className="px-3 py-0.5 text-[10px] text-gray-400 dark:text-arc-text-secondary">
        Today: {formatFocusTime(todayStats.totalMinutes)} ({todayStats.sessions} session{todayStats.sessions !== 1 ? "s" : ""})
      </div>
    </div>
  );
}
