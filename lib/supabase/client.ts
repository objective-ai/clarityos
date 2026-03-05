/**
 * lib/supabase/client.ts
 *
 * Browser-side Supabase client factory using @supabase/ssr.
 * Used in client components: login form, AuthProvider, LogoutButton.
 *
 * NOTE: This is distinct from the legacy lib/supabase.ts singleton.
 * All new auth code should import from this file.
 */

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
