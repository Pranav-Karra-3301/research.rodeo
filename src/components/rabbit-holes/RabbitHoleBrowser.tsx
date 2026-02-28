"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Plus, Search, ChevronDown, Trash2, Edit2, Check, X, Lock, Globe } from "lucide-react";
import { RabbitIcon } from "@/components/rabbit-holes/RabbitIcon";
import { motion, AnimatePresence } from "framer-motion";
import { nanoid } from "nanoid";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { useRabbitHoleStore, type RabbitHole, type RabbitHoleVisibility } from "@/store/rabbit-hole-store";
import { animation } from "@/lib/design-tokens";
import { useUser } from "@auth0/nextjs-auth0/client";

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

/** Claim a rabbit hole for the current user. */
async function claimHoleForUser(rabbitHoleId: string, visibility: RabbitHoleVisibility = "private") {
  try {
    await fetch("/api/user/rabbit-holes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rabbitHoleId, visibility }),
    });
  } catch (err) {
    console.warn("[RabbitHoleBrowser] Failed to claim hole:", err);
  }
}

/** Toggle visibility of a rabbit hole. */
async function toggleVisibility(rabbitHoleId: string, newVisibility: RabbitHoleVisibility) {
  try {
    await fetch("/api/user/rabbit-holes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rabbitHoleId, visibility: newVisibility, action: "set-visibility" }),
    });
  } catch (err) {
    console.warn("[RabbitHoleBrowser] Failed to update visibility:", err);
  }
}

