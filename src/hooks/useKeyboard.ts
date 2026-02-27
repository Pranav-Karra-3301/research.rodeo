"use client";

import { useEffect } from "react";

interface KeyboardActions {
  onToggleSearch?: () => void;
  onClosePanel?: () => void;
  onToggleExport?: () => void;
  onToggleChat?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSelectAll?: () => void;
  onDeleteSelected?: () => void;
}

export function useKeyboard(actions: KeyboardActions) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Cmd+K -> toggle search (works even in inputs)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        actions.onToggleSearch?.();
        return;
      }

      // Cmd+E -> toggle export
      if ((e.metaKey || e.ctrlKey) && e.key === "e") {
        e.preventDefault();
        actions.onToggleExport?.();
        return;
      }

      // Cmd+/ -> toggle chat
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        actions.onToggleChat?.();
        return;
      }

      // Cmd+Shift+Z -> redo (check before Cmd+Z)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "z") {
        if (isInput) return;
        e.preventDefault();
        actions.onRedo?.();
        return;
      }

      // Cmd+Z -> undo
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "z") {
        if (isInput) return;
        e.preventDefault();
        actions.onUndo?.();
        return;
      }

      // Cmd+A -> select all nodes
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        if (isInput) return;
        e.preventDefault();
        actions.onSelectAll?.();
        return;
      }

      // Skip remaining shortcuts when typing in an input
      if (isInput) return;

      // Escape -> close panels
      if (e.key === "Escape") {
        e.preventDefault();
        actions.onClosePanel?.();
        return;
      }

      // Delete/Backspace -> delete selected nodes (multi-select aware)
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        actions.onDeleteSelected?.();
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actions]);
}
