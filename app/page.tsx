import { redirect } from "next/navigation";

/**
 * app/page.tsx
 *
 * Root landing page — redirects to the demo clinic dashboard.
 * In production this would redirect to /login or a marketing page.
 */
export default function Home() {
  redirect("/demo-clinic/dashboard");
}
