"use client";

import { useState, useRef, useCallback } from "react";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useCurrentTenant } from "@/store/sessionStore";
import { useThemeStore } from "@/store/themeStore";
import {
  useTenantCustomizationStore,
  DEFAULT_ACCENT,
} from "@/store/tenantCustomizationStore";
import { contrastRatio, meetsAALarge } from "@/lib/color-utils";
import type { ThemePreference } from "@/store/themeStore";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRESET_COLORS = [
  { hex: "#2DD4BF", label: "Teal" },
  { hex: "#60A5FA", label: "Blue" },
  { hex: "#818CF8", label: "Indigo" },
  { hex: "#A78BFA", label: "Purple" },
  { hex: "#F472B6", label: "Pink" },
  { hex: "#FB923C", label: "Orange" },
  { hex: "#FBBF24", label: "Amber" },
  { hex: "#34D399", label: "Emerald" },
];

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  {
    value: "light",
    label: "Light",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.7 3.7l1.4 1.4M10.9 10.9l1.4 1.4M3.7 12.3l1.4-1.4M10.9 5.1l1.4-1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M13 9a5.5 5.5 0 01-7-7A5.5 5.5 0 1013 9z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const { requireRole } = useEntitlements();
  const tenant = useCurrentTenant();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const logoUrl = useTenantCustomizationStore((s) => s.logoUrl);
  const accentColor = useTenantCustomizationStore((s) => s.accentColor);
  const setLogo = useTenantCustomizationStore((s) => s.setLogo);
  const setAccentColor = useTenantCustomizationStore((s) => s.setAccentColor);
  const resetToDefaults = useTenantCustomizationStore((s) => s.resetToDefaults);

  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!requireRole("admin", "owner")) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center glass-card p-10">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="3" y="8" width="14" height="10" rx="2" stroke="var(--text-muted)" strokeWidth="1.4" />
              <path d="M6 8V6a4 4 0 018 0v2" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="text-subhead mb-2">Settings Locked</h2>
          <p className="text-caption text-[var(--text-muted)]">
            Only clinic admins and owners can access settings.
          </p>
        </div>
      </div>
    );
  }

  const handleFile = useCallback(
    (file: File) => {
      setUploadError(null);
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setUploadError("Invalid format. Use PNG, JPG, or SVG.");
        return;
      }
      if (file.size > MAX_LOGO_SIZE) {
        setUploadError("File too large. Maximum 2 MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setLogo(reader.result as string);
      reader.readAsDataURL(file);
    },
    [setLogo]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile]
  );

  const darkBg = "#06080D";
  const lightBg = "#F8F9FC";
  const passesOnDark = meetsAALarge(accentColor, darkBg);
  const passesOnLight = meetsAALarge(accentColor, lightBg);
  const ratio = Math.min(
    contrastRatio(accentColor, darkBg),
    contrastRatio(accentColor, lightBg)
  );
  const passesAA = passesOnDark && passesOnLight;

  return (
    <div className="flex flex-col gap-8 max-w-3xl stagger">
      <div>
        <h1 className="text-display text-2xl">Settings</h1>
        <p className="text-body mt-1">{tenant?.clinicName ?? "Clinic"} configuration</p>
      </div>

      {/* Branding */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[16px]">Branding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <div className="text-overline mb-1">Clinic Name</div>
            <div className="text-sm text-[var(--text-primary)]">
              {tenant?.clinicName ?? "\u2014"}
            </div>
          </div>

          <div>
            <div className="text-overline mb-2">Clinic Logo</div>
            {logoUrl ? (
              <div className="flex items-center gap-4">
                <img
                  src={logoUrl}
                  alt="Clinic logo"
                  className="w-16 h-16 rounded-xl object-cover border border-[var(--border-default)]"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Change
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setLogo(null);
                      setUploadError(null);
                    }}
                    className="text-[var(--text-muted)] hover:text-[var(--state-critical)]"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center py-8 rounded-xl cursor-pointer transition-all border-2 border-dashed ${
                  dragOver
                    ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                    : "border-[var(--border-default)] hover:border-[var(--border-strong)]"
                }`}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[var(--text-muted)]">
                  <path d="M12 16V4M12 4l-4 4M12 4l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-sm mt-2 text-[var(--text-secondary)]">
                  Drop logo here or click to upload
                </span>
                <span className="text-[11px] mt-1 text-[var(--text-muted)]">
                  PNG, JPG, or SVG &mdash; max 2 MB
                </span>
              </div>
            )}

            {uploadError && (
              <p className="text-xs mt-2 text-[var(--state-critical)]">{uploadError}</p>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.svg"
              onChange={handleFileInput}
              className="hidden"
            />
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[16px]">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Theme selector — glass segmented control */}
          <div>
            <div className="text-overline mb-3">Theme</div>
            <div className="inline-flex rounded-xl overflow-hidden border border-[var(--glass-border)] bg-[var(--bg-glass)]">
              {THEME_OPTIONS.map((opt) => {
                const active = theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTheme(opt.value)}
                    className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-all ${
                      active
                        ? "bg-[var(--accent-dim)] text-[var(--accent)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                    style={{
                      borderRight: opt.value !== "dark" ? "1px solid var(--glass-border)" : undefined,
                    }}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Accent color picker */}
          <div>
            <div className="text-overline mb-3">Accent Color</div>
            <div className="flex items-center gap-3 flex-wrap">
              {PRESET_COLORS.map((preset) => {
                const active = accentColor.toUpperCase() === preset.hex.toUpperCase();
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    title={preset.label}
                    onClick={() => setAccentColor(preset.hex)}
                    className={`relative flex items-center justify-center rounded-full transition-all w-9 h-9 ${
                      active ? "ring-2 ring-[var(--text-primary)] ring-offset-2 ring-offset-[var(--bg-base)]" : ""
                    }`}
                    style={{ background: preset.hex }}
                  >
                    {active && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M3 7l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                );
              })}

              <label className="flex items-center gap-2 cursor-pointer" title="Custom color">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-9 h-9 rounded-full cursor-pointer border-2 border-[var(--border-default)] p-0 bg-transparent"
                />
                <span className="text-xs text-[var(--text-muted)]">Custom</span>
              </label>
            </div>

            {/* Contrast indicator */}
            <div className="flex items-center gap-2 mt-3">
              <Badge variant={passesAA ? "success" : "destructive"}>
                AA {passesAA ? "\u2713" : "\u2717"}
              </Badge>
              <span className="text-[11px] text-[var(--text-muted)]">
                Contrast {ratio.toFixed(1)}:1 against both backgrounds
              </span>
            </div>
          </div>

          {/* Reset */}
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                resetToDefaults();
                setTheme("dark");
              }}
            >
              Reset to Defaults
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
