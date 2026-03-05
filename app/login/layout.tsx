/**
 * app/login/layout.tsx
 *
 * Login layout -- standalone route outside the (tenant) layout group.
 * Full viewport height with ambient gradient background matching the
 * tenant layout aesthetic. No Sidebar or TopNav.
 */

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen ambient-bg flex items-center justify-center">
      {children}
    </div>
  );
}
