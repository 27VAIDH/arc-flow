import { useCallback, useEffect, useRef, useState } from "react";
import type { PageCapture, ResearchSession } from "../shared/types";
import {
  saveSession,
  getSessions,
  getCaptures,
  deleteSession,
} from "../shared/researchDb";
import { connectPages, generateBrief } from "../shared/aiResearchService";

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\u2026";
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

function CapturedPageItem({ capture }: { capture: PageCapture }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="px-2 py-1">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-start gap-1.5 w-full text-left"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-3 h-3 shrink-0 mt-0.5 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
            clipRule="evenodd"
          />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-700 dark:text-gray-300 leading-tight truncate">
            {truncate(capture.title || capture.url, 45)}
          </p>
          {capture.summary ? (
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
              {truncate(capture.summary, 60)}
            </p>
          ) : (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 italic">
              Summarizing...
            </p>
          )}
        </div>
      </button>
      {expanded && capture.summary && (
        <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-1 ml-4.5 leading-relaxed whitespace-pre-wrap">
          {capture.summary}
        </p>
      )}
    </div>
  );
}

function SessionHistoryItem({
  session,
  onDelete,
  onRestore,
}: {
  session: ResearchSession;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 group">
      <button
        onClick={() => onRestore(session.id)}
        className="flex-1 min-w-0 text-left"
      >
        <p className="text-xs text-gray-700 dark:text-gray-300 truncate">
          {session.name}
        </p>
        <p className="text-[10px] text-gray-400 dark:text-gray-500">
          {session.pageIds.length} pages &middot;{" "}
          {formatDate(session.createdAt)}
        </p>
      </button>
      <button
        onClick={() => onDelete(session.id)}
        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 shrink-0 transition-opacity"
        aria-label="Delete session"
        title="Delete session"
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

export default function ResearchCopilotSection() {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [activeSession, setActiveSession] = useState<ResearchSession | null>(
    null
  );
  const [captures, setCaptures] = useState<PageCapture[]>([]);
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [historyCollapsed, setHistoryCollapsed] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [briefTopic, setBriefTopic] = useState("");
  const [briefResult, setBriefResult] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefCopied, setBriefCopied] = useState(false);
  // Cache keyed by session ID to avoid re-fetching on re-render
  const analysisCacheRef = useRef<Record<string, string>>({});
  const briefCacheRef = useRef<Record<string, string>>({});

  const loadSessions = useCallback(async () => {
    const all = await getSessions();
    setSessions(all.sort((a, b) => b.createdAt - a.createdAt));
  }, []);

  const loadCaptures = useCallback(async (sessionId: string) => {
    const caps = await getCaptures(sessionId);
    setCaptures(caps.sort((a, b) => b.capturedAt - a.capturedAt));
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Listen for PAGE_TEXT_CAPTURED messages to update captures list
  useEffect(() => {
    const handleMessage = (message: { type: string; data?: PageCapture }) => {
      if (message.type === "PAGE_TEXT_CAPTURED" && activeSession) {
        loadCaptures(activeSession.id);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [activeSession, loadCaptures]);

  const handleStartResearch = useCallback(async () => {
    const session: ResearchSession = {
      id: crypto.randomUUID(),
      name: `Research ${new Date().toLocaleString()}`,
      pageIds: [],
      createdAt: Date.now(),
    };
    await saveSession(session);
    setActiveSession(session);
    setCaptures([]);
    loadSessions();
  }, [loadSessions]);

  const handleStopResearch = useCallback(() => {
    setActiveSession(null);
    setCaptures([]);
    setAnalysisResult(null);
    setAnalysisError(null);
    setBriefResult(null);
    setBriefError(null);
    setBriefTopic("");
    loadSessions();
  }, [loadSessions]);

  const handleCapturePage = useCallback(async () => {
    if (!activeSession) return;
    setCapturing(true);
    try {
      // Send CAPTURE_PAGE_TEXT to service worker which forwards to active tab content script
      chrome.runtime.sendMessage({
        type: "CAPTURE_PAGE_TEXT",
        sessionId: activeSession.id,
      });
      // Captures will be loaded via the PAGE_TEXT_CAPTURED listener
      // Add a small delay then refresh
      setTimeout(() => {
        loadCaptures(activeSession.id);
        setCapturing(false);
      }, 1500);
    } catch {
      setCapturing(false);
    }
  }, [activeSession, loadCaptures]);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      await deleteSession(sessionId);
      if (activeSession?.id === sessionId) {
        setActiveSession(null);
        setCaptures([]);
      }
      loadSessions();
    },
    [activeSession, loadSessions]
  );

  const handleAnalyzeConnections = useCallback(async () => {
    if (!activeSession || captures.length < 2) return;

    // Check cache first
    const cached = analysisCacheRef.current[activeSession.id];
    if (cached) {
      setAnalysisResult(cached);
      return;
    }

    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const summaries = captures
        .filter((c) => c.summary)
        .map((c) => c.summary!);
      if (summaries.length < 2) {
        setAnalysisError("Need at least 2 pages with summaries to analyze.");
        setAnalysisLoading(false);
        return;
      }
      const result = await connectPages(summaries);
      analysisCacheRef.current[activeSession.id] = result;
      setAnalysisResult(result);
    } catch (e) {
      setAnalysisError(
        e instanceof Error ? e.message : "Failed to analyze connections"
      );
    } finally {
      setAnalysisLoading(false);
    }
  }, [activeSession, captures]);

  const handleGenerateBrief = useCallback(async () => {
    if (!activeSession || captures.length < 1) return;

    // Build cache key from session ID + topic
    const cacheKey = `${activeSession.id}::${briefTopic}`;
    const cached = briefCacheRef.current[cacheKey];
    if (cached) {
      setBriefResult(cached);
      return;
    }

    setBriefLoading(true);
    setBriefError(null);
    try {
      const summaries = captures
        .filter((c) => c.summary)
        .map((c) => c.summary!);
      if (summaries.length < 1) {
        setBriefError(
          "Need at least 1 page with a summary to generate a brief."
        );
        setBriefLoading(false);
        return;
      }
      const result = await generateBrief(summaries, briefTopic);
      briefCacheRef.current[cacheKey] = result;
      setBriefResult(result);
    } catch (e) {
      setBriefError(
        e instanceof Error ? e.message : "Failed to generate brief"
      );
    } finally {
      setBriefLoading(false);
    }
  }, [activeSession, captures, briefTopic]);

  const handleCopyBrief = useCallback(async () => {
    if (!briefResult) return;
    try {
      await navigator.clipboard.writeText(briefResult);
      setBriefCopied(true);
      setTimeout(() => setBriefCopied(false), 2000);
    } catch {
      // Fallback: select and copy
    }
  }, [briefResult]);

  const handleExportBriefMarkdown = useCallback(() => {
    if (!briefResult) return;
    const blob = new Blob([briefResult], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `research-brief-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [briefResult]);

  const handleRestoreSession = useCallback(
    async (sessionId: string) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (session) {
        setActiveSession(session);
        await loadCaptures(sessionId);
        setHistoryCollapsed(true);
        // Restore cached analysis and brief or clear
        const cached = analysisCacheRef.current[sessionId];
        setAnalysisResult(cached ?? null);
        setAnalysisError(null);
        setBriefResult(null);
        setBriefError(null);
        setBriefTopic("");
      }
    },
    [sessions, loadCaptures]
  );

  // Filter completed sessions (not the active one) for history
  const historySessions = sessions.filter((s) => s.id !== activeSession?.id);

  return (
    <section className="px-1 pb-2" aria-label="Research Copilot">
      {/* Collapsible header */}
      <button
        onClick={() => setIsCollapsed((prev) => !prev)}
        aria-expanded={!isCollapsed}
        aria-controls="research-copilot-content"
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
        {/* Magnifying glass / research icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-3.5 h-3.5 shrink-0"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
            clipRule="evenodd"
          />
        </svg>
        <span>Research Copilot</span>
      </button>

      {/* Content */}
      {!isCollapsed && (
        <div id="research-copilot-content" className="px-2">
          {/* Action buttons */}
          <div className="flex gap-1.5 mb-2">
            {!activeSession ? (
              <button
                onClick={handleStartResearch}
                className="flex-1 text-xs px-2 py-1 rounded bg-arc-accent text-white hover:bg-arc-accent/90 transition-colors"
              >
                Start Research
              </button>
            ) : (
              <>
                <button
                  onClick={handleCapturePage}
                  disabled={capturing}
                  className="flex-1 text-xs px-2 py-1 rounded bg-arc-accent text-white hover:bg-arc-accent/90 transition-colors disabled:opacity-50"
                >
                  {capturing ? "Capturing\u2026" : "Capture This Page"}
                </button>
                <button
                  onClick={handleStopResearch}
                  className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Stop
                </button>
              </>
            )}
          </div>

          {/* Active session info */}
          {activeSession && (
            <div className="mb-2">
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1">
                Session: {activeSession.name}
              </p>

              {/* Captured pages */}
              {captures.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
                  No pages captured yet. Click &quot;Capture This Page&quot; to
                  add the active tab.
                </p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {captures.map((cap) => (
                    <CapturedPageItem key={cap.id} capture={cap} />
                  ))}
                </div>
              )}

              {/* Analyze Connections */}
              <div className="mt-2">
                <button
                  onClick={handleAnalyzeConnections}
                  disabled={captures.length < 2 || analysisLoading}
                  className="w-full text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {analysisLoading ? "Analyzing\u2026" : "Analyze Connections"}
                </button>

                {analysisError && (
                  <p className="text-[10px] text-red-500 mt-1">
                    {analysisError}
                  </p>
                )}

                {analysisResult && (
                  <div className="mt-2 p-2 rounded bg-gray-100 dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {analysisResult}
                  </div>
                )}
              </div>

              {/* Generate Brief */}
              <div className="mt-2">
                <input
                  type="text"
                  value={briefTopic}
                  onChange={(e) => setBriefTopic(e.target.value)}
                  placeholder="Topic (optional)"
                  className="w-full text-xs px-2 py-1 mb-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-arc-accent"
                />
                <button
                  onClick={handleGenerateBrief}
                  disabled={captures.length < 1 || briefLoading}
                  className="w-full text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {briefLoading ? "Generating\u2026" : "Generate Brief"}
                </button>

                {briefError && (
                  <p className="text-[10px] text-red-500 mt-1">{briefError}</p>
                )}

                {briefResult && (
                  <div className="mt-2">
                    <div className="p-2 rounded bg-gray-100 dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                      {briefResult}
                    </div>
                    <div className="flex gap-1.5 mt-1.5">
                      <button
                        onClick={handleCopyBrief}
                        className="flex-1 text-[10px] px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                      >
                        {briefCopied ? "Copied!" : "Copy to Clipboard"}
                      </button>
                      <button
                        onClick={handleExportBriefMarkdown}
                        className="flex-1 text-[10px] px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                      >
                        Export Markdown
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Session history */}
          {historySessions.length > 0 && (
            <div>
              <button
                onClick={() => setHistoryCollapsed((prev) => !prev)}
                className="flex items-center gap-1 w-full py-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`w-3 h-3 shrink-0 transition-transform ${historyCollapsed ? "" : "rotate-90"}`}
                >
                  <path
                    fillRule="evenodd"
                    d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Past Sessions ({historySessions.length})</span>
              </button>

              {!historyCollapsed && (
                <div className="flex flex-col gap-0.5">
                  {historySessions.map((s) => (
                    <SessionHistoryItem
                      key={s.id}
                      session={s}
                      onDelete={handleDeleteSession}
                      onRestore={handleRestoreSession}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Empty state when no session and no history */}
          {!activeSession && historySessions.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
              Start a research session to capture and summarize pages.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
