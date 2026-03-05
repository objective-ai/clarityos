"use client";

/**
 * app/login/page.tsx
 *
 * Glassmorphism login page for ClarityOS EHR.
 * Uses Supabase signInWithPassword. Redirects to returnTo URL on success.
 * No sign-up link (admin-created accounts only).
 */

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError("Invalid email or password");
        setIsLoading(false);
        return;
      }

      // Redirect to returnTo URL or root (middleware will resolve tenant dashboard)
      router.push(returnTo ?? "/");
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md px-4 animate-enter">
      <div className="glass-card p-8 sm:p-10">
        {/* Logo / App Name */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 bg-[var(--accent-dim)] border border-[var(--mono-border)]">
            <svg width="24" height="24" viewBox="0 0 16 16" fill="none">
              <circle
                cx="8"
                cy="8"
                r="3"
                stroke="var(--accent)"
                strokeWidth="1.4"
              />
              <path
                d="M8 2v2M8 12v2M2 8h2M12 8h2"
                stroke="var(--accent)"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h1 className="text-heading text-[var(--text-primary)]">
            ClarityOS
          </h1>
          <p className="text-caption text-[var(--text-secondary)] mt-1">
            Sign in to your account
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="block text-caption font-medium text-[var(--text-secondary)] mb-1.5"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="glass-input w-full"
              placeholder="name@clinic.com"
              disabled={isLoading}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-caption font-medium text-[var(--text-secondary)] mb-1.5"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="glass-input w-full"
              placeholder="Enter your password"
              disabled={isLoading}
            />
          </div>

          {/* Error Display */}
          {error && (
            <p
              role="alert"
              className="text-sm text-red-500 dark:text-red-400"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Signing in...
              </span>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
