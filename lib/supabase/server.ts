import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Create a Supabase client for use in Server Components, Route Handlers,
 * and Server Actions. Uses cookie-based auth via @supabase/ssr.
 *
 * IMPORTANT: This client is read-only for cookies in Route Handlers.
 * For middleware (which can write cookies for token refresh), use a
 * separate middleware client.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Route handlers are read-only for cookies.
          // Cookie refresh is handled by middleware instead.
        },
      },
    }
  );
}
