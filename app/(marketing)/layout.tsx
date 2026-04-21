import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import MarketingNav from "@/app/_components/marketing/MarketingNav";
import MarketingFooter from "@/app/_components/marketing/MarketingFooter";
import { COLORS, FONT_FAMILIES } from "./_data/marketingTokens";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const tenantSlug = user.app_metadata?.tenant_slug ?? "clinic";
    redirect(`/${tenantSlug}/dashboard`);
  }

  return (
    <div
      style={{
        background: COLORS.pageBg,
        color: COLORS.text,
        minHeight: "100vh",
        fontFamily: FONT_FAMILIES.body,
      }}
    >
      <MarketingNav />
      {children}
      <MarketingFooter />
    </div>
  );
}
