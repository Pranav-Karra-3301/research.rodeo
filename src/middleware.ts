import { NextResponse, type NextRequest } from "next/server";
import { auth0 } from "@/lib/auth/client";

/**
 * Auth0 middleware: protects all routes except public ones.
 * Unauthenticated users are redirected to /auth/login.
 */
export async function middleware(request: NextRequest) {
  const authRes = await auth0.middleware(request);

  // Auth0 handled this request (callback, login, logout routes)
  if (request.nextUrl.pathname.startsWith("/auth/")) {
    return authRes;
  }

  // Check session for protected routes
  const session = await auth0.getSession(request);
  if (!session) {
    // API routes get 401, pages get redirect
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  return authRes;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico, og images, static assets
     * - public files (images, fonts, etc.)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|rodeo\\.png|horse\\.png|og-preview\\.jpg|video).*)",
  ],
};
