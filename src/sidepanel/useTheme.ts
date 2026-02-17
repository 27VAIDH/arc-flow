import { useEffect, useState } from "react";
import { getSettings, updateSettings } from "../shared/settingsStorage";
import type { Settings } from "../shared/types";

export type ThemePreference = "system" | "light" | "dark";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function lightenColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lighten = (c: number) => Math.min(255, Math.round(c + (255 - c) * 0.2));
  return `#${lighten(r).toString(16).padStart(2, "0")}${lighten(g).toString(16).padStart(2, "0")}${lighten(b).toString(16).padStart(2, "0")}`;
}

const DEFAULT_PANEL_BG = "rgba(15,15,23,0.78)";

function applyPanelColor(color: string): void {
  if (!color) {
    document.documentElement.style.setProperty(
      "--color-arc-panel-bg",
      DEFAULT_PANEL_BG
    );
    document.documentElement.style.setProperty(
      "--color-arc-panel-bg-secondary",
      DEFAULT_PANEL_BG
    );
    return;
  }
  // Append C7 hex alpha (78% opacity) to custom panel colors
  const withAlpha = color.length === 7 ? color + "C7" : color;
  document.documentElement.style.setProperty("--color-arc-panel-bg", withAlpha);
  document.documentElement.style.setProperty(
    "--color-arc-panel-bg-secondary",
    withAlpha
  );
}

function applyAccentColor(color: string): void {
  document.documentElement.style.setProperty("--color-arc-accent", color);
  document.documentElement.style.setProperty(
    "--color-arc-accent-hover",
    lightenColor(color)
  );
}

function applyTheme(preference: ThemePreference): void {
  const resolved = preference === "system" ? getSystemTheme() : preference;
  const isDark = resolved === "dark";
  document.documentElement.classList.toggle("dark", isDark);
  // Also set on body for robustness in extension contexts
  document.body?.classList.toggle("dark", isDark);
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemePreference>("system");

  // Load initial theme and accent color from settings storage
  useEffect(() => {
    getSettings().then((s) => {
      setThemeState(s.theme);
      applyTheme(s.theme);
      if (s.accentColor) {
        applyAccentColor(s.accentColor);
      }
      applyPanelColor(s.panelColor ?? "");
    });
  }, []);

  // Listen for storage changes on the "settings" key
  useEffect(() => {
    const handler = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === "local" && changes.settings) {
        const newSettings = changes.settings.newValue as Settings | undefined;
        if (newSettings?.theme) {
          setThemeState(newSettings.theme);
          applyTheme(newSettings.theme);
        }
        if (newSettings?.accentColor) {
          applyAccentColor(newSettings.accentColor);
        }
        if (newSettings) {
          applyPanelColor(newSettings.panelColor ?? "");
        }
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  // Apply theme whenever it changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Listen for system theme changes when in "system" mode
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (theme === "system") {
        applyTheme("system");
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = (next: ThemePreference) => {
    setThemeState(next);
    applyTheme(next);
    updateSettings({ theme: next });
  };

  const cycleTheme = () => {
    const order: ThemePreference[] = ["system", "light", "dark"];
    const nextIndex = (order.indexOf(theme) + 1) % order.length;
    setTheme(order[nextIndex]);
  };

  return { theme, setTheme, cycleTheme };
}
