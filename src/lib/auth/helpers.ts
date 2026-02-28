/**
 * Auth helper utilities for server-side code.
 */
import { auth0 } from "./client";

/** Get the current user session or null. */
export async function getSession() {
  return auth0.getSession();
}

/** Get the current user or null. */
export async function getUser() {
  const session = await auth0.getSession();
  return session?.user ?? null;
}

/** Get user ID (Auth0 sub claim) or null. */
export async function getUserId(): Promise<string | null> {
  const user = await getUser();
  return user?.sub ?? null;
}

/** Require authentication — throws redirect if not logged in. */
export async function requireUser() {
  const user = await getUser();
  if (!user) {
    throw new Error("Authentication required");
  }
  return user;
}

/** Sanitize user ID for use in storage keys (replace pipe with underscore). */
export function sanitizeUserId(sub: string): string {
  return sub.replace(/\|/g, "_");
}
