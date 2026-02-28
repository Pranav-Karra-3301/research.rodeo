"use client";

import { create } from "zustand";

export interface AuthUser {
  sub: string;
  name?: string;
  nickname?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
  [key: string]: unknown;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;

  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isLoading: true,

  setUser: (user) => set({ user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
}));

/** Get sanitized user ID for storage keys. */
export function getStorageUserId(): string | null {
  const user = useAuthStore.getState().user;
  if (!user?.sub) return null;
  return user.sub.replace(/\|/g, "_");
}
