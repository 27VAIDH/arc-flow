import { useCallback, useEffect, useMemo, useState } from "react";
import type { GraphData, GraphNode, LayoutNode } from "../shared/types";
import { buildGraphData } from "../shared/tabGraphStorage";
import { getNavEventsSince } from "../shared/navigationDb";
import { getAffinityPairs } from "../shared/affinityStorage";
import { useGraphLayout } from "./useGraphLayout";

const GRAPH_WIDTH = 320;
const GRAPH_HEIGHT = 280;

const DOMAIN_COLORS = [
  "#4285F4", "#EA4335", "#FBBC05", "#34A853",
  "#FF6D01", "#46BDC6", "#7B61FF", "#F538A0",
  "#00ACC1", "#8D6E63",
];

function getDomainColor(domain: string, domainMap: Map<string, string>): string {
  if (domainMap.has(domain)) return domainMap.get(domain)!;
  const color = DOMAIN_COLORS[domainMap.size % DOMAIN_COLORS.length];
  domainMap.set(domain, color);
  return color;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\u2026";
}

export default function TabGraphSection() {
  const [collapsed, setCollapsed] = useState(false);
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [hoveredNode, setHoveredNode] = useState<LayoutNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const loadGraphData = useCallback(async () => {
    try {
      const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const [navEvents, affinityPairs, tabs] = await Promise.all([
        getNavEventsSince(since),
        getAffinityPairs(1),
        new Promise<chrome.tabs.Tab[]>((resolve) => chrome.tabs.query({}, resolve)),
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
      const rect = (event.currentTarget as Element).closest("svg")?.getBoundingClientRect();
      if (rect) {
        setTooltipPos({ x: event.clientX - rect.left, y: event.clientY - rect.top });
      }
    },
    []
  );

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
    setTooltipPos(null);
  }, []);

  const isEmpty = graphData.nodes.length === 0;

  return (
    <section aria-label="Tab Graph" className="mb-2">
      <button
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:bg-gray-100 dark:hover:bg-arc-surface-hover"
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

      {!collapsed && (
        <div className="px-3 py-1">
          {isEmpty ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 py-4 text-center">
              No browsing data yet. Start browsing to see your tab relationships.
            </p>
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
                  <div className="font-medium">{truncate(hoveredNode.title, 40)}</div>
                  <div className="text-gray-300">
                    {hoveredNode.visitCount} visit{hoveredNode.visitCount !== 1 ? "s" : ""}
                    {hoveredNode.isOpen && " \u00B7 Open"}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
