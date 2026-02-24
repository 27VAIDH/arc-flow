import type { NavigationEvent, NavTreeNode } from "./types";
import { getNavEventsSince } from "./navigationDb";

/**
 * Build navigation trees from raw events.
 * Trees are formed by chaining events via referrerTabId.
 * Orphan events (no referrer match) become root nodes.
 * Result sorted by timestamp (newest first).
 */
export function buildNavigationTree(events: NavigationEvent[]): NavTreeNode[] {
  // Index events by their tabId for referrer lookup
  const eventsByTabId = new Map<number, NavigationEvent[]>();
  for (const event of events) {
    const list = eventsByTabId.get(event.tabId) ?? [];
    list.push(event);
    eventsByTabId.set(event.tabId, list);
  }

  // Build a map of event id -> NavTreeNode
  const nodeMap = new Map<string, NavTreeNode>();
  for (const event of events) {
    nodeMap.set(event.id, { event, children: [] });
  }

  const childIds = new Set<string>();

  // Link children to parents via referrerTabId
  for (const event of events) {
    if (event.referrerTabId == null) continue;

    const parentEvents = eventsByTabId.get(event.referrerTabId);
    if (!parentEvents || parentEvents.length === 0) continue;

    // Find the best parent: the most recent event on the referrer tab
    // that occurred before this event
    let bestParent: NavigationEvent | null = null;
    for (const candidate of parentEvents) {
      if (candidate.timestamp <= event.timestamp) {
        if (!bestParent || candidate.timestamp > bestParent.timestamp) {
          bestParent = candidate;
        }
      }
    }

    if (bestParent) {
      const parentNode = nodeMap.get(bestParent.id);
      const childNode = nodeMap.get(event.id);
      if (parentNode && childNode) {
        parentNode.children.push(childNode);
        childIds.add(event.id);
      }
    }
  }

  // Root nodes are those not claimed as children
  const roots: NavTreeNode[] = [];
  for (const event of events) {
    if (!childIds.has(event.id)) {
      const node = nodeMap.get(event.id);
      if (node) roots.push(node);
    }
  }

  // Sort roots by timestamp, newest first
  roots.sort((a, b) => b.event.timestamp - a.event.timestamp);

  // Sort children within each node by timestamp (oldest first for natural reading order)
  function sortChildren(node: NavTreeNode): void {
    node.children.sort((a, b) => a.event.timestamp - b.event.timestamp);
    for (const child of node.children) {
      sortChildren(child);
    }
  }
  for (const root of roots) {
    sortChildren(root);
  }

  return roots;
}

/**
 * Get navigation trees for a given time range.
 * Fetches events from IndexedDB since `start`, filters to `end`, and builds trees.
 */
export async function getTreesForTimeRange(
  start: number,
  end: number,
): Promise<NavTreeNode[]> {
  const events = await getNavEventsSince(start);
  const filtered = events.filter((e) => e.timestamp <= end);
  return buildNavigationTree(filtered);
}
