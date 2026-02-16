import { useEffect, useState } from "react";
import type { Settings, Workspace } from "../shared/types";
import {
  getSettings,
  updateSettings,
  resetSettings,
} from "../shared/settingsStorage";
import { getWorkspaces } from "../shared/workspaceStorage";
import {
  AUTO_ARCHIVE_OPTIONS,
  SUSPEND_THRESHOLD_OPTIONS,
  THEME_OPTIONS,
  AI_PROVIDER_OPTIONS,
} from "../shared/constants";

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | number;
  options: readonly { label: string; value: string | number }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-sm text-gray-700 dark:text-arc-text-primary shrink-0">
        {label}
      </label>
      <select
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm bg-white dark:bg-arc-surface border border-gray-300 dark:border-arc-border rounded-lg px-2 py-1 text-gray-900 dark:text-arc-text-primary min-w-[120px] transition-colors duration-150"
      >
        {options.map((opt) => (
          <option key={String(opt.value)} value={String(opt.value)}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  useEffect(() => {
    getSettings().then(setSettings);
    getWorkspaces().then(setWorkspaces);
  }, []);

  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === "local" && changes.settings) {
        const newSettings = changes.settings.newValue as Settings | undefined;
        if (newSettings) setSettings(newSettings);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleUpdate = (data: Partial<Settings>) => {
    if (!settings) return;
    const updated = { ...settings, ...data };
    setSettings(updated);
    updateSettings(data);
  };

  const handleReset = () => {
    if (window.confirm("Reset all settings to their default values?")) {
      resetSettings().then(setSettings);
    }
  };

  if (!settings) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col bg-gray-50 dark:bg-arc-bg"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/80 dark:border-arc-border">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-arc-text-primary tracking-tight">
          Settings
        </h2>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:text-arc-text-secondary dark:hover:text-gray-200 rounded-lg transition-colors duration-150"
          aria-label="Close settings"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>
      </div>

      {/* Settings Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {/* Appearance */}
        <section>
          <h3 className="text-[11px] font-semibold text-gray-400 dark:text-arc-text-secondary uppercase tracking-wider mb-3">
            Appearance
          </h3>
          <div className="space-y-3">
            <SelectField
              label="Theme"
              value={settings.theme}
              options={THEME_OPTIONS}
              onChange={(v) =>
                handleUpdate({
                  theme: v as Settings["theme"],
                })
              }
            />
            <div>
              <label className="text-sm text-gray-700 dark:text-arc-text-primary block mb-2">
                Accent Color
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  "#2E75B6", "#EF4444", "#F97316", "#EAB308",
                  "#22C55E", "#14B8A6", "#06B6D4", "#6366f1",
                  "#A855F7", "#EC4899", "#78716C", "#64748B",
                ].map((color) => (
                  <button
                    key={color}
                    onClick={() => {
                      handleUpdate({ accentColor: color });
                      // Apply immediately without waiting for storage roundtrip
                      document.documentElement.style.setProperty("--color-arc-accent", color);
                      const r = parseInt(color.slice(1, 3), 16);
                      const g = parseInt(color.slice(3, 5), 16);
                      const b = parseInt(color.slice(5, 7), 16);
                      const lighten = (c: number) => Math.min(255, Math.round(c + (255 - c) * 0.2));
                      const hover = `#${lighten(r).toString(16).padStart(2, "0")}${lighten(g).toString(16).padStart(2, "0")}${lighten(b).toString(16).padStart(2, "0")}`;
                      document.documentElement.style.setProperty("--color-arc-accent-hover", hover);
                    }}
                    className={`w-6 h-6 rounded-full focus:outline-none focus:ring-2 focus:ring-arc-accent/50 transition-transform duration-100 hover:scale-110 ${
                      settings.accentColor?.toLowerCase() === color.toLowerCase()
                        ? "ring-2 ring-offset-1 ring-gray-400 dark:ring-offset-arc-surface"
                        : ""
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                    aria-label={`Select accent color ${color}${settings.accentColor === color ? " (selected)" : ""}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Tab Management */}
        <section>
          <h3 className="text-[11px] font-semibold text-gray-400 dark:text-arc-text-secondary uppercase tracking-wider mb-3">
            Tab Management
          </h3>
          <div className="space-y-3">
            <SelectField
              label="Auto-archive after"
              value={settings.autoArchiveMinutes}
              options={AUTO_ARCHIVE_OPTIONS}
              onChange={(v) =>
                handleUpdate({ autoArchiveMinutes: parseInt(v, 10) })
              }
            />
            <SelectField
              label="Suspend after"
              value={settings.suspendAfterMinutes}
              options={SUSPEND_THRESHOLD_OPTIONS}
              onChange={(v) =>
                handleUpdate({ suspendAfterMinutes: parseInt(v, 10) })
              }
            />
          </div>
        </section>

        {/* Focus Mode */}
        <section>
          <h3 className="text-[11px] font-semibold text-gray-400 dark:text-arc-text-secondary uppercase tracking-wider mb-3">
            Focus Mode
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm text-gray-700 dark:text-arc-text-primary shrink-0">
                Enable focus mode
              </label>
              <button
                onClick={() => {
                  const updated = {
                    ...settings.focusMode,
                    enabled: !settings.focusMode.enabled,
                  };
                  handleUpdate({ focusMode: updated });
                  chrome.runtime.sendMessage({
                    type: "UPDATE_FOCUS_MODE",
                    enabled: updated.enabled,
                    redirectRules: updated.redirectRules,
                  });
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  settings.focusMode.enabled
                    ? "bg-red-600"
                    : "bg-gray-300 dark:bg-arc-surface-hover"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    settings.focusMode.enabled
                      ? "translate-x-4"
                      : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-arc-text-secondary">
              When enabled, navigating to blocked URLs will redirect to the
              configured productive URL.
            </p>
            {settings.focusMode.enabled &&
              (settings.focusMode.redirectRules.length === 0 ||
                settings.focusMode.redirectRules.every(
                  (r) => !r.blockedPattern.trim() || !r.redirectUrl.trim()
                )) && (
                <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Add redirect rules below for focus mode to take effect.
                  </p>
                </div>
              )}
            {settings.focusMode.redirectRules.map((rule, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={rule.blockedPattern}
                  onChange={(e) => {
                    const rules = [...settings.focusMode.redirectRules];
                    rules[index] = {
                      ...rules[index],
                      blockedPattern: e.target.value,
                    };
                    const updated = {
                      ...settings.focusMode,
                      redirectRules: rules,
                    };
                    handleUpdate({ focusMode: updated });
                  }}
                  placeholder="*twitter.com*"
                  className="text-sm bg-white dark:bg-arc-surface border border-gray-300 dark:border-arc-border rounded-lg px-2 py-1 text-gray-900 dark:text-arc-text-primary transition-colors duration-150 flex-1 min-w-0"
                />
                <input
                  type="text"
                  value={rule.redirectUrl}
                  onChange={(e) => {
                    const rules = [...settings.focusMode.redirectRules];
                    rules[index] = {
                      ...rules[index],
                      redirectUrl: e.target.value,
                    };
                    const updated = {
                      ...settings.focusMode,
                      redirectRules: rules,
                    };
                    handleUpdate({ focusMode: updated });
                  }}
                  placeholder="https://notion.so"
                  className="text-sm bg-white dark:bg-arc-surface border border-gray-300 dark:border-arc-border rounded-lg px-2 py-1 text-gray-900 dark:text-arc-text-primary transition-colors duration-150 flex-1 min-w-0"
                />
                <button
                  onClick={() => {
                    const rules = settings.focusMode.redirectRules.filter(
                      (_, i) => i !== index
                    );
                    const updated = {
                      ...settings.focusMode,
                      redirectRules: rules,
                    };
                    handleUpdate({ focusMode: updated });
                    chrome.runtime.sendMessage({
                      type: "UPDATE_FOCUS_MODE",
                      enabled: settings.focusMode.enabled,
                      redirectRules: rules,
                    });
                  }}
                  className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 dark:hover:text-red-400 shrink-0"
                  aria-label="Delete rule"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    className="w-3.5 h-3.5"
                  >
                    <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                  </svg>
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const rules = [
                    ...settings.focusMode.redirectRules,
                    { blockedPattern: "", redirectUrl: "" },
                  ];
                  handleUpdate({
                    focusMode: { ...settings.focusMode, redirectRules: rules },
                  });
                }}
                className="text-sm text-arc-accent dark:text-arc-accent-hover hover:text-indigo-700 dark:hover:text-indigo-300"
              >
                + Add Redirect Rule
              </button>
            </div>
          </div>
        </section>

        {/* AI Grouping */}
        <section>
          <h3 className="text-[11px] font-semibold text-gray-400 dark:text-arc-text-secondary uppercase tracking-wider mb-3">
            AI-Enhanced Grouping
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <label className="text-sm text-gray-700 dark:text-arc-text-primary shrink-0">
                Enable AI grouping
              </label>
              <button
                onClick={() =>
                  handleUpdate({
                    aiGrouping: {
                      ...settings.aiGrouping,
                      enabled: !settings.aiGrouping.enabled,
                    },
                  })
                }
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  settings.aiGrouping.enabled
                    ? "bg-arc-accent"
                    : "bg-gray-300 dark:bg-arc-surface-hover"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    settings.aiGrouping.enabled
                      ? "translate-x-4"
                      : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            {settings.aiGrouping.enabled && (
              <>
                <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Privacy: Only tab titles and URLs are sent to the AI
                    provider. No page content is shared.
                  </p>
                </div>
                <SelectField
                  label="Provider"
                  value={settings.aiGrouping.provider ?? ""}
                  options={AI_PROVIDER_OPTIONS}
                  onChange={(v) =>
                    handleUpdate({
                      aiGrouping: {
                        ...settings.aiGrouping,
                        provider:
                          v === "anthropic" || v === "openai" ? v : null,
                      },
                    })
                  }
                />
                {settings.aiGrouping.provider && (
                  <div className="flex items-center justify-between gap-4">
                    <label className="text-sm text-gray-700 dark:text-arc-text-primary shrink-0">
                      API Key
                    </label>
                    <input
                      type="password"
                      value={settings.aiGrouping.apiKey}
                      onChange={(e) =>
                        handleUpdate({
                          aiGrouping: {
                            ...settings.aiGrouping,
                            apiKey: e.target.value,
                          },
                        })
                      }
                      placeholder={
                        settings.aiGrouping.provider === "anthropic"
                          ? "sk-ant-..."
                          : "sk-..."
                      }
                      className="text-sm bg-white dark:bg-arc-surface border border-gray-300 dark:border-arc-border rounded-lg px-2 py-1 text-gray-900 dark:text-arc-text-primary transition-colors duration-150 min-w-[120px] w-full max-w-[180px]"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* Air Traffic Control */}
        <section>
          <h3 className="text-[11px] font-semibold text-gray-400 dark:text-arc-text-secondary uppercase tracking-wider mb-3">
            Air Traffic Control
          </h3>
          <div className="space-y-3">
            <p className="text-xs text-gray-500 dark:text-arc-text-secondary">
              Route new tabs to workspaces based on URL patterns. Use * as
              wildcard (e.g. *slack.com*).
            </p>
            {settings.routingRules.map((rule, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={rule.pattern}
                  onChange={(e) => {
                    const rules = [...settings.routingRules];
                    rules[index] = { ...rules[index], pattern: e.target.value };
                    handleUpdate({ routingRules: rules });
                  }}
                  placeholder="*example.com*"
                  className="text-sm bg-white dark:bg-arc-surface border border-gray-300 dark:border-arc-border rounded-lg px-2 py-1 text-gray-900 dark:text-arc-text-primary transition-colors duration-150 flex-1 min-w-0"
                />
                <select
                  value={rule.workspaceId}
                  onChange={(e) => {
                    const rules = [...settings.routingRules];
                    rules[index] = {
                      ...rules[index],
                      workspaceId: e.target.value,
                    };
                    handleUpdate({ routingRules: rules });
                  }}
                  className="text-sm bg-white dark:bg-arc-surface border border-gray-300 dark:border-arc-border rounded-lg px-2 py-1 text-gray-900 dark:text-arc-text-primary transition-colors duration-150 min-w-[100px]"
                >
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.emoji} {ws.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const rules = settings.routingRules.filter(
                      (_, i) => i !== index
                    );
                    handleUpdate({ routingRules: rules });
                  }}
                  className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 dark:hover:text-red-400 shrink-0"
                  aria-label="Delete rule"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    className="w-3.5 h-3.5"
                  >
                    <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                const rules = [
                  ...settings.routingRules,
                  {
                    pattern: "",
                    workspaceId: workspaces[0]?.id ?? "default",
                  },
                ];
                handleUpdate({ routingRules: rules });
              }}
              className="text-sm text-arc-accent dark:text-arc-accent-hover hover:text-indigo-700 dark:hover:text-indigo-300"
            >
              + Add Rule
            </button>
          </div>
        </section>

        {/* Reset */}
        <section className="pt-2">
          <button
            onClick={handleReset}
            className="w-full text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg px-3 py-2 text-center transition-colors duration-150"
          >
            Reset to Defaults
          </button>
        </section>
      </div>
    </div>
  );
}
