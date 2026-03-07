import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * app/page.tsx
 *
 * Root landing page — auth-aware redirect.
 * Authenticated users go to their tenant dashboard.
 * Unauthenticated users go to /login.
 */
export default async function Home() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const tenantSlug = user.app_metadata?.tenant_slug ?? "clinic";
    redirect(`/${tenantSlug}/dashboard`);
  }

  redirect("/login");
}
