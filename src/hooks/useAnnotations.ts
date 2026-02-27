"use client";

import { useCallback } from "react";
import { useGraphStore } from "@/store/graph-store";
import { createAnnotation } from "@/lib/graph/annotations";

export function useAnnotations() {
  const addInsight = useCallback((attachedToNodeId?: string, content?: string) => {
    const annotation = createAnnotation("insight", content || "New insight...", attachedToNodeId);
    useGraphStore.getState().addAnnotation(annotation);
  }, []);

  const addDeadEnd = useCallback((nodeId: string, reason?: string) => {
    const annotation = createAnnotation("dead-end", reason || "Dead end", nodeId);
    useGraphStore.getState().addAnnotation(annotation);
  }, []);

  const addKeyFind = useCallback((nodeId: string, description?: string) => {
    const annotation = createAnnotation("key-find", description || "Key finding", nodeId);
    useGraphStore.getState().addAnnotation(annotation);
  }, []);

  const addQuestion = useCallback((content: string, attachedToNodeId?: string) => {
    const annotation = createAnnotation("question", content, attachedToNodeId);
    useGraphStore.getState().addAnnotation(annotation);
  }, []);

  const addSummary = useCallback((clusterId: string, content: string) => {
    const annotation = createAnnotation("summary", content, undefined, clusterId);
    useGraphStore.getState().addAnnotation(annotation);
  }, []);

  const removeAnnotation = useCallback((id: string) => {
    useGraphStore.getState().removeAnnotation(id);
  }, []);

  const updateAnnotation = useCallback((id: string, content: string) => {
    useGraphStore.getState().updateAnnotation(id, content);
  }, []);

  return {
    addInsight,
    addDeadEnd,
    addKeyFind,
    addQuestion,
    addSummary,
    removeAnnotation,
    updateAnnotation,
  };
}
