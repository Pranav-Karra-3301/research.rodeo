"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { persistUpdateNodeNotes, parsePersistedNotes } from "@/lib/db/graph-actions";
import { useTimelineStore } from "@/store/timeline-store";
import type { PaperNode } from "@/types";

interface Props {
  node: PaperNode;
}

export function ReaderNotesTab({ node }: Props) {
  // Parse persisted notes (which may contain encoded tags)
  const parsed = parsePersistedNotes(node.userNotes);
  const [notes, setNotes] = useState(parsed.notes);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(node.userTags ?? parsed.tags);

  // Refs to track latest values for the debounced save
  const notesRef = useRef(notes);
  const tagsRef = useRef(tags);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nodeIdRef = useRef(node.id);
  const nodeTitleRef = useRef(node.data.title);

  useEffect(() => {
    nodeTitleRef.current = node.data.title;
  }, [node.data.title]);

  const flushPendingSave = useCallback(() => {
    if (!debounceRef.current) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = null;
    persistUpdateNodeNotes(nodeIdRef.current, notesRef.current, tagsRef.current);
    useTimelineStore.getState().addEvent({
      type: "note",
      summary: `Updated notes on "${nodeTitleRef.current}"`,
      nodeId: nodeIdRef.current,
    });
  }, []);

  const scheduleSave = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      persistUpdateNodeNotes(nodeIdRef.current, notesRef.current, tagsRef.current);
      useTimelineStore.getState().addEvent({
        type: "note",
        summary: `Updated notes on "${nodeTitleRef.current}"`,
        nodeId: nodeIdRef.current,
      });
      debounceRef.current = null;
    }, 500);
  }, []);

  // Flush on unmount and before switching to a different node.
  useEffect(() => {
    return flushPendingSave;
  }, [node.id, flushPendingSave]);

  const handleNotesChange = useCallback(
    (value: string) => {
      setNotes(value);
      notesRef.current = value;
      scheduleSave();
    },
    [scheduleSave]
  );

  const handleAddTag = useCallback(() => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      const next = [...tags, t];
      setTags(next);
      tagsRef.current = next;
      setTagInput("");
      scheduleSave();
    }
  }, [tagInput, tags, scheduleSave]);

  const handleRemoveTag = useCallback(
    (tag: string) => {
      const next = tags.filter((t) => t !== tag);
      setTags(next);
      tagsRef.current = next;
      scheduleSave();
    },
    [tags, scheduleSave]
  );

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        <div>
          <h3 className="text-xs font-medium text-[#78716c] uppercase tracking-wider mb-2">
            Notes
          </h3>
          <textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Write notes about this paper..."
            className="w-full h-40 bg-white border border-[#dddcd7] rounded-lg px-3 py-2 text-sm text-[#44403c] placeholder:text-[#a8a29e] resize-none focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>

        <div>
          <h3 className="text-xs font-medium text-[#78716c] uppercase tracking-wider mb-2">
            Tags
          </h3>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="bg-[#f3f2ee] text-[#44403c] rounded-full px-3 py-1 text-xs flex items-center gap-1"
              >
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="text-[#78716c] hover:text-[#44403c]"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
              placeholder="Add tag..."
              className="flex-1 bg-white border border-[#dddcd7] rounded-lg px-3 py-1.5 text-xs text-[#44403c] placeholder:text-[#a8a29e] focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <Button variant="outline" size="sm" onClick={handleAddTag}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
