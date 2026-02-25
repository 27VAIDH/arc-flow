import type {
  NavigationEvent,
  GraphNode,
  GraphEdge,
  GraphData,
  TabInfo,
} from "./types";

const MAX_NODES = 50;

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function buildGraphData(
  navEvents: NavigationEvent[],
  affinityPairs: { from: number; to: number; count: number }[],
  openTabs: TabInfo[]
): GraphData {
  const openTabUrls = new Map(openTabs.map((t) => [t.id, t.url]));

  // Build node map keyed by URL
  const nodeMap = new Map<
    string,
    {
      url: string;
      domain: string;
      title: string;
      visitCount: number;
      isOpen: boolean;
    }
  >();

  for (const event of navEvents) {
    const existing = nodeMap.get(event.url);
    if (existing) {
      existing.visitCount++;
      if (!existing.title && event.title) {
        existing.title = event.title;
      }
    } else {
      nodeMap.set(event.url, {
        url: event.url,
        domain: getDomain(event.url),
        title: event.title || event.url,
        visitCount: 1,
        isOpen: false,
      });
    }
  }

  // Mark open tabs and ensure they're in the node map
  for (const tab of openTabs) {
    if (!tab.url) continue;
    const existing = nodeMap.get(tab.url);
    if (existing) {
      existing.isOpen = true;
      if (!existing.title && tab.title) {
        existing.title = tab.title;
      }
    } else {
      nodeMap.set(tab.url, {
        url: tab.url,
        domain: getDomain(tab.url),
        title: tab.title || tab.url,
        visitCount: 0,
        isOpen: true,
      });
    }
  }

  // Cap at MAX_NODES — keep highest visitCount
  let entries = Array.from(nodeMap.entries());
  if (entries.length > MAX_NODES) {
    entries.sort((a, b) => b[1].visitCount - a[1].visitCount);
    entries = entries.slice(0, MAX_NODES);
  }

  // Build final nodes with stable IDs
  const keptUrls = new Set(entries.map(([url]) => url));
  const nodes: GraphNode[] = entries.map(([url, data]) => ({
    id: url,
    url: data.url,
    domain: data.domain,
    title: data.title,
    visitCount: data.visitCount,
    isOpen: data.isOpen,
  }));

  // Build navigation edges from referrerTabId chains
  const edgeWeightMap = new Map<
    string,
    {
      source: string;
      target: string;
      weight: number;
      type: "navigation" | "switch";
    }
  >();

  // Map tabId → most recent URL for that tab (for navigation edges)
  const tabIdToUrl = new Map<number, string>();
  // Sort events by timestamp to build correct tabId→URL mapping
  const sortedEvents = [...navEvents].sort((a, b) => a.timestamp - b.timestamp);

  for (const event of sortedEvents) {
    if (
      event.referrerTabId !== undefined &&
      tabIdToUrl.has(event.referrerTabId)
    ) {
      const sourceUrl = tabIdToUrl.get(event.referrerTabId)!;
      const targetUrl = event.url;
      if (
        sourceUrl !== targetUrl &&
        keptUrls.has(sourceUrl) &&
        keptUrls.has(targetUrl)
      ) {
        const key = `nav:${sourceUrl}|${targetUrl}`;
        const existing = edgeWeightMap.get(key);
        if (existing) {
          existing.weight++;
        } else {
          edgeWeightMap.set(key, {
            source: sourceUrl,
            target: targetUrl,
            weight: 1,
            type: "navigation",
          });
        }
      }
    }
    tabIdToUrl.set(event.tabId, event.url);
  }

  // Build switch edges from affinity pairs
  // Map tabId → URL using the most recent event or open tab
  for (const pair of affinityPairs) {
    const fromUrl = tabIdToUrl.get(pair.from) ?? openTabUrls.get(pair.from);
    const toUrl = tabIdToUrl.get(pair.to) ?? openTabUrls.get(pair.to);
    if (
      fromUrl &&
      toUrl &&
      fromUrl !== toUrl &&
      keptUrls.has(fromUrl) &&
      keptUrls.has(toUrl)
    ) {
      const key = `switch:${fromUrl}|${toUrl}`;
      const existing = edgeWeightMap.get(key);
      if (existing) {
        existing.weight += pair.count;
      } else {
        edgeWeightMap.set(key, {
          source: fromUrl,
          target: toUrl,
          weight: pair.count,
          type: "switch",
        });
      }
    }
  }

  const edges: GraphEdge[] = Array.from(edgeWeightMap.values());

  return { nodes, edges };
}
