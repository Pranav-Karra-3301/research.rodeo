import { nanoid } from "nanoid";
import { useGraphStore } from "@/store/graph-store";
import type { AnnotationNode, AnnotationType } from "@/types";

/**
 * Create an annotation node, positioning it near the attached graph node if available.
 * Shared between the useAnnotations hook and chat auto-execution.
 */
export function createAnnotation(
  type: AnnotationType,
  content: string,
  attachedToNodeId?: string,
  clusterId?: string
): AnnotationNode {
  const node = attachedToNodeId
    ? useGraphStore.getState().nodes.get(attachedToNodeId)
    : undefined;

  return {
    id: `annotation-${nanoid(8)}`,
    type,
    content,
    position: node
      ? { x: node.position.x + 200, y: node.position.y - 50 }
      : { x: Math.random() * 400, y: Math.random() * 400 },
    attachedToNodeId,
    clusterId,
    createdAt: Date.now(),
  };
}
