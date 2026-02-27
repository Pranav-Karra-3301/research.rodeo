"use client";

import { useState, useRef, useCallback } from "react";
import type { PaperMetadata } from "@/types";

interface UseSearchReturn {
  results: PaperMetadata[];
  isSearching: boolean;
  error: string | null;
  search: (query: string) => void;
  clear: () => void;
}

export function useSearch(debounceMs: number = 300): UseSearchReturn {
  const [results, setResults] = useState<PaperMetadata[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(
    (query: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      if (!query.trim()) {
        setResults([]);
        setIsSearching(false);
        setError(null);
        return;
      }

      timerRef.current = setTimeout(async () => {
        // Abort any in-flight request
        if (abortRef.current) {
          abortRef.current.abort();
        }
        const controller = new AbortController();
        abortRef.current = controller;

        setIsSearching(true);
        setError(null);

        try {
          const res = await fetch("/api/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, limit: 20 }),
            signal: controller.signal,
          });

          if (!res.ok) {
            throw new Error(`Search failed: ${res.statusText}`);
          }

          const data = await res.json();
          if (data.status === "success" && data.data?.papers) {
            setResults(data.data.papers);
          } else {
            setResults([]);
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setError(err instanceof Error ? err.message : "Search failed");
          setResults([]);
        } finally {
          setIsSearching(false);
        }
      }, debounceMs);
    },
    [debounceMs]
  );

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();
    setResults([]);
    setIsSearching(false);
    setError(null);
  }, []);

  return { results, isSearching, error, search, clear };
}
