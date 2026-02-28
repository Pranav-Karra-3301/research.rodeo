import { nanoid } from "nanoid";
import { useGraphStore } from "@/store/graph-store";
import type { AnnotationNode, AnnotationType } from "@/types";
import { getAnnotationNodeDimensions, getNodeDimensions } from "@/lib/visual/importance-size";

/**
 * Create an annotation node, positioning it near the attached graph node if available.
 * Shared between the useAnnotations hook and chat auto-execution.
 * Placement tries up to 8 candidate spots around the anchor to avoid overlapping
 * existing paper nodes and existing annotation nodes.
 */
export function createAnnotation(
  type: AnnotationType,
  content: string,
  attachedToNodeId?: string,
  clusterId?: string
): AnnotationNode {
  const state = useGraphStore.getState();
  const anchor = attachedToNodeId ? state.nodes.get(attachedToNodeId) : undefined;
  const annotDims = getAnnotationNodeDimensions(type);

  let position: { x: number; y: number };

  if (anchor) {
    // Candidate offsets (right, upper-right, below, upper-left, left, etc.)
    const candidates: Array<{ dx: number; dy: number }> = [
      { dx:  230, dy:  -60 },
      { dx:  230, dy:   80 },
      { dx:    0, dy:  200 },
      { dx: -230, dy:  -60 },
      { dx: -230, dy:   80 },
      { dx:  230, dy: -160 },
      { dx:    0, dy: -200 },
      { dx:  400, dy:    0 },
    ];

    position = { x: anchor.position.x + 230, y: anchor.position.y - 60 };

    for (const { dx, dy } of candidates) {
      const candidate = { x: anchor.position.x + dx, y: anchor.position.y + dy };
      if (!overlapsExisting(candidate, annotDims, state)) {
        position = candidate;
        break;
      }
    }
  } else {
    // No anchor: place near the centroid of existing nodes with some scatter
    const allNodes = Array.from(state.nodes.values());
    if (allNodes.length > 0) {
      const cx = allNodes.reduce((s, n) => s + n.position.x, 0) / allNodes.length;
      const cy = allNodes.reduce((s, n) => s + n.position.y, 0) / allNodes.length;
      const angle = Math.random() * Math.PI * 2;
      const radius = 300 + Math.random() * 150;
      position = { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
    } else {
      position = { x: Math.random() * 400, y: Math.random() * 400 };
    }
  }

  return {
    id: `annotation-${nanoid(8)}`,
    type,
    content,
    position,
    attachedToNodeId,
    clusterId,
    createdAt: Date.now(),
  };
}

/** Returns true if placing an annotation at `pos` with `dims` would overlap an existing node. */
function overlapsExisting(
  pos: { x: number; y: number },
  dims: { width: number; height: number },
  state: ReturnType<typeof useGraphStore.getState>
): boolean {
  const pad = 12;
  const ax1 = pos.x - pad, ay1 = pos.y - pad;
  const ax2 = pos.x + dims.width + pad, ay2 = pos.y + dims.height + pad;

  for (const n of state.nodes.values()) {
    if (n.state === "archived") continue;
    const nd = getNodeDimensions(n.data.citationCount, n.scores.relevance);
    const nx1 = n.position.x, ny1 = n.position.y;
    const nx2 = nx1 + nd.width, ny2 = ny1 + nd.height;
    if (ax1 < nx2 && ax2 > nx1 && ay1 < ny2 && ay2 > ny1) return true;
  }

  for (const a of state.annotationNodes.values()) {
    const ad = getAnnotationNodeDimensions(a.type);
    const ax1e = a.position.x - pad, ay1e = a.position.y - pad;
    const ax2e = ax1e + ad.width + 2 * pad, ay2e = ay1e + ad.height + 2 * pad;
    if (ax1 < ax2e && ax2 > ax1e && ay1 < ay2e && ay2 > ay1e) return true;
  }

  return false;
}
