/**
 * Auth0 server-side client singleton.
 * Import from server components & API routes only.
 *
 * All /auth/* routes are handled by the middleware via auth0.middleware().
 * Default routes: /auth/login, /auth/logout, /auth/callback, /auth/profile
 */
import { Auth0Client } from "@auth0/nextjs-auth0/server";

export const auth0 = new Auth0Client({
  signInReturnToPath: "/",
  authorizationParameters: {
    scope: "openid profile email",
  },
  session: {
    rolling: true,
    absoluteDuration: 60 * 60 * 24 * 7, // 7 days
    inactivityDuration: 60 * 60 * 24,   // 1 day
  },
});
