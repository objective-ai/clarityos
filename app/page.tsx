import { redirect } from "next/navigation";

/**
 * app/page.tsx
 *
 * Root landing page — redirects to /login.
 * Authenticated users will be redirected to their tenant dashboard by middleware.
 */
export default function Home() {
  redirect("/login");
}
