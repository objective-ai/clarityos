/**
 * lib/supabase/middleware.ts
 *
 * Middleware helper for Supabase Auth session refresh and route protection.
 * Uses getUser() for server-side JWT verification (not the local-only
 * alternative which can be spoofed).
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session and protects tenant routes.
 *
 * - Unauthenticated requests to tenant routes redirect to /login?returnTo=...
 * - Authenticated requests to /login redirect to /{tenantId}/dashboard
 * - All other requests pass through with refreshed cookies
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write cookies to the request (for downstream middleware/pages)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Write cookies to the response (for the browser)
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Use getUser() for server-side JWT verification.
  // The local-only alternative can be spoofed and must NOT be used here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Routes that should NOT be protected
  const isPublicRoute =
    pathname === "/login" ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  // If not authenticated and trying to access a protected route, redirect to login
  if (!user && !isPublicRoute && pathname !== "/") {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If authenticated and visiting /login, redirect to dashboard
  if (user && pathname === "/login") {
    const tenantId =
      user.app_metadata?.tenant_id ?? "demo-clinic";
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = `/${tenantId}/dashboard`;
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return supabaseResponse;
}
