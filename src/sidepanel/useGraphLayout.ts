import { useMemo } from "react";
import type {
  GraphData,
  LayoutResult,
  LayoutNode,
  LayoutEdge,
} from "../shared/types";

const REPULSION = 500;
const ATTRACTION = 0.01;
const DAMPING = 0.9;
const ITERATIONS = 100;
const MIN_DISTANCE = 1;

interface NodePosition {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function computeLayout(
  data: GraphData,
  width: number,
  height: number
): LayoutResult {
  if (data.nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  // Initialize positions randomly within bounds
  const positions: NodePosition[] = data.nodes.map(() => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: 0,
    vy: 0,
  }));

  // Build adjacency lookup for attraction
  const edgeIndices: Array<{ source: number; target: number }> = [];
  const nodeIdToIndex = new Map<string, number>();
  data.nodes.forEach((node, i) => nodeIdToIndex.set(node.id, i));

  for (const edge of data.edges) {
    const si = nodeIdToIndex.get(edge.source);
    const ti = nodeIdToIndex.get(edge.target);
    if (si !== undefined && ti !== undefined) {
      edgeIndices.push({ source: si, target: ti });
    }
  }

  // Run force-directed iterations
  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Repulsion between all node pairs
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = positions[i].x - positions[j].x;
        const dy = positions[i].y - positions[j].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), MIN_DISTANCE);
        const force = REPULSION / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        positions[i].vx += fx;
        positions[i].vy += fy;
        positions[j].vx -= fx;
        positions[j].vy -= fy;
      }
    }

    // Attraction along edges
    for (const { source, target } of edgeIndices) {
      const dx = positions[target].x - positions[source].x;
      const dy = positions[target].y - positions[source].y;
      const fx = dx * ATTRACTION;
      const fy = dy * ATTRACTION;
      positions[source].vx += fx;
      positions[source].vy += fy;
      positions[target].vx -= fx;
      positions[target].vy -= fy;
    }

    // Apply velocities with damping and clamp to bounds
    const padding = 20;
    for (const pos of positions) {
      pos.vx *= DAMPING;
      pos.vy *= DAMPING;
      pos.x += pos.vx;
      pos.y += pos.vy;
      pos.x = Math.max(padding, Math.min(width - padding, pos.x));
      pos.y = Math.max(padding, Math.min(height - padding, pos.y));
    }
  }

  // Build layout nodes
  const layoutNodes: LayoutNode[] = data.nodes.map((node, i) => ({
    ...node,
    x: positions[i].x,
    y: positions[i].y,
  }));

  // Build layout edges
  const layoutEdges: LayoutEdge[] = data.edges
    .map((edge) => {
      const si = nodeIdToIndex.get(edge.source);
      const ti = nodeIdToIndex.get(edge.target);
      if (si === undefined || ti === undefined) return null;
      return {
        ...edge,
        x1: positions[si].x,
        y1: positions[si].y,
        x2: positions[ti].x,
        y2: positions[ti].y,
      };
    })
    .filter((e): e is LayoutEdge => e !== null);

  return { nodes: layoutNodes, edges: layoutEdges };
}

export function useGraphLayout(
  data: GraphData,
  width: number,
  height: number
): LayoutResult {
  return useMemo(
    () => computeLayout(data, width, height),
    [data, width, height]
  );
}