export function RabbitHoleBrowser() {
  const rabbitHoles = useRabbitHoleStore((s) => s.rabbitHoles);
  const currentRabbitHoleId = useRabbitHoleStore((s) => s.currentRabbitHoleId);
  const setCurrentRabbitHoleId = useRabbitHoleStore((s) => s.setCurrentRabbitHoleId);
  const dbConnection = useRabbitHoleStore((s) => s.dbConnection);
  const isDbConnected = useRabbitHoleStore((s) => s.isDbConnected);
  const { user } = useUser();

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [ownedHoleIds, setOwnedHoleIds] = useState<Map<string, RabbitHoleVisibility>>(new Map());

  // Fetch user's owned rabbit holes on mount
  useEffect(() => {
    if (!user) return;
    fetch("/api/user/rabbit-holes")
      .then((res) => res.json())
      .then((data: { rabbitHoles?: Array<{ rabbitHoleId: string; visibility: RabbitHoleVisibility }> }) => {
        const map = new Map<string, RabbitHoleVisibility>();
        for (const rh of data.rabbitHoles ?? []) {
          map.set(rh.rabbitHoleId, rh.visibility);
        }
        setOwnedHoleIds(map);
      })
      .catch(() => {});
  }, [user]);

  const currentHole = useMemo(
    () => rabbitHoles.find((h) => h.id === currentRabbitHoleId),
    [rabbitHoles, currentRabbitHoleId]
  );

  const filteredHoles = useMemo(() => {
    if (!searchQuery.trim()) return rabbitHoles;
    const q = searchQuery.toLowerCase();
    return rabbitHoles.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        (h.rootQuery?.toLowerCase().includes(q) ?? false)
    );
  }, [rabbitHoles, searchQuery]);

  const sortedHoles = useMemo(
    () => [...filteredHoles].sort((a, b) => b.createdAt - a.createdAt),
    [filteredHoles]
  );

  const handleCreate = useCallback(() => {
    if (!dbConnection) return;
    const id = nanoid(10);
    const name = `Rabbit Hole ${rabbitHoles.length + 1}`;
    dbConnection.reducers.createRabbitHole({ id, name, rootQuery: undefined });
    setCurrentRabbitHoleId(id);
    setIsOpen(false);
    // Claim ownership
    void claimHoleForUser(id, "private");
    setOwnedHoleIds((prev) => new Map(prev).set(id, "private"));
  }, [dbConnection, rabbitHoles.length, setCurrentRabbitHoleId]);

  const handleOpen = useCallback(
    (id: string) => {
      setCurrentRabbitHoleId(id);
      setIsOpen(false);
    },
    [setCurrentRabbitHoleId]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (!dbConnection) return;
      dbConnection.reducers.deleteRabbitHole({ rabbitHoleId: id });
      // Unclaim ownership
      void fetch("/api/user/rabbit-holes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rabbitHoleId: id, action: "unclaim" }),
      }).catch(() => {});
      setOwnedHoleIds((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    },
    [dbConnection]
  );

  const handleToggleVisibility = useCallback(
    (e: React.MouseEvent, hole: RabbitHole) => {
      e.stopPropagation();
      const current = ownedHoleIds.get(hole.id) ?? "private";
      const next: RabbitHoleVisibility = current === "private" ? "public" : "private";
      void toggleVisibility(hole.id, next);
      setOwnedHoleIds((prev) => new Map(prev).set(hole.id, next));
    },
    [ownedHoleIds]
  );

  const startEdit = useCallback((e: React.MouseEvent, hole: RabbitHole) => {
    e.stopPropagation();
    setEditingId(hole.id);
    setEditingName(hole.name);
  }, []);

  const commitEdit = useCallback(
    (id: string) => {
      if (!dbConnection || !editingName.trim()) return;
      dbConnection.reducers.updateRabbitHole({
        rabbitHoleId: id,
        name: editingName.trim(),
        rootQuery: undefined,
      });
      setEditingId(null);
    },
    [dbConnection, editingName]
  );

  const cancelEdit = useCallback(() => setEditingId(null), []);

  if (!isDbConnected) {
    return (
      <div className="px-3 py-2 border-b border-[#e8e7e2]">
        <div className="flex items-center gap-2 text-[11px] text-[#a8a29e]">
          <RabbitIcon className="w-3.5 h-3.5" />
          <span>Connecting...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-[#e8e7e2]">
      {/* Current hole header / trigger */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#f3f2ee]/60 transition-colors"
      >
        <RabbitIcon className="w-5 h-5 text-[#7c3aed]" />
        <span className="flex-1 text-left text-[12px] font-medium text-[#1c1917] truncate flex items-center gap-1">
          {currentHole?.name ?? (rabbitHoles.length === 0 ? "Start a Rabbit Hole" : "Select Rabbit Hole")}
          {currentHole && (
            ownedHoleIds.get(currentHole.id) === "public"
              ? <Globe className="w-3 h-3 text-[#a8a29e] shrink-0" />
              : <Lock className="w-3 h-3 text-[#a8a29e] shrink-0" />
          )}
        </span>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={animation.fast}>
          <ChevronDown className="w-3.5 h-3.5 text-[#78716c]" />
        </motion.div>
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={animation.fast}
            className="overflow-hidden"
          >
            <div className="px-2 pb-2 space-y-1.5">
              {/* Search */}
              <div className="relative mt-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#a8a29e]" />
                <Input
                  placeholder="Search rabbit holes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 pl-6 text-[11px] bg-[#f3f2ee] border-[#dddcd7]"
                />
              </div>

              {/* Create new */}
              <button
                onClick={handleCreate}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] font-medium text-[#7c3aed] hover:bg-[#7c3aed]/8 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                New rabbit hole
              </button>

              {/* List */}
              {sortedHoles.length === 0 ? (
                <div className="text-center py-3 text-[11px] text-[#a8a29e]">
                  {searchQuery ? "No matches" : "No rabbit holes yet"}
                </div>
              ) : (
                <div className="space-y-0.5 max-h-56 overflow-y-auto">
                  {sortedHoles.map((hole) => (
                    <div
                      key={hole.id}
                      onClick={() => editingId !== hole.id && handleOpen(hole.id)}
                      className={cn(
                        "group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
                        hole.id === currentRabbitHoleId
                          ? "bg-[#7c3aed]/10 text-[#7c3aed]"
                          : "hover:bg-[#f3f2ee]/60 text-[#1c1917]"
                      )}
                    >
                      {editingId === hole.id ? (
                        <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                          <input
                            autoFocus
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit(hole.id);
                              if (e.key === "Escape") cancelEdit();
                            }}
                            className="flex-1 min-w-0 text-[11px] bg-white border border-[#dddcd7] rounded px-1 py-0.5 outline-none focus:border-[#7c3aed]"
                          />
                          <button onClick={() => commitEdit(hole.id)} className="p-0.5 text-green-600 hover:text-green-700">
                            <Check className="w-3 h-3" />
                          </button>
                          <button onClick={cancelEdit} className="p-0.5 text-[#78716c] hover:text-[#1c1917]">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-medium truncate">{hole.name}</div>
                            {hole.rootQuery && (
                              <div className="text-[10px] text-[#a8a29e] truncate">{hole.rootQuery}</div>
                            )}
                          </div>
                          <span className="text-[10px] text-[#a8a29e] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            {formatRelativeTime(hole.createdAt)}
                          </span>
                          <button
                            onClick={(e) => handleToggleVisibility(e, hole)}
                            className="p-0.5 text-[#a8a29e] hover:text-[#44403c] opacity-0 group-hover:opacity-100 transition-opacity"
                            title={ownedHoleIds.get(hole.id) === "public" ? "Public — click to make private" : "Private — click to make public"}
                          >
                            {ownedHoleIds.get(hole.id) === "public" ? (
                              <Globe className="w-3 h-3" />
                            ) : (
                              <Lock className="w-3 h-3" />
                            )}
                          </button>
                          <button
                            onClick={(e) => startEdit(e, hole)}
                            className="p-0.5 text-[#a8a29e] hover:text-[#44403c] opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => handleDelete(e, hole.id)}
                            className="p-0.5 text-[#a8a29e] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
