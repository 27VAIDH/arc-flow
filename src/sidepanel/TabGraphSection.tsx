import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphData, GraphNode, LayoutNode } from "../shared/types";
import { buildGraphData } from "../shared/tabGraphStorage";
import { getNavEventsSince } from "../shared/navigationDb";
import { getAffinityPairs } from "../shared/affinityStorage";
import { useGraphLayout } from "./useGraphLayout";
import { createFolder, addItemToFolder } from "../shared/folderStorage";
import { getSettings } from "../shared/settingsStorage";

const GRAPH_WIDTH = 320;
const GRAPH_HEIGHT = 280;

const DOMAIN_COLORS = [
  "#4285F4",
  "#EA4335",
  "#FBBC05",
  "#34A853",
  "#FF6D01",
  "#46BDC6",
  "#7B61FF",
  "#F538A0",
  "#00ACC1",
  "#8D6E63",
];

function getDomainColor(
  domain: string,
  domainMap: Map<string, string>
): string {
  if (domainMap.has(domain)) return domainMap.get(domain)!;
  const color = DOMAIN_COLORS[domainMap.size % DOMAIN_COLORS.length];
  domainMap.set(domain, color);
  return color;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\u2026";
}

type ViewMode = "graph" | "list";

const STORAGE_KEY_VIEW_MODE = "tabGraphViewMode";

