"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/store/themeStore";
import { useTenantCustomizationStore } from "@/store/tenantCustomizationStore";
import { hexToRgb, lightenHex } from "@/lib/color-utils";

export function ThemeProvider() {
  const theme = useThemeStore((s) => s.theme);
  const accentColor = useTenantCustomizationStore((s) => s.accentColor);

  // Theme sync
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Accent color sync
  useEffect(() => {
    const { r, g, b } = hexToRgb(accentColor);
    const root = document.documentElement.style;

    root.setProperty("--accent", accentColor);
    root.setProperty("--accent-dim", `rgba(${r}, ${g}, ${b}, 0.10)`);
    root.setProperty("--accent-hover", lightenHex(accentColor, 0.15));
    root.setProperty("--accent-glow", `rgba(${r}, ${g}, ${b}, 0.15)`);
    root.setProperty("--accent-strong", `rgba(${r}, ${g}, ${b}, 0.25)`);
    root.setProperty("--mono-bg", `rgba(${r}, ${g}, ${b}, 0.05)`);
    root.setProperty("--mono-border", `rgba(${r}, ${g}, ${b}, 0.20)`);
    root.setProperty("--border-glow", `rgba(${r}, ${g}, ${b}, 0.20)`);
    root.setProperty("--shadow-glow", `0 0 20px rgba(${r}, ${g}, ${b}, 0.08)`);
  }, [accentColor]);

  return null;
}