export default function TabGraphSection() {
  const [collapsed, setCollapsed] = useState(false);
  const [graphData, setGraphData] = useState<GraphData>({
    nodes: [],
    edges: [],
  });
  const [hoveredNode, setHoveredNode] = useState<LayoutNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    domain: string;
  } | null>(null);
  const [clusterSummary, setClusterSummary] = useState<{
    domain: string;
    text: string;
  } | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("graph");
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Load persisted view preference
  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEY_VIEW_MODE, (result) => {
      const stored = result[STORAGE_KEY_VIEW_MODE];
      if (stored === "graph" || stored === "list") {
        setViewMode(stored);
      }
    });
  }, []);

  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => {
      const next: ViewMode = prev === "graph" ? "list" : "graph";
      chrome.storage.local.set({ [STORAGE_KEY_VIEW_MODE]: next });
      return next;
    });
  }, []);

  const loadGraphData = useCallback(async () => {
    try {
      const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const [navEvents, affinityPairs, tabs] = await Promise.all([
        getNavEventsSince(since),
        getAffinityPairs(1),
        new Promise<chrome.tabs.Tab[]>((resolve) =>
          chrome.tabs.query({}, resolve)
        ),
      ]);

      const openTabs = tabs.map((t) => ({
        id: t.id ?? 0,
        url: t.url ?? "",
        title: t.title ?? "",
        favIconUrl: t.favIconUrl ?? "",
        active: t.active ?? false,
        audible: t.audible ?? false,
        discarded: t.discarded ?? false,
        windowId: t.windowId ?? 0,
      }));

      const data = buildGraphData(navEvents, affinityPairs, openTabs);
      setGraphData(data);
    } catch {
      // Silently ignore errors
    }
  }, []);

  useEffect(() => {
    loadGraphData();
  }, [loadGraphData]);

  // Reload on storage changes
  useEffect(() => {
    const listener = () => {
      loadGraphData();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [loadGraphData]);

  const layout = useGraphLayout(graphData, GRAPH_WIDTH, GRAPH_HEIGHT);

  const domainColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of layout.nodes) {
      getDomainColor(node.domain, map);
    }
    return map;
  }, [layout.nodes]);

  const maxWeight = useMemo(() => {
    if (layout.edges.length === 0) return 1;
    return Math.max(...layout.edges.map((e) => e.weight));
  }, [layout.edges]);

  const handleNodeClick = useCallback((node: GraphNode) => {
    if (node.isOpen) {
      // Find tab by URL and switch to it
      chrome.tabs.query({}, (tabs) => {
        const tab = tabs.find((t) => t.url === node.url);
        if (tab?.id) {
          chrome.tabs.update(tab.id, { active: true });
          if (tab.windowId) {
            chrome.windows.update(tab.windowId, { focused: true });
          }
        }
      });
    } else {
      chrome.tabs.create({ url: node.url });
    }
  }, []);

  const handleNodeMouseEnter = useCallback(
    (node: LayoutNode, event: React.MouseEvent) => {
      setHoveredNode(node);
      const rect = (event.currentTarget as Element)
        .closest("svg")
        ?.getBoundingClientRect();
      if (rect) {
        setTooltipPos({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      }
    },
    []
  );

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
    setTooltipPos(null);
  }, []);

  const getClusterNodes = useCallback(
    (domain: string): GraphNode[] => {
      return graphData.nodes.filter((n) => n.domain === domain);
    },
    [graphData.nodes]
  );

  const handleNodeContextMenu = useCallback(
    (node: LayoutNode, event: React.MouseEvent) => {
      event.preventDefault();
      const containerRect = (event.currentTarget as Element)
        .closest(".relative")
        ?.getBoundingClientRect();
      if (containerRect) {
        setContextMenu({
          x: event.clientX - containerRect.left,
          y: event.clientY - containerRect.top,
          domain: node.domain,
        });
      }
      setHoveredNode(null);
      setTooltipPos(null);
    },
    []
  );

  const handleCreateFolder = useCallback(
    async (domain: string) => {
      setContextMenu(null);
      const cluster = getClusterNodes(domain);
      if (cluster.length === 0) return;

      try {
        const folder = await createFolder(domain);
        for (const node of cluster) {
          await addItemToFolder(folder.id, {
            id: crypto.randomUUID(),
            type: "link",
            tabId: null,
            url: node.url,
            title: node.title,
            favicon: `https://www.google.com/s2/favicons?domain=${node.domain}&sz=32`,
            isArchived: false,
            lastActiveAt: Date.now(),
          });
        }
      } catch {
        // Silently ignore errors
      }
    },
    [getClusterNodes]
  );

  const handleAISummarize = useCallback(
    async (domain: string) => {
      setContextMenu(null);
      const cluster = getClusterNodes(domain);
      if (cluster.length === 0) return;

      setSummarizing(true);
      setClusterSummary(null);

      try {
        const settings = await getSettings();
        if (!settings.openRouterApiKey) {
          setClusterSummary({
            domain,
            text: "Set an OpenRouter API key in Settings to use AI features.",
          });
          setSummarizing(false);
          return;
        }

        const tabList = cluster
          .map((n) => `- ${n.title} (${n.url})`)
          .join("\n");
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${settings.openRouterApiKey}`,
              "HTTP-Referer": "chrome-extension://arcflow",
            },
            body: JSON.stringify({
              model: "google/gemini-2.0-flash-001",
              max_tokens: 512,
              messages: [
                {
                  role: "user",
                  content: `Summarize what this cluster of web pages from the domain "${domain}" is about in 2-3 sentences. Focus on the common theme and key topics.\n\nPages:\n${tabList}`,
                },
              ],
            }),
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data = await response.json();
        const text =
          data.choices?.[0]?.message?.content ?? "No summary available.";
        setClusterSummary({ domain, text });
      } catch {
        setClusterSummary({
          domain,
          text: "Failed to generate summary. Please try again.",
        });
      } finally {
        setSummarizing(false);
      }
    },
    [getClusterNodes]
  );

  // Dismiss context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  // Group nodes by domain, sorted by visit count
  const groupedNodes = useMemo(() => {
    const groups = new Map<string, GraphNode[]>();
    const sorted = [...graphData.nodes].sort(
      (a, b) => b.visitCount - a.visitCount
    );
    for (const node of sorted) {
      const list = groups.get(node.domain) ?? [];
      list.push(node);
      groups.set(node.domain, list);
    }
    // Sort groups by total visit count
    return [...groups.entries()].sort(
      (a, b) =>
        b[1].reduce((s, n) => s + n.visitCount, 0) -
        a[1].reduce((s, n) => s + n.visitCount, 0)
    );
  }, [graphData.nodes]);

  const isEmpty = graphData.nodes.length === 0;

  return (
    <section aria-label="Tab Graph" className="mb-2">
      <div className="flex items-center">
        <button
          onClick={() => setCollapsed((prev) => !prev)}
          className="flex items-center gap-1.5 flex-1 px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:bg-gray-100 dark:hover:bg-arc-surface-hover"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-3 h-3 transition-transform ${collapsed ? "" : "rotate-90"}`}
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
              clipRule="evenodd"
            />
          </svg>
          Tab Graph
        </button>
        {!collapsed && !isEmpty && (
          <button
            onClick={toggleViewMode}
            title={
              viewMode === "graph"
                ? "Switch to list view"
                : "Switch to graph view"
            }
            className="px-2 py-1 mr-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          >
            {viewMode === "graph" ? (
              /* List icon */
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-3.5 h-3.5"
              >
                <path
                  fillRule="evenodd"
                  d="M6 4.75A.75.75 0 0 1 6.75 4h10.5a.75.75 0 0 1 0 1.5H6.75A.75.75 0 0 1 6 4.75ZM6 10a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H6.75A.75.75 0 0 1 6 10Zm0 5.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H6.75a.75.75 0 0 1-.75-.75ZM1.99 4.75a1 1 0 0 1 1-1h.01a1 1 0 0 1 0 2h-.01a1 1 0 0 1-1-1ZM2.99 9a1 1 0 1 0 0 2h.01a1 1 0 1 0 0-2h-.01ZM1.99 15.25a1 1 0 0 1 1-1h.01a1 1 0 0 1 0 2h-.01a1 1 0 0 1-1-1Z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              /* Graph icon */
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-3.5 h-3.5"
              >
                <path d="M15.5 2A1.5 1.5 0 0 0 14 3.5v13a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 16.5 2h-1ZM9.5 6A1.5 1.5 0 0 0 8 7.5v9A1.5 1.5 0 0 0 9.5 18h1a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 10.5 6h-1ZM3.5 10A1.5 1.5 0 0 0 2 11.5v5A1.5 1.5 0 0 0 3.5 18h1A1.5 1.5 0 0 0 6 16.5v-5A1.5 1.5 0 0 0 4.5 10h-1Z" />
              </svg>
            )}
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="px-3 py-1">
          {isEmpty ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 py-4 text-center">
              No browsing data yet. Start browsing to see your tab
              relationships.
            </p>
          ) : viewMode === "list" ? (
            /* List View */
            <div className="max-h-[300px] overflow-y-auto">
              {groupedNodes.map(([domain, nodes]) => (
                <div key={domain} className="mb-2">
                  <div className="flex items-center gap-1.5 py-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: getDomainColor(domain, domainColorMap),
                      }}
                    />
                    {domain}
                    <span className="text-gray-300 dark:text-gray-600">
                      ({nodes.length})
                    </span>
                  </div>
                  {nodes.map((node) => (
                    <button
                      key={node.id}
                      onClick={() => handleNodeClick(node)}
                      className="flex items-center gap-2 w-full px-2 py-1 text-xs rounded hover:bg-gray-100 dark:hover:bg-arc-surface-hover text-left"
                    >
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${node.domain}&sz=16`}
                        alt=""
                        className="w-3 h-3 flex-shrink-0"
                      />
                      <span className="flex-1 truncate text-gray-700 dark:text-gray-300">
                        {truncate(node.title || node.url, 50)}
                      </span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                        {node.visitCount}
                      </span>
                      {node.isOpen && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0"
                          title="Tab open"
                        />
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="relative">
              <svg
                width={GRAPH_WIDTH}
                height={GRAPH_HEIGHT}
                className="w-full rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-arc-surface"
                viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
              >
                {/* Edges */}
                {layout.edges.map((edge, i) => (
                  <line
                    key={i}
                    x1={edge.x1}
                    y1={edge.y1}
                    x2={edge.x2}
                    y2={edge.y2}
                    stroke={edge.type === "navigation" ? "#94A3B8" : "#CBD5E1"}
                    strokeWidth={1}
                    strokeOpacity={0.2 + 0.8 * (edge.weight / maxWeight)}
                    strokeDasharray={edge.type === "switch" ? "4,2" : undefined}
                  />
                ))}

                {/* Nodes */}
                {layout.nodes.map((node) => {
                  const color = domainColorMap.get(node.domain) ?? "#94A3B8";
                  const radius = node.isOpen ? 7 : 5;
                  return (
                    <g key={node.id}>
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={radius}
                        fill={color}
                        fillOpacity={0.8}
                        stroke={node.isOpen ? "#fff" : "none"}
                        strokeWidth={node.isOpen ? 1.5 : 0}
                        className="cursor-pointer"
                        onClick={() => handleNodeClick(node)}
                        onContextMenu={(e) => handleNodeContextMenu(node, e)}
                        onMouseEnter={(e) => handleNodeMouseEnter(node, e)}
                        onMouseLeave={handleNodeMouseLeave}
                      />
                    </g>
                  );
                })}
              </svg>

              {/* Tooltip */}
              {hoveredNode && tooltipPos && (
                <div
                  className="absolute pointer-events-none z-50 px-2 py-1 text-xs bg-gray-900 text-white rounded shadow-lg whitespace-nowrap"
                  style={{
                    left: tooltipPos.x,
                    top: tooltipPos.y - 32,
                    transform: "translateX(-50%)",
                  }}
                >
                  <div className="font-medium">
                    {truncate(hoveredNode.title, 40)}
                  </div>
                  <div className="text-gray-300">
                    {hoveredNode.visitCount} visit
                    {hoveredNode.visitCount !== 1 ? "s" : ""}
                    {hoveredNode.isOpen && " \u00B7 Open"}
                  </div>
                </div>
              )}

              {/* Context Menu */}
              {contextMenu && (
                <div
                  ref={contextMenuRef}
                  className="absolute z-50 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]"
                  style={{
                    left: contextMenu.x,
                    top: contextMenu.y,
                  }}
                >
                  <div className="px-2 py-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    {contextMenu.domain} (
                    {getClusterNodes(contextMenu.domain).length} pages)
                  </div>
                  <button
                    onClick={() => handleCreateFolder(contextMenu.domain)}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-3.5 h-3.5"
                    >
                      <path d="M3.75 3A1.75 1.75 0 0 0 2 4.75v3.26a3.235 3.235 0 0 1 1.75-.51h12.5c.644 0 1.245.188 1.75.51V6.75A1.75 1.75 0 0 0 16.25 5h-4.836a.25.25 0 0 1-.177-.073L9.823 3.513A1.75 1.75 0 0 0 8.586 3H3.75ZM3.75 9A1.75 1.75 0 0 0 2 10.75v4.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0 0 18 15.25v-4.5A1.75 1.75 0 0 0 16.25 9H3.75Z" />
                    </svg>
                    Create Folder
                  </button>
                  <button
                    onClick={() => handleAISummarize(contextMenu.domain)}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-3.5 h-3.5"
                    >
                      <path
                        fillRule="evenodd"
                        d="M15.988 3.012A2.25 2.25 0 0 1 18 5.25v6.5A2.25 2.25 0 0 1 15.75 14H13.5l-3.712 3.712a.75.75 0 0 1-1.288-.532V14h-2.25A2.25 2.25 0 0 1 4 11.75v-6.5A2.25 2.25 0 0 1 6.25 3h9.5Zm-3.738 6.988a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM10 10a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-2.25-.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
                        clipRule="evenodd"
                      />
                    </svg>
                    AI Summarize
                  </button>
                </div>
              )}

              {/* Cluster Summary */}
              {(summarizing || clusterSummary) && (
                <div className="mt-2 p-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  {summarizing ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500 animate-pulse">
                      Summarizing cluster...
                    </p>
                  ) : clusterSummary ? (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">
                          {clusterSummary.domain} summary
                        </span>
                        <button
                          onClick={() => setClusterSummary(null)}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="w-3 h-3"
                          >
                            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                          </svg>
                        </button>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-300">
                        {clusterSummary.text}
                      </p>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
